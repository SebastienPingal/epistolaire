#!/usr/bin/env bash
# La restauration, essayée de bout en bout, sur des bases d'essai à part.
#
#   essais/restauration.sh
#
# 1. Une base source reçoit la structure et le jeu des tests de confidentialité (tous les
#    états d'un pli, l'historique, les sessions, les abonnements…).
# 2. Le programme `sauvegarder` la copie dans un fichier, au format des copies quotidiennes.
# 3. Le programme `restaurer` la remet dans une base neuve.
# 4. Chaque table est comparée, ligne à ligne, entre la source et la base restaurée.
# 5. Les refus : restaurer par-dessus du courrier, et une copie à laquelle il manque une table.
set -euo pipefail
cd "$(dirname "$0")/.."

serveur="${SERVEUR_POSTGRES:-postgres://postgres:postgres@localhost:5432}"
source="$serveur/epistolaire_sauvegarde_source"
cible="$serveur/epistolaire_restauration"
sortie="${1:-essais/sortie}"
mkdir -p "$sortie"
copie="$sortie/copie-essai.json.gz"
ok() { if [ "$2" = 0 ]; then echo "OK    $1"; else echo "ECHEC $1"; fi; }

neuve() {
    psql "$serveur/postgres" -q -c "drop database if exists $1" -c "create database $1"
}

# 1. La source.
neuve epistolaire_sauvegarde_source
DATABASE_URL="$source" sqlx migrate run >/dev/null
psql "$source" -q -v ON_ERROR_STOP=1 -f tests/donnees/confidentialite.sql

# 2. La copie.
cargo build -q --bin sauvegarder --bin restaurer
target/debug/sauvegarder "$source" "$copie"

# 3. La restauration, dans une base neuve.
neuve epistolaire_restauration
if target/debug/restaurer "$copie" "$cible" >"$sortie/restauration.log" 2>&1; then r=0; else r=1; fi
ok "restaurer dans une base neuve" "$r"

# 4. Chaque table, ligne à ligne. L'historique des migrations garde sa date d'application :
#    on n'en compare que les numéros et les empreintes.
empreintes() {
    for table in $(psql "$1" -At -c "select table_name from information_schema.tables
                                     where table_schema = 'public' and table_type = 'BASE TABLE' order by 1"); do
        if [ "$table" = _sqlx_migrations ]; then
            requete="select count(*) || ':' || md5(string_agg(version || ':' || encode(checksum, 'hex'), ',' order by version)) from _sqlx_migrations"
        else
            requete="select count(*) || ':' || coalesce(md5(string_agg(x::text, '|' order by x::text)), '') from \"$table\" x"
        fi
        echo "$table $(psql "$1" -At -c "$requete")"
    done
}
empreintes "$source" >"$sortie/empreintes-source.txt"
empreintes "$cible" >"$sortie/empreintes-restauree.txt"
if diff "$sortie/empreintes-source.txt" "$sortie/empreintes-restauree.txt" >"$sortie/empreintes-diff.txt"; then r=0; else r=1; fi
ok "chaque table est identique ($(wc -l <"$sortie/empreintes-source.txt") tables)" "$r"
plis=$(psql "$cible" -At -c "select count(*) from plis")
exemplaires=$(psql "$cible" -At -c "select count(*) from exemplaires")
ok "plis et exemplaires restaurés ($plis plis, $exemplaires exemplaires)" "$([ "$plis" -gt 0 ] && [ "$exemplaires" -gt 0 ] && echo 0 || echo 1)"

# Le compteur de l'historique repart après la plus grande valeur chargée.
nouveau=$(psql "$cible" -qAt -c "insert into evenements (pli_id, genre) values ('00000000-0000-0000-0000-0000000000d1', 'essai') returning id")
plus_grand=$(psql "$source" -At -c "select max(id) from evenements")
ok "le compteur de l'historique repart après la copie ($nouveau > $plus_grand)" "$([ "$nouveau" -gt "$plus_grand" ] && echo 0 || echo 1)"

# 5. Les refus.
if target/debug/restaurer "$copie" "$cible" >"$sortie/restauration-refus.log" 2>&1; then r=1; else r=0; fi
ok "refus : restaurer par-dessus du courrier" "$r"
if grep -q "contient déjà du courrier" "$sortie/restauration-refus.log"; then r=0; else r=1; fi
ok "refus : le message le dit" "$r"

partielle="$sortie/copie-partielle.json.gz"
python3 -c "
import gzip, json, sys
copie = json.load(gzip.open(sys.argv[1]))
del copie['tables']['evenements']
gzip.open(sys.argv[2], 'wt').write(json.dumps(copie))
" "$copie" "$partielle"
neuve epistolaire_restauration
if target/debug/restaurer "$partielle" "$cible" >"$sortie/restauration-partielle.log" 2>&1; then r=1; else r=0; fi
ok "refus : une copie à laquelle il manque une table" "$r"
if grep -q "copie incomplète.*evenements" "$sortie/restauration-partielle.log"; then r=0; else r=1; fi
ok "refus : le message nomme la table manquante" "$r"
lignes=$(psql "$cible" -At -c "select count(*) from comptes")
ok "refus : aucune donnée chargée ($lignes comptes)" "$([ "$lignes" = 0 ] && echo 0 || echo 1)"
