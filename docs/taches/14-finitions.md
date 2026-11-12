# Étape 14 : finitions

Après le lancement. La partie d'essai et la mise en ligne, prévues ici à l'origine, ont été faites au lancement.

## Ce que le MJ verra

- Les joueurs choisissent leur écriture et leur sceau dans une sélection du MJ, qui valide.
- Chaque joueur règle la taille du texte, les animations et le son.
- Le guide du site est complet.

## Déjà décidé

Voir `DECISIONS.md`, sections « Administration » et « Rendu ».

- Écriture et sceau : le joueur choisit dans la sélection du MJ, sur un écran qui peut être habillé de façon immersive. Le MJ valide.
- Un réglage de taille du texte existe, sans changer la police. On peut aussi zoomer avec les doigts.
- Le son est désactivé par défaut. Les animations sont réduites si l'appareil le demande.

## Questions au MJ

1. **Le choix du sceau.** « Que choisit le joueur pour son sceau ? »
   - (Recommandé) Un dessin parmi ceux que vous proposez (des images importées, ou des cachets à initiales de formes différentes). · Seulement ses initiales et la forme du cachet.
2. **Où vivent les réglages.** « La taille du texte, les animations et le son se règlent… »
   - (Recommandé) … une fois par compte : les mêmes sur le téléphone et l'ordinateur. · … sur chaque appareil séparément.
3. **Les sons.** « Quels sons, et quand ? »
   - (Recommandé) Un seul, discret, à l'ouverture d'un pli (papier qui se déplie, cire qui craque), libre de droits, que vous écoutez avant. · Aussi à l'arrivée d'un pli, sur le site ouvert.
4. **Changer d'avis.** « Un joueur peut-il redemander une autre écriture plus tard ? »
   - (Recommandé) Non, sauf si vous lui rouvrez le choix. · Oui, à tout moment, avec votre validation.

## Tâches

### 14.1 Choix de l'écriture et du sceau

- Base : une table `propositions (id, personnage_id, genre 'ecriture' | 'sceau', options uuid[], choix uuid, choisi_le, valide_le, refuse_le)`.
- MJ : depuis la fiche d'un joueur, « Proposer des écritures » et « Proposer des sceaux ». On coche les options ; seules les écritures qu'aucun autre joueur n'a sont proposables.
- Joueur : un écran immersif (mots du thème) qui montre chaque option avec son nom écrit dans cette écriture, ou le cachet. Il choisit ; c'est en attente.
- MJ : une alerte dans À traiter (« Alix a choisi son écriture ») ; valider attribue l'écriture ou le sceau, refuser rouvre le choix.
- La règle « deux joueurs ne partagent jamais la même écriture » reste tenue par la base : traduire son refus en phrase claire.

### 14.2 Préférences d'affichage

- Selon la question 2 : des colonnes ajoutées à `preferences_notification` (renommer la table serait une suppression : ajouter plutôt une table `preferences_affichage`), ou un stockage local à l'appareil.
- **Taille du texte** : trois ou quatre crans. Elle agit sur la taille de base de l'interface et des écritures (`font-size` de la racine), sans changer de police. Ne jamais bloquer le zoom aux doigts.
- **Animations** : « comme l'appareil » (par défaut), « réduites ». Toutes les animations des joueurs passent par un seul réglage (une classe sur la racine, plus `prefers-reduced-motion`).
- **Son** : éteint par défaut. Les fichiers dans `web/public/sons/`, libres de droits, avec leur licence notée dans `web/public/sons/LICENCES.md`. Le MJ les écoute et les approuve avant la mise en ligne.
- L'écran : dans la Fiche du joueur, section « Réglages » (mots du thème).

### 14.3 Le guide complet

- `docs/FONCTIONNEMENT.md` relu de bout en bout : il décrit le site tel qu'il est, pour un lecteur qui ne code pas.
- Un guide du MJ, `docs/GUIDE-MJ.md` : comment mener la partie avec le site, écran par écran, en français simple, avec les gestes courants (traiter la file, répondre au nom d'un PNJ, falsifier, composer la gazette, suivre une information, restaurer une sauvegarde : qui appeler, quoi demander).

### 14.4 Parcours d'essai `finitions`

- Proposer trois écritures à Alix ; elle choisit ; le MJ valide ; son billet est dans la nouvelle écriture.
- Une écriture déjà prise n'est pas proposable.
- La taille du texte change la taille, pas la police.
- Animations réduites : l'ouverture est instantanée.
- Son éteint par défaut ; allumé, il joue à l'ouverture.
- Ajouter les nouvelles routes aux tests de confidentialité : un joueur ne voit pas les propositions d'un autre.

### 14.5 Documentation

`PLAN.md` : la V1 est terminée. `DECISIONS.md` : les réponses, et les « Questions ouvertes » soldées.

## Terminé quand

Tous les parcours passent ; le MJ a validé le choix d'écriture d'un joueur ; les guides sont relus par le MJ.
