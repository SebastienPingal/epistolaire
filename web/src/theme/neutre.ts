/**
 * Le thème neutre : tout le vocabulaire qui dépend de l'univers est ici,
 * et toute l'apparence dans `neutre.css`. Un autre univers = un autre thème.
 *
 * Seuls les écrans des joueurs passent par ce vocabulaire : ceux du MJ sont des outils.
 */
export const vocabulaire = {
  nomDuSite: 'Correspondance',
  gazette: 'La gazette',

  connexion: {
    adresse: 'Votre adresse e-mail',
    demander: 'Recevoir un code',
    envoi: 'Envoi…',
    messageParti:
      'Si cette adresse est connue, un message vient de lui être envoyé. Ouvrez le lien qu’il contient, ou saisissez son code ici.',
    code: 'Code à 6 chiffres',
    verification: 'Vérification…',
    changerAdresse: 'Utiliser une autre adresse',
    lienEnCours: 'Ouverture…',
  },

  navigation: {
    reception: 'Réception',
    ecrire: 'Écrire',
    personnage: 'Personnage',
  },

  reception: {
    titre: 'Réception',
    vide: 'Aucun pli ne vous attend.',
  },

  ecritoire: {
    titre: 'Écrire',
    restantes: (nombre: number) =>
      nombre === 0
        ? 'Vous avez envoyé toutes vos lettres de la semaine.'
        : nombre === 1
          ? 'Il vous reste une lettre à envoyer cette semaine.'
          : `Il vous reste ${nombre} lettres à envoyer cette semaine.`,
    nouveau: 'Nouveau billet',
    brouillons: 'Vos brouillons',
    aucunBrouillon: 'Rien en cours.',
    sansDestinataire: 'Sans destinataire',
    billetVierge: 'Billet vierge',
    pour: (destinataire: string) => `À ${destinataire}`,
    pourLaGazette: 'À la gazette',
  },

  billet: {
    retour: 'Vos brouillons',
    a: 'À',
    choisirDestinataire: 'Choisir un destinataire',
    carnet: 'Votre carnet',
    carnetVide: 'Votre carnet est vide.',
    autre: 'Autre destinataire',
    autreAide: 'Un nom, un titre, une adresse…',
    autreValider: 'Choisir',
    texte: 'Votre billet',
    invite: 'Écrivez ici…',
    place: 'Place sur le billet',
    resteDeLaPlace: 'Il reste de la place',
    deborde: 'Votre billet déborde : il faut le raccourcir.',
    signer: 'Signer',
    sceller: 'Sceller',
    sansSceau: 'Sans sceau',
    sceauDe: (nom: string) => `Sceau de ${nom}`,
    envoyer: 'Envoyer',
    jeter: 'Jeter',
    enregistrement: 'Enregistrement…',
    enregistre: 'Brouillon enregistré',
    nonEnregistre: 'Brouillon non enregistré',
    manque: {
      texte: 'Ce billet est encore vide.',
      destinataire: 'Choisissez à qui vous écrivez.',
      quota: 'Vous avez envoyé toutes vos lettres de la semaine.',
    },
    confirmerEnvoi: {
      titre: 'Envoyer ce billet ?',
      texte: 'Une fois parti, il ne vous appartient plus : vous n’en gardez aucune copie.',
      action: 'Envoyer',
    },
    confirmerJet: {
      titre: 'Jeter ce brouillon ?',
      texte: 'Il sera perdu.',
      action: 'Jeter',
    },
    parti: 'Votre pli est parti.',
    apresEnvoi: 'Revenir à l’écritoire',
  },

  fiche: {
    role: 'Rôle',
    domaine: 'Domaine',
    aptitudes: 'Aptitudes',
    objectifs: 'Objectifs',
    sceaux: 'Vos sceaux',
    aucunSceau: 'Vous ne détenez aucun sceau.',
    nonRenseigne: 'Rien pour l’instant.',
    deconnexion: 'Se déconnecter',
  },
} as const;
