import type { DateJeu } from '@/types/DateJeu';

/** « 1er », « 2e », « 12e ». */
const ordinal = (n: number) => (n === 1 ? '1er' : `${n}e`);

/**
 * Le thème neutre : tout le vocabulaire qui dépend de l'univers est ici,
 * et toute l'apparence dans `neutre.css`. Un autre univers = un autre thème.
 *
 * Seuls les écrans des joueurs passent par ce vocabulaire : ceux du MJ sont des outils.
 */
export const vocabulaire = {
  nomDuSite: 'Correspondance',
  gazette: 'La gazette',

  /** Une date du calendrier du jeu : « 12e jour du 3e mois, an 1 ». Jamais d'heure. */
  date: (d: DateJeu) => `${ordinal(d.jour)} jour du ${ordinal(d.mois)} mois, an ${d.an}`,

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
    dossierVide: 'Ce dossier est vide.',
    arrive: (date: string) => `Arrivé le ${date}`,
    nonOuvert: 'Pas encore ouvert',
    anonyme: 'Sans signature',
    choisir: 'Choisir',
    terminer: 'Terminer',
    choisis: (nombre: number) =>
      nombre === 0
        ? 'Touchez les plis à choisir.'
        : nombre === 1
          ? 'Un pli choisi'
          : `${nombre} plis choisis`,
    ranger: 'Ranger',
    detruire: 'Détruire',
    confirmerDestruction: {
      titre: (nombre: number) => (nombre === 1 ? 'Détruire ce pli ?' : `Détruire ces ${nombre} plis ?`),
      texte: (nombre: number) =>
        nombre === 1
          ? 'Il sera détruit : vous ne pourrez plus jamais le relire.'
          : 'Ils seront détruits : vous ne pourrez plus jamais les relire.',
      action: 'Détruire',
    },
    detruits: (nombre: number) => (nombre === 1 ? 'Le pli est détruit.' : 'Les plis sont détruits.'),
    ranges: (nombre: number, lieu: string) =>
      nombre === 1 ? `Pli rangé : ${lieu}.` : `${nombre} plis rangés : ${lieu}.`,
  },

  dossiers: {
    lieux: 'Où ranger',
    nouveau: 'Nouveau dossier',
    nom: 'Nom du dossier',
    creer: 'Créer',
    renommer: 'Renommer',
    enregistrer: 'Enregistrer',
    supprimer: 'Supprimer',
    confirmerSuppression: {
      titre: (nom: string) => `Supprimer le dossier « ${nom} » ?`,
      texte: (nombre: number) =>
        nombre === 0
          ? 'Il est vide.'
          : nombre === 1
            ? 'Le pli qu’il contient sera détruit avec lui : vous ne pourrez plus jamais le relire.'
            : `Les ${nombre} plis qu’il contient seront détruits avec lui : vous ne pourrez plus jamais les relire.`,
      action: 'Supprimer',
    },
    supprime: 'Dossier supprimé.',
  },

  pli: {
    retour: 'Retour',
    ouvrir: 'Ouvrir le pli',
    gesteDoigt: (scelle: boolean) =>
      scelle ? 'Faites glisser le sceau pour ouvrir le pli.' : 'Faites glisser la pliure pour ouvrir le pli.',
    gesteSouris: (scelle: boolean) =>
      scelle ? 'Maintenez le sceau enfoncé pour ouvrir le pli.' : 'Maintenez la pliure enfoncée pour ouvrir le pli.',
    ouverture: 'Ouverture…',
    recu: (date: string) => `Reçu le ${date}`,
    ranger: 'Ranger',
    detruire: 'Détruire',
    introuvable: 'Ce pli n’est pas ici.',
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
