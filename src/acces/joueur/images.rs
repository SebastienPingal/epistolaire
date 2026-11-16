//! Les images qu'un joueur a le droit de voir : celles de ses plis ouverts, et celles des
//! sceaux qu'il voit.
//!
//! Une image est un contenu comme un autre. Règles de ce fichier :
//!
//! * l'image d'un document ne se sert que si le pli est dans la vue `plis_recus` pour ce
//!   joueur (donc arrivé, pas détruit, à lui), s'il est **ouvert**, et si sa version livrée
//!   cite cette image. Sinon : introuvable, exactement comme une image qui n'existe pas ;
//! * l'image d'un sceau se voit dès que le sceau se voit : sur un pli reçu, même fermé, ou
//!   parmi les sceaux que le joueur détient ;
//! * la vérification se fait ici, avant d'appeler [`crate::images::servir`], qui ne
//!   vérifie rien ;
//! * aucune adresse du stockage ne sort : la réponse est le fichier lui-même.

use axum::extract::Path;
use axum::response::Response;
use serde_json::Value;
use uuid::Uuid;

use crate::acces::Joueur;
use crate::base;
use crate::erreur::Erreur;
use crate::gabarits::Contenu;
use crate::images;
use crate::modele::Gabarit;

/// L'image d'un document reçu, une fois le pli ouvert.
pub async fn du_pli(
    joueur: Joueur,
    Path((pli, image)): Path<(Uuid, Uuid)>,
) -> Result<Response, Erreur> {
    let pool = base::pool().await?;
    let ligne = sqlx::query!(
        r#"
        select
            r.gabarit as "gabarit!: Gabarit",
            r.contenu as "contenu!: Value"
        from plis_recus r
        where r.id = $1
          and r.destinataire_id = $2
          and r.ouvert_le is not null
        "#,
        pli,
        joueur.personnage_id(),
    )
    .fetch_optional(pool)
    .await?
    .ok_or(Erreur::Introuvable)?;

    // Seulement une image que sa version livrée cite : pas une autre image du MJ, ni celle
    // de l'original si le MJ l'a remplacée dans son exemplaire.
    let document = Contenu::depuis_la_base(ligne.gabarit, ligne.contenu);
    if !document.images().contains(&image) {
        return Err(Erreur::Introuvable);
    }
    images::servir(pool, image).await
}

/// L'image d'un sceau que le joueur voit : sur un pli reçu, ou parmi les siens.
pub async fn du_sceau(joueur: Joueur, Path(image): Path<Uuid>) -> Result<Response, Erreur> {
    let pool = base::pool().await?;
    let visible = sqlx::query_scalar!(
        r#"
        select (
            exists (
                select 1 from plis_recus r
                where r.destinataire_id = $1 and r.sceau_image_id = $2
            )
            or exists (
                select 1 from sceaux s
                where s.detenteur_id = $1 and s.image_id = $2
            )
        ) as "visible!"
        "#,
        joueur.personnage_id(),
        image,
    )
    .fetch_one(pool)
    .await?;
    if !visible {
        return Err(Erreur::Introuvable);
    }
    images::servir(pool, image).await
}
