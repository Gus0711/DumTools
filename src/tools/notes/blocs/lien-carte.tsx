"use client";

import { useState } from "react";
import { Check, ExternalLink, FileText, Globe, Pencil } from "lucide-react";
import { createReactBlockSpec, type ReactCustomBlockRenderProps } from "@blocknote/react";
import { useNotesContexte } from "./contexte";

/* Bloc « carte lien » : une URL externe ou un document GED de la même affaire,
 * présenté en carte cliquable (plus lisible qu'un lien inline pour les
 * ressources importantes d'une note).
 *
 * Pour un document GED, l'URL pointe vers la route de téléchargement
 * AUTHENTIFIÉE : dans une note partagée publiquement, la carte s'affiche mais
 * le fichier reste réservé aux collègues connectés (volontaire). */

const config = {
  type: "lienCarte" as const,
  propSchema: {
    url: { default: "" },
    titre: { default: "" },
    genre: { default: "url", values: ["url", "document"] as const },
  },
  content: "none" as const,
};

function domaine(url: string): string {
  try {
    return new URL(url, "https://x").hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function LienCarte({ block, editor }: ReactCustomBlockRenderProps<typeof config>) {
  const { url, titre, genre } = block.props;
  const { documents } = useNotesContexte();
  const editable = editor.isEditable;
  const [edition, setEdition] = useState(editable && !url);
  const [genreB, setGenreB] = useState(genre);
  const [urlB, setUrlB] = useState(url);
  const [titreB, setTitreB] = useState(titre);

  const appliquer = (props: { url: string; titre: string; genre: "url" | "document" }) => {
    editor.updateBlock(block, { props });
    setEdition(false);
  };

  if (edition) {
    return (
      <div className="w-full rounded-lg border border-border bg-surface p-3" contentEditable={false}>
        <div className="mb-2 flex items-center gap-1 text-xs">
          {(["url", "document"] as const).map((g) => (
            <button
              key={g}
              type="button"
              onClick={() => setGenreB(g)}
              className={`rounded-md px-2 py-1 font-medium ${
                genreB === g ? "bg-brand text-brand-fg" : "text-muted hover:bg-surface-2"
              }`}
            >
              {g === "url" ? "Lien web" : "Document GED"}
            </button>
          ))}
        </div>

        {genreB === "url" ? (
          <div className="flex flex-wrap items-center gap-2">
            <input
              autoFocus
              value={urlB}
              onChange={(e) => setUrlB(e.target.value)}
              placeholder="https://…"
              className="min-w-48 flex-1 rounded-md border border-border bg-surface px-2 py-1.5 text-sm text-fg outline-none placeholder:text-subtle"
            />
            <input
              value={titreB}
              onChange={(e) => setTitreB(e.target.value)}
              placeholder="Titre (optionnel)"
              className="min-w-40 flex-1 rounded-md border border-border bg-surface px-2 py-1.5 text-sm text-fg outline-none placeholder:text-subtle"
            />
            <button
              type="button"
              disabled={!urlB.trim()}
              onClick={() => appliquer({ url: urlB.trim(), titre: titreB.trim(), genre: "url" })}
              className="inline-flex items-center gap-1 rounded-md bg-brand px-2.5 py-1.5 text-xs font-medium text-brand-fg hover:bg-brand-strong disabled:opacity-50"
            >
              <Check className="h-3.5 w-3.5" /> OK
            </button>
          </div>
        ) : documents.length === 0 ? (
          <p className="py-2 text-sm text-muted">
            Aucun document GED sur cette affaire — déposez-en d&apos;abord via l&apos;outil Documents.
          </p>
        ) : (
          <div className="max-h-56 space-y-0.5 overflow-y-auto">
            {documents.map((d) => (
              <button
                key={d.id}
                type="button"
                onClick={() =>
                  appliquer({
                    url: `/api/documents/${d.id}/download`,
                    titre: d.nom,
                    genre: "document",
                  })
                }
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-fg hover:bg-surface-2"
              >
                <FileText className="h-4 w-4 shrink-0 text-subtle" />
                <span className="min-w-0 flex-1 truncate">{d.nom}</span>
                <span className="shrink-0 text-xs text-subtle">{d.categorie}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  const Icone = genre === "document" ? FileText : Globe;
  const sousTitre = genre === "document" ? "Document GED de l'affaire" : domaine(url);

  return (
    <div className="group/lien relative w-full" contentEditable={false}>
      <a
        href={url}
        target="_blank"
        rel="noreferrer noopener"
        className="flex items-center gap-3 rounded-lg border border-border bg-surface px-3 py-2.5 no-underline transition-colors hover:bg-surface-2"
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-brand-soft">
          <Icone className="h-4 w-4 text-brand" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-fg">{titre || url}</span>
          {sousTitre && <span className="block truncate text-xs text-muted">{sousTitre}</span>}
        </span>
        <ExternalLink className="h-4 w-4 shrink-0 text-subtle" />
      </a>
      {editable && (
        <button
          type="button"
          onClick={() => {
            setGenreB(genre);
            setUrlB(url);
            setTitreB(titre);
            setEdition(true);
          }}
          className="absolute right-10 top-1/2 -translate-y-1/2 rounded-md border border-border bg-surface px-1.5 py-1 text-muted opacity-0 shadow-sm transition-opacity hover:text-fg group-hover/lien:opacity-100"
          aria-label="Modifier le lien"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

export const blocLienCarte = createReactBlockSpec(config, {
  render: (props) => <LienCarte {...props} />,
});
