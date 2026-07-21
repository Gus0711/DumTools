#!/usr/bin/env bash
# Lance le serveur MCP DumTools en HTTP (LAN) pour un client distant (Claude Desktop).
# À exécuter depuis n'importe où ; se replace à la racine du repo (résolution de @/).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

export TRANSPORT=http
export MCP_HTTP_PORT="${MCP_HTTP_PORT:-8787}"

# Déjà en route (lancé par serve-prod.sh, npm run dev ou un autre terminal) ?
# → ne rien casser : sortie 0 pour que les lanceurs couplés continuent.
if ss -ltn 2>/dev/null | grep -qE "[:.]${MCP_HTTP_PORT}\s"; then
  echo "→ Serveur MCP déjà en route sur le port ${MCP_HTTP_PORT} — rien à relancer."
  exit 0
fi
export MCP_USER_EMAIL="${MCP_USER_EMAIL:-augustin.duhant@dumortier02.fr}"
# URL publique vue par les clients OAuth (« Ajouter un connecteur personnalisé »
# de Claude Desktop) : l'hostname du tunnel Cloudflare qui pointe sur ce port.
export MCP_PUBLIC_URL="${MCP_PUBLIC_URL:-https://dumtoolsmcp.datagtb.com}"

LAN_IP="$(hostname -I | awk '{print $1}')"
echo "→ Endpoint MCP (LAN)    : http://${LAN_IP}:${MCP_HTTP_PORT}/mcp"
echo "→ Endpoint MCP (public) : ${MCP_PUBLIC_URL}/mcp   ← à saisir dans « Ajouter un connecteur personnalisé »"
echo "→ Santé                 : http://${LAN_IP}:${MCP_HTTP_PORT}/health"
echo "→ Ctrl-C pour arrêter."
echo

exec npx tsx mcp/server.mts
