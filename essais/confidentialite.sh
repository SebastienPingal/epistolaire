#!/usr/bin/env bash
# Les tests de confidentialité, sur une base d'essai à part : jamais la base de
# développement, jamais celle du site en ligne.
#
#   essais/confidentialite.sh
#
# Crée la base `epistolaire_tests` si besoin, puis lance les tests de
# tests/confidentialite.rs. Le test vide lui-même cette base et y met son jeu de données
# (tests/donnees/confidentialite.sql) : on peut le relancer autant qu'on veut.
set -euo pipefail
cd "$(dirname "$0")/.."

base="${EPISTOLAIRE_TESTS_BASE:-postgres://postgres:postgres@localhost:5432/epistolaire_tests}"
case "$base" in
    *_tests | *_tests\?*) ;;
    *) echo "EPISTOLAIRE_TESTS_BASE doit désigner une base dont le nom finit par _tests" >&2; exit 1 ;;
esac

serveur="${base%/*}/postgres"
nom="${base##*/}"
nom="${nom%%\?*}"
if ! psql "$serveur" -tAc "select 1 from pg_database where datname = '$nom'" | grep -q 1; then
    psql "$serveur" -q -c "create database \"$nom\""
fi

EPISTOLAIRE_TESTS_BASE="$base" cargo test --test confidentialite -- --nocapture --test-threads=1
