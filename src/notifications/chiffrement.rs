//! Le chiffrement des notifications du navigateur (Web Push).
//!
//! Un message destiné à un navigateur passe par le service de notifications de son
//! fabricant (Google, Mozilla, Apple…). Ce service ne doit rien pouvoir en lire : le message
//! est chiffré pour le seul navigateur, avec les clés qu'il a données en s'abonnant.
//!
//! * [`chiffrer`] : le chiffrement « aes128gcm » de la RFC 8291 (et RFC 8188).
//! * [`Vapid`] : la signature qui prouve au service que le message vient bien de ce site
//!   (RFC 8292). La paire de clés est dans `VAPID_PUBLIC` et `VAPID_PRIVATE`.
//!
//! Écrit à la main avec les bibliothèques RustCrypto, parce que la bibliothèque `web-push`
//! dépend d'OpenSSL, absent de la compilation sur Vercel. Le test compare le résultat à
//! l'exemple de l'annexe A de la RFC 8291.

use aes_gcm::aead::Aead;
use aes_gcm::{Aes128Gcm, KeyInit, Nonce};
use base64::Engine;
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use hkdf::Hkdf;
use p256::ecdsa::signature::Signer;
use p256::ecdsa::{Signature, SigningKey};
use p256::elliptic_curve::sec1::ToEncodedPoint;
use p256::{PublicKey, SecretKey};
use rand::Rng;
use sha2::Sha256;

use crate::erreur::Erreur;

/// La taille d'un enregistrement chiffré. Nos messages tiennent tous dans un seul.
const TAILLE_ENREGISTREMENT: u32 = 4096;
/// Une signature VAPID vaut 12 heures (le maximum permis est 24).
const SECONDES_VAPID: i64 = 12 * 3600;

/// Chiffre un message pour un navigateur, à partir des deux clés qu'il a données
/// en s'abonnant (`p256dh` et `auth`, en base64 sans remplissage).
pub fn chiffrer(message: &[u8], p256dh: &str, auth: &str) -> Result<Vec<u8>, Erreur> {
    let mut sel = [0u8; 16];
    rand::rng().fill(&mut sel);
    chiffrer_avec(message, &decoder(p256dh)?, &decoder(auth)?, &cle_au_hasard(), sel)
}

/// Le chiffrement lui-même, avec une clé éphémère et un sel donnés (pour le test).
fn chiffrer_avec(
    message: &[u8],
    cle_navigateur: &[u8],
    secret_auth: &[u8],
    cle_ephemere: &SecretKey,
    sel: [u8; 16],
) -> Result<Vec<u8>, Erreur> {
    let publique_navigateur =
        PublicKey::from_sec1_bytes(cle_navigateur).map_err(|_| Erreur::interne("clé p256dh invalide"))?;
    let publique_navigateur_octets = publique_navigateur.to_encoded_point(false);
    let publique_ephemere = cle_ephemere.public_key().to_encoded_point(false);

    // Le secret partagé entre le site et le navigateur.
    let partage = p256::ecdh::diffie_hellman(
        cle_ephemere.to_nonzero_scalar(),
        publique_navigateur.as_affine(),
    );

    // RFC 8291, § 3.4 : on y mêle le secret d'authentification du navigateur.
    let mut info_cle = b"WebPush: info\0".to_vec();
    info_cle.extend_from_slice(publique_navigateur_octets.as_bytes());
    info_cle.extend_from_slice(publique_ephemere.as_bytes());
    let mut ikm = [0u8; 32];
    Hkdf::<Sha256>::new(Some(secret_auth), partage.raw_secret_bytes())
        .expand(&info_cle, &mut ikm)
        .map_err(Erreur::interne)?;

    // RFC 8188 : la clé du contenu et le nonce.
    let hkdf = Hkdf::<Sha256>::new(Some(&sel), &ikm);
    let mut cle_contenu = [0u8; 16];
    let mut nonce = [0u8; 12];
    hkdf.expand(b"Content-Encoding: aes128gcm\0", &mut cle_contenu)
        .map_err(Erreur::interne)?;
    hkdf.expand(b"Content-Encoding: nonce\0", &mut nonce)
        .map_err(Erreur::interne)?;

    // Un seul enregistrement, donc le dernier : il se termine par l'octet 2.
    let mut clair = message.to_vec();
    clair.push(2);
    let chiffre = Aes128Gcm::new_from_slice(&cle_contenu)
        .map_err(Erreur::interne)?
        .encrypt(Nonce::from_slice(&nonce), clair.as_slice())
        .map_err(|_| Erreur::interne("chiffrement impossible"))?;

    // L'en-tête : le sel, la taille d'enregistrement, puis la clé publique éphémère.
    let mut corps = Vec::with_capacity(16 + 4 + 1 + 65 + chiffre.len());
    corps.extend_from_slice(&sel);
    corps.extend_from_slice(&TAILLE_ENREGISTREMENT.to_be_bytes());
    corps.push(publique_ephemere.as_bytes().len() as u8);
    corps.extend_from_slice(publique_ephemere.as_bytes());
    corps.extend_from_slice(&chiffre);
    Ok(corps)
}

/// La paire de clés VAPID du site, et l'adresse de contact donnée aux services.
pub struct Vapid {
    cle: SigningKey,
    publique: String,
    sujet: String,
}

impl Vapid {
    /// Lit `VAPID_PUBLIC`, `VAPID_PRIVATE` et `VAPID_SUJET`. Vide si elles manquent :
    /// les notifications du navigateur sont alors indisponibles.
    pub fn depuis_l_environnement() -> Result<Option<Self>, Erreur> {
        let (Ok(publique), Ok(privee)) = (std::env::var("VAPID_PUBLIC"), std::env::var("VAPID_PRIVATE"))
        else {
            return Ok(None);
        };
        let sujet = std::env::var("VAPID_SUJET")
            .map_err(|_| Erreur::interne("VAPID_SUJET manquant"))?;
        let cle = SigningKey::from_slice(&decoder(privee.trim())?)
            .map_err(|_| Erreur::interne("VAPID_PRIVATE invalide"))?;

        // La clé publique doit correspondre à la clé privée, sinon tout serait refusé.
        let attendue = URL_SAFE_NO_PAD.encode(cle.verifying_key().to_encoded_point(false).as_bytes());
        if attendue != publique.trim() {
            return Err(Erreur::interne("VAPID_PUBLIC ne correspond pas à VAPID_PRIVATE"));
        }
        Ok(Some(Self { cle, publique: attendue, sujet }))
    }

    /// La clé publique, que le navigateur demande pour s'abonner.
    pub fn publique(&self) -> &str {
        &self.publique
    }

    /// L'en-tête `Authorization` d'un envoi vers ce service de notifications.
    pub fn entete(&self, endpoint: &str, maintenant: i64) -> Result<String, Erreur> {
        let origine = reqwest::Url::parse(endpoint)
            .map_err(Erreur::interne)?
            .origin()
            .ascii_serialization();
        let entete = URL_SAFE_NO_PAD.encode(br#"{"typ":"JWT","alg":"ES256"}"#);
        let revendications = URL_SAFE_NO_PAD.encode(
            serde_json::json!({
                "aud": origine,
                "exp": maintenant + SECONDES_VAPID,
                "sub": self.sujet,
            })
            .to_string(),
        );
        let a_signer = format!("{entete}.{revendications}");
        let signature: Signature = self.cle.sign(a_signer.as_bytes());
        let jeton = format!("{a_signer}.{}", URL_SAFE_NO_PAD.encode(signature.to_bytes()));
        Ok(format!("vapid t={jeton}, k={}", self.publique))
    }
}

/// Une clé privée tirée au hasard.
fn cle_au_hasard() -> SecretKey {
    loop {
        let mut octets = [0u8; 32];
        rand::rng().fill(&mut octets);
        // Presque toujours valable : seuls 0 et les nombres au-delà de l'ordre de la courbe
        // sont refusés.
        if let Ok(cle) = SecretKey::from_slice(&octets) {
            return cle;
        }
    }
}

/// Le base64 des navigateurs : alphabet « url », avec ou sans remplissage.
fn decoder(texte: &str) -> Result<Vec<u8>, Erreur> {
    URL_SAFE_NO_PAD
        .decode(texte.trim_end_matches('='))
        .map_err(|_| Erreur::interne("clé en base64 invalide"))
}

#[cfg(test)]
mod tests {
    use p256::ecdsa::VerifyingKey;
    use p256::ecdsa::signature::Verifier;

    use super::*;

    /// L'exemple de l'annexe A de la RFC 8291.
    #[test]
    fn exemple_de_la_rfc_8291() {
        let message = decoder("V2hlbiBJIGdyb3cgdXAsIEkgd2FudCB0byBiZSBhIHdhdGVybWVsb24").unwrap();
        let cle_site = SecretKey::from_slice(&decoder("yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw").unwrap()).unwrap();
        let cle_navigateur = decoder(
            "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4",
        )
        .unwrap();
        let auth = decoder("BTBZMqHH6r4Tts7J_aSIgg").unwrap();
        let sel: [u8; 16] = decoder("DGv6ra1nlYgDCS1FRnbzlw").unwrap().try_into().unwrap();

        // La clé publique du site attendue par la RFC.
        assert_eq!(
            URL_SAFE_NO_PAD.encode(cle_site.public_key().to_encoded_point(false).as_bytes()),
            "BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8",
        );

        let corps = chiffrer_avec(&message, &cle_navigateur, &auth, &cle_site, sel).unwrap();
        assert_eq!(
            URL_SAFE_NO_PAD.encode(corps),
            "DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN",
        );
    }

    #[test]
    fn la_signature_vapid_se_verifie() {
        let cle = SigningKey::from_slice(&[7u8; 32]).unwrap();
        let publique = URL_SAFE_NO_PAD.encode(cle.verifying_key().to_encoded_point(false).as_bytes());
        let vapid = Vapid { cle, publique: publique.clone(), sujet: "mailto:mj@exemple.fr".into() };

        let entete = vapid.entete("https://push.exemple.fr/abc/def", 1_000).unwrap();
        let (jeton, k) = entete
            .strip_prefix("vapid t=")
            .and_then(|reste| reste.split_once(", k="))
            .unwrap();
        assert_eq!(k, publique);

        let morceaux: Vec<&str> = jeton.split('.').collect();
        assert_eq!(morceaux.len(), 3);
        let revendications: serde_json::Value =
            serde_json::from_slice(&decoder(morceaux[1]).unwrap()).unwrap();
        assert_eq!(revendications["aud"], "https://push.exemple.fr");
        assert_eq!(revendications["exp"], 1_000 + SECONDES_VAPID);

        let signature = Signature::from_slice(&decoder(morceaux[2]).unwrap()).unwrap();
        let verificateur = VerifyingKey::from_sec1_bytes(&decoder(&publique).unwrap()).unwrap();
        assert!(
            verificateur
                .verify(format!("{}.{}", morceaux[0], morceaux[1]).as_bytes(), &signature)
                .is_ok()
        );
    }

    #[test]
    fn un_message_chiffre_change_a_chaque_fois() {
        let cle_navigateur = URL_SAFE_NO_PAD.encode(cle_au_hasard().public_key().to_encoded_point(false).as_bytes());
        let un = chiffrer(b"Un pli", &cle_navigateur, "BTBZMqHH6r4Tts7J_aSIgg").unwrap();
        let deux = chiffrer(b"Un pli", &cle_navigateur, "BTBZMqHH6r4Tts7J_aSIgg").unwrap();
        assert_ne!(un, deux);
        // 16 (sel) + 4 + 1 + 65 (clé) + 6 (texte) + 1 (fin) + 16 (étiquette).
        assert_eq!(un.len(), 109);
    }
}
