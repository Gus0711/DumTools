// Spike de découverte kDrive : détecte la version d'API qui répond et liste les
// enfants du dossier racine, SANS rien créer ni supprimer. N'AFFICHE JAMAIS le
// token. Lancer : npx tsx scripts/kdrive-spike.mts
import "dotenv/config";

const BASE = process.env.KDRIVE_API_BASE ?? "https://api.infomaniak.com";
const TOKEN = process.env.KDRIVE_TOKEN;
const DRIVE = process.env.KDRIVE_DRIVE_ID;
const ROOT = process.env.KDRIVE_ROOT_DIR_ID;
const ACCOUNT = process.env.KDRIVE_ACCOUNT_ID;

if (!TOKEN || !DRIVE || !ROOT) {
  console.error("Config manquante (TOKEN/DRIVE_ID/ROOT_DIR_ID).");
  process.exit(1);
}

interface Rep {
  status: number;
  json?: unknown;
  text?: string;
  error?: string;
}

async function get(path: string): Promise<Rep> {
  const url = path.startsWith("http") ? path : `${BASE}${path}`;
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${TOKEN}`, Accept: "application/json" },
    });
    const text = await res.text();
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      /* pas du JSON */
    }
    return { status: res.status, json, text };
  } catch (e) {
    return { status: 0, error: e instanceof Error ? e.message : String(e) };
  }
}

function apercuData(json: unknown): string {
  const data = (json as { data?: unknown })?.data;
  if (Array.isArray(data)) {
    return data
      .slice(0, 12)
      .map((f) => {
        const o = f as { id?: unknown; name?: unknown; type?: unknown };
        return `   • ${String(o.name)}  [id=${String(o.id)}, type=${String(o.type)}]`;
      })
      .join("\n");
  }
  if (data && typeof data === "object") {
    return "   " + JSON.stringify(data).slice(0, 300);
  }
  return "   (pas de champ data ; extrait: " + JSON.stringify(json).slice(0, 200) + ")";
}

async function essaie(label: string, path: string) {
  const r = await get(path);
  const err = (r.json as { error?: unknown })?.error;
  console.log(`\n▶ ${label}\n  ${path}\n  → HTTP ${r.status}${err ? "  error=" + JSON.stringify(err).slice(0, 200) : ""}`);
  if (r.status === 200 && r.json) console.log(apercuData(r.json));
  else if (r.text && !r.json) console.log("  (réponse non-JSON: " + r.text.slice(0, 150) + ")");
  return r;
}

async function main() {
  console.log("=== SPIKE kDrive ===  drive=" + DRIVE + " root=" + ROOT + " account=" + ACCOUNT);

  // 1) Liste des enfants du dossier racine, versions 3 puis 2.
  for (const v of ["3", "2"]) {
    await essaie(`v${v} — enfants de ${ROOT}`, `/${v}/drive/${DRIVE}/files/${ROOT}/files`);
  }
  // 2) Variante avec account_id (certains comptes l'exigent).
  await essaie(
    `v2 — enfants + account_id`,
    `/2/drive/${DRIVE}/files/${ROOT}/files?account_id=${ACCOUNT}`,
  );
  // 3) Métadonnées du dossier racine (confirme le nom « chantier »).
  await essaie(`v2 — métadonnées de ${ROOT}`, `/2/drive/${DRIVE}/files/${ROOT}`);

  console.log("\n=== fin du spike ===");
}

main();
