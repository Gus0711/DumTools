#!/usr/bin/env bash
# Sert DumTools en PRODUCTION LOCALE (build standalone) — pour l'usage
# quotidien et le tunnel Cloudflare : routes précompilées (aucune attente de
# compilation contrairement à `next dev`) et service worker offline actif.
#
#   scripts/serve-prod.sh            # sert le dernier build
#   scripts/serve-prod.sh --build    # refait `npm run build` d'abord
#   PORT=3010 scripts/serve-prod.sh  # autre port
#
# ⚠️ Un build est une photo du code : après une modif de code, relancer avec
# --build. Pour développer, garder `next dev` (sur un autre port si la prod
# locale tourne : `PORT=3001 npm run dev`).
set -euo pipefail
cd "$(dirname "$0")/.."

if [[ "${1:-}" == "--build" ]]; then
  npm run build
fi

[[ -d .next/standalone ]] || {
  echo "Pas de build standalone — lancer : scripts/serve-prod.sh --build" >&2
  exit 1
}

# Le serveur standalone sert les assets depuis SON dossier : on y (re)copie
# les statiques du build et public/ (recette officielle output:standalone).
rm -rf .next/standalone/.next/static .next/standalone/public
cp -r .next/static .next/standalone/.next/static
cp -r public .next/standalone/public

# Variables d'environnement : celles du projet…
set -a
# shellcheck disable=SC1091
source .env
set +a
# …plus les chemins de binaires ANCRÉS DANS LE PROJET : le cwd du serveur
# standalone est .next/standalone, effacé à chaque build — les médias/spool
# n'y survivraient pas.
export VISITES_MEDIA_DIR="$PWD/.visites-media"
export NOTES_MEDIA_DIR="$PWD/.notes-media"
export WIKI_MEDIA_DIR="$PWD/.wiki-media"
export FORMULAIRES_MEDIA_DIR="$PWD/.formulaires-media"
export DOCUMENTS_SPOOL_DIR="$PWD/.spool"
# Derrière le tunnel Cloudflare / le LAN : faire confiance à l'en-tête Host.
export AUTH_TRUST_HOST=true
export PORT="${PORT:-3000}"
# HOSTNAME est toujours défini par bash (nom de machine) → forcer l'écoute
# toutes interfaces (LAN + tunnel), surchargable via BIND.
export HOSTNAME="${BIND:-0.0.0.0}"

# Démarre aussi le serveur MCP HTTP (connecteur Claude Desktop, port 8787) —
# il s'efface tout seul s'il tourne déjà, et s'arrête avec ce script.
"$PWD/mcp/serve-http.sh" &
MCP_PID=$!
trap 'kill "$MCP_PID" 2>/dev/null' EXIT

echo "▶ DumTools (prod locale) : http://localhost:${PORT} — Ctrl+C pour arrêter (app + MCP)"
node .next/standalone/server.js
