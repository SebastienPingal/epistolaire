-- Vide la base locale d'essai (jamais la base en ligne), sans toucher aux écritures ni aux réglages.
delete from evenements;
delete from exemplaires;
delete from lettres_gazette;
delete from numeros_gazette;
delete from pli_informations;
delete from plis;
delete from sessions;
delete from demandes_connexion;
delete from contacts;
delete from dossiers;
delete from sceaux;
delete from personnages;
delete from comptes;
update reglages set longueur_billet = 500, quota_hebdo = 3, delai_minutes = 1440, hasard_minutes = 240;
