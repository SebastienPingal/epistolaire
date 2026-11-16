-- Nettoyage de la base du site en ligne, avant le lancement de la vraie partie.
--
-- Décision du MJ (16 novembre) : ne rien garder de la répétition ni des essais antérieurs.
-- Sont effacés : les plis et leurs exemplaires, l'historique, les informations, les numéros
-- de gazette, les personnages, leurs carnets, dossiers et sceaux, les fiches d'images, les
-- bonds du calendrier, et les comptes des joueurs avec leurs sessions et leurs notifications.
--
-- Sont gardés : la structure (_sqlx_migrations), les écritures et les noms que le MJ leur a
-- donnés, les réglages, et le compte du MJ avec ses notifications.
--
-- AVANT DE LANCER CE SCRIPT :
--   1. faire une sauvegarde (Réglages, « Faire une copie maintenant ») et la télécharger ;
--   2. avoir l'accord explicite du MJ, au moment même.
--
-- Tout se fait dans une seule transaction. Le script s'arrête sur ROLLBACK : il montre ce
-- qu'il ferait, sans rien changer. Pour l'appliquer vraiment, remplacer la dernière ligne
-- par COMMIT, après avoir relu les deux décomptes.
--
--   psql "$DATABASE_URL_UNPOOLED" -v ON_ERROR_STOP=1 -f outils/nettoyer-lancement.sql
--
-- Les fichiers des images restent dans le stockage Vercel Blob (dossier images/) : les
-- supprimer à la main depuis le tableau de bord, si l'on veut.

begin;

create temp view decompte as
          select 'comptes (MJ)' as quoi, count(*) from comptes where role = 'mj'
union all select 'comptes (joueurs)', count(*) from comptes where role = 'joueur'
union all select 'personnages', count(*) from personnages
union all select 'sceaux', count(*) from sceaux
union all select 'contacts', count(*) from contacts
union all select 'dossiers', count(*) from dossiers
union all select 'plis', count(*) from plis
union all select 'exemplaires', count(*) from exemplaires
union all select 'evenements', count(*) from evenements
union all select 'informations', count(*) from informations
union all select 'numeros_gazette', count(*) from numeros_gazette
union all select 'images', count(*) from images
union all select 'bonds_calendrier', count(*) from bonds_calendrier
union all select 'sessions', count(*) from sessions
union all select 'abonnements_navigateur', count(*) from abonnements_navigateur
union all select 'ecritures (gardées)', count(*) from ecritures
union all select 'reglages (gardés)', count(*) from reglages;

\echo '--- Avant ---'
select * from decompte;

-- Le courrier, du plus dépendant au moins dépendant.
delete from evenements;
delete from pli_informations;
delete from informations;
delete from lettres_gazette;
delete from numeros_gazette;
delete from exemplaires;
delete from plis;

-- Les personnages et ce qui leur appartient.
delete from contacts;
delete from dossiers;
delete from sceaux;
delete from images;
delete from personnages;

-- Le calendrier repart de zéro : le MJ fixera le premier jour du jeu le jour de l'invitation.
delete from bonds_calendrier;

-- Les comptes des joueurs : leurs sessions, demandes, préférences et abonnements partent
-- avec eux. Le compte du MJ reste, avec ses notifications ; ses demandes de connexion
-- périmées sont effacées.
delete from comptes where role = 'joueur';
delete from demandes_connexion;

\echo '--- Après ---'
select * from decompte;

-- Remplacer par COMMIT pour appliquer. Seulement avec l'accord du MJ, après une sauvegarde.
rollback;
