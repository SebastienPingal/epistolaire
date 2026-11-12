begin;
insert into ecritures (id, nom, police) values
 ('00000000-0000-0000-0000-0000000000e1','Main d''Alix','alix'),
 ('00000000-0000-0000-0000-0000000000e2','Main de Bertrand','bertrand'),
 ('00000000-0000-0000-0000-0000000000e3','Main inconnue','inconnue');
insert into personnages (id, nom, genre, ecriture_id) values
 ('00000000-0000-0000-0000-0000000000a1','Alix','joueur','00000000-0000-0000-0000-0000000000e1'),
 ('00000000-0000-0000-0000-0000000000a2','Bertrand','joueur','00000000-0000-0000-0000-0000000000e2');
insert into sceaux (id, nom_grave, initiales, proprietaire_origine_id, detenteur_id) values
 ('00000000-0000-0000-0000-0000000000c1','Alix','A','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000a2');
insert into plis (id, auteur_id, gabarit, destinataire_genre, destinataire_id, contenu, sceau_id, signe, etat, envoye_le) values
 ('00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-0000000000a1','billet','personnage','00000000-0000-0000-0000-0000000000a2','{"texte":"ORIGINAL SECRET"}','00000000-0000-0000-0000-0000000000c1',true,'traite', now() - interval '2 days');

-- Modèle d'exemplaire : livré hier, texte réécrit, sceau recollé, signature contrefaite.
create temp table modele as
select 'x'::text as cas, '00000000-0000-0000-0000-0000000000b1'::uuid as pli_id,
       '00000000-0000-0000-0000-0000000000a2'::uuid as destinataire_id,
       '{"texte":"version livree"}'::jsonb as contenu,
       '00000000-0000-0000-0000-0000000000e1'::uuid as ecriture_id,
       '00000000-0000-0000-0000-0000000000c1'::uuid as sceau_id,
       'Alix'::text as signature_nom,
       '00000000-0000-0000-0000-0000000000e1'::uuid as signature_ecriture_id,
       'recolle'::text as sceau_etat, 'contrefaite'::text as signature_etat,
       '[{"debut":0,"fin":7}]'::jsonb as passages_reecrits,
       '00000000-0000-0000-0000-0000000000e3'::uuid as faussaire_ecriture_id,
       false as remarque_texte, false as remarque_sceau, false as remarque_signature,
       'en_route'::text as acheminement, now() - interval '1 day' as livraison_le;

create temp table cas (cas text, id uuid);
create function pg_temp.poser(nom text, variante text) returns void language plpgsql as $$
declare nouveau uuid;
begin
  execute format('insert into exemplaires (pli_id, destinataire_id, contenu, ecriture_id, sceau_id, signature_nom, signature_ecriture_id, sceau_etat, signature_etat, passages_reecrits, faussaire_ecriture_id, remarque_texte, remarque_sceau, remarque_signature, acheminement, livraison_le)
    select pli_id, destinataire_id, contenu, ecriture_id, sceau_id, signature_nom, signature_ecriture_id, sceau_etat, signature_etat, passages_reecrits, faussaire_ecriture_id, remarque_texte, remarque_sceau, remarque_signature, acheminement, livraison_le
    from (select * from modele) m, lateral (select 1) z where true returning id') into nouveau;
  execute format('update exemplaires set %s where id = %L', variante, nouveau);
  insert into cas values (nom, nouveau);
end $$;

select pg_temp.poser('1 rien remarque',        'modifie_le = now()');
select pg_temp.poser('2 tout remarque',        'remarque_texte = true, remarque_sceau = true, remarque_signature = true');
select pg_temp.poser('3 en route (demain)',    'livraison_le = now() + interval ''1 day''');
select pg_temp.poser('4 retenu',               'acheminement = ''retenu''');
select pg_temp.poser('5 perdu',                'acheminement = ''perdu''');
select pg_temp.poser('6 signature retiree',    'signature_etat = ''retiree''');
select pg_temp.poser('7 detruit',              'detruit_le = now()');

\echo '--- Ce que voit le destinataire (vue plis_recus) ---'
select c.cas, r.contenu->>'texte' as texte, r.sceau_nom, r.sceau_etat, r.signature_nom,
       es.nom as main_signature, r.passages_reecrits as passages, er.nom as main_reecriture
from cas c
left join plis_recus r on r.id = c.id
left join ecritures es on es.id = r.signature_ecriture_id
left join ecritures er on er.id = r.reecriture_ecriture_id
order by c.cas;

\echo '--- Colonnes de la vue ---'
select string_agg(column_name, ', ' order by ordinal_position) from information_schema.columns where table_name = 'plis_recus';
rollback;
