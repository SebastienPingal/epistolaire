-- La seconde vue de la porte des joueurs : leurs brouillons.
--
-- Un joueur ne touche à ses lettres qu'à travers cette vue. Elle ne contient que des plis
-- encore en brouillon, écrits par un joueur : dès qu'une lettre est envoyée, elle en sort,
-- et son auteur ne peut plus ni la lire ni la modifier.
--
-- « with check option » : une écriture faite à travers la vue ne peut pas en faire sortir
-- un pli. L'envoi, qui change l'état, est donc le seul geste qui passe par la table.
create view brouillons as
select
    id,
    auteur_id,
    gabarit,
    destinataire_genre,
    destinataire_id,
    destinataire_libre,
    contenu,
    sceau_id,
    signe,
    cree_le,
    modifie_le
from plis
where etat = 'brouillon'
  and not redige_par_mj
with check option;
