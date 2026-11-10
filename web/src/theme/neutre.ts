/**
 * Le thème neutre : tout le vocabulaire qui dépend de l'univers est ici,
 * et toute l'apparence dans `neutre.css`. Un autre univers = un autre thème.
 */
export const vocabulaire = {
  nomDuSite: 'Correspondance',

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

  accueil: {
    mj: 'Vous êtes connecté en tant que meneur de jeu.',
    joueur: (nom: string) => `Vous êtes connecté. Votre personnage : ${nom}.`,
    sansPersonnage: 'Vous êtes connecté. Votre personnage n’est pas encore prêt.',
    deconnexion: 'Se déconnecter',
  },
} as const;
