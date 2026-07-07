import fs from "node:fs";
import path from "node:path";
import { Download, ExternalLink, FileText } from "lucide-react";

export const metadata = { title: "Documentation Distech" };

const REL_DIR = "public/materiel/Documentations_Distech";
const BASE_URL = "/materiel/Documentations_Distech";

function titre(fichier: string): string {
  return fichier.replace(/_SP\.pdf$/i, "").replace(/\.pdf$/i, "");
}

export default function Page() {
  let fichiers: string[] = [];
  try {
    fichiers = fs
      .readdirSync(path.join(process.cwd(), REL_DIR))
      .filter((f) => f.toLowerCase().endsWith(".pdf"))
      .sort((a, b) => a.localeCompare(b, "fr"));
  } catch {
    fichiers = [];
  }

  return (
    <div className="mx-auto max-w-4xl px-6 py-8 md:px-10">
      <header className="mb-6">
        <h1 className="text-xl font-semibold text-fg">Documentation Distech</h1>
        <p className="mt-1 text-sm text-muted">
          Fiches techniques des automates et modules ECLYPSE. Visualisation et téléchargement.
        </p>
      </header>

      {fichiers.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-surface p-10 text-center text-muted">
          Aucune fiche technique trouvée dans {REL_DIR}.
        </div>
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {fichiers.map((f) => {
            const url = encodeURI(`${BASE_URL}/${f}`);
            return (
              <li
                key={f}
                className="flex items-center gap-3 rounded-lg border border-border bg-surface p-4"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-brand-soft text-brand">
                  <FileText className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium text-fg">{titre(f)}</div>
                  <div className="truncate text-xs text-subtle">{f}</div>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="Ouvrir"
                    className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border text-muted transition-colors hover:bg-surface-2 hover:text-fg"
                  >
                    <ExternalLink className="h-4 w-4" />
                  </a>
                  <a
                    href={url}
                    download={f}
                    title="Télécharger"
                    className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border text-muted transition-colors hover:bg-surface-2 hover:text-fg"
                  >
                    <Download className="h-4 w-4" />
                  </a>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
