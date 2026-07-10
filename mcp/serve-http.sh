#!/usr/bin/env bash
# Lance le serveur MCP DumTools en HTTP (LAN) pour un client distant (Claude Desktop).
# À exécuter depuis n'importe où ; se replace à la racine du repo (résolution de @/).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

export TRANSPORT=http
export MCP_HTTP_PORT="${MCP_HTTP_PORT:-8787}"
export MCP_USER_EMAIL="${MCP_USER_EMAIL:-augustin.duhant@dumortier02.fr}"

LAN_IP="$(hostname -I | awk '{print $1}')"
echo "→ Endpoint MCP :   http://${LAN_IP}:${MCP_HTTP_PORT}/mcp"
echo "→ Santé        :   http://${LAN_IP}:${MCP_HTTP_PORT}/health"
echo "→ Ctrl-C pour arrêter."
echo

exec npx tsx mcp/server.mts
