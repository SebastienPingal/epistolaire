#!/usr/bin/env bash
# Déroule un parcours d'essai dans un vrai navigateur, contre le site lancé en local.
#
#   essais/lancer.sh connexion        la connexion par e-mail
#   essais/lancer.sh preparation-mj   les écrans de préparation du MJ
#   essais/lancer.sh ecrire           l'écritoire du joueur
#   essais/lancer.sh traiter          la file du MJ, les plis en route, la plume des PNJ
#   essais/lancer.sh recevoir         la Réception, l'ouverture, les dossiers, le calendrier
#
# Le script vide la base locale, y met le jeu de données du parcours, lance le serveur
# et l'interface, déroule le parcours, puis arrête tout. Les captures d'écran et le
# journal du serveur vont dans le dossier donné en second (par défaut : essais/sortie).
#
# Sans identifiants SMTP en local, les e-mails sont écrits dans le journal du serveur :
# c'est là que le parcours lit les codes de connexion.
set -euo pipefail
cd "$(dirname "$0")/.."

parcours="${1:?Quel parcours ? connexion, preparation-mj, ecrire, traiter ou recevoir}"
sortie="${2:-essais/sortie}"
export DATABASE_URL="${DATABASE_URL:-postgres://postgres:postgres@localhost:5432/epistolaire}"
mkdir -p "$sortie"

sqlx migrate run >/dev/null
psql "$DATABASE_URL" -q -v ON_ERROR_STOP=1 -f essais/vider.sql
if [ -f "essais/jeu-$parcours.sql" ]; then
    psql "$DATABASE_URL" -q -v ON_ERROR_STOP=1 -f "essais/jeu-$parcours.sql"
fi

arreter() { pkill -f "target/debug/dev" || true; pkill -f "vite --port 5173" || true; }
trap arreter EXIT
arreter

# Le fichier .env donne au serveur local le compte du MJ de l'essai (mj@exemple.fr)
# et aucun identifiant SMTP : les e-mails vont donc dans le journal.
[ -f .env ] || cp .env.exemple .env
cargo run -q >"$sortie/serveur.log" 2>&1 &
(cd web && npx vite --port 5173 >"../$sortie/vite.log" 2>&1) &
for _ in $(seq 1 120); do
    if curl -s -m 2 localhost:8787/api/sante >/dev/null && curl -s -m 2 localhost:5173 >/dev/null; then
        break
    fi
    sleep 2
done

node "essais/$parcours.cjs" "$sortie" "$sortie/serveur.log"
