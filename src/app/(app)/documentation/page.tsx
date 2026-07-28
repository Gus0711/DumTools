import fs from "node:fs";
import path from "node:path";
import {Download, ExternalLink, FileText} from "lucide-react";
import { Cartouche, EtatVide } from "@/ui";

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
    <div className="mx-auto max-w-[1700px] px-4 py-5 md:px-7 md:py-7">
      <Cartouche
        estampille="Référence constructeur"
        titre="Documentation Distech"
        description="Fiches techniques des automates et modules ECLYPSE, à consulter ou à télécharger."
        champs={[{ label: "Fiches", valeur: fichiers.length, fort: true }]}
        className="mb-6"
      />

      {fichiers.length === 0 ? (
        <div className="bloc">
          <EtatVide
            icone={FileText}
            titre="Aucune fiche technique"
            texte={`Rien n'a été trouvé dans ${REL_DIR}. Déposez-y les PDF constructeur.`}
          />
        </div>
      ) : (
        <ul className="stagger planche sm:grid-cols-2 lg:grid-cols-3">
          {fichiers.map((f) => {
            const url = encodeURI(`${BASE_URL}/${f}`);
            return (
              <li
                key={f}
                className="bloc flex items-center gap-3 p-4"
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
