"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Download, FileText, Loader2, Printer } from "lucide-react";
import { Button } from "@/ui";
import { NoteLecture } from "@/tools/notes/lecture";
import { genererNotePdf } from "@/tools/notes/pdf-note";
import type { WikiContenu } from "./model";

/* Aperçu imprimable d'une page wiki. On réutilise le rendu lecture seule et
 * l'export PDF de l'outil Notes (mêmes blocs BlockNote). Pas de kDrive ici (le
 * wiki n'est pas rattaché à une affaire). */

function telecharger(blob: Blob, nom: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nom;
  a.click();
  URL.revokeObjectURL(url);
}

export function ApercuWiki({
  page,
}: {
  page: {
    id: string;
    titre: string;
    contenu: WikiContenu;
    rubriqueSlug: string;
    rubriqueNom: string;
    updatedAt: string;
  };
}) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const [pdfEnCours, setPdfEnCours] = useState(false);

  const nomFichier = `Wiki — ${page.titre || "sans titre"} — ${new Date()
    .toISOString()
    .slice(0, 10)}.pdf`;

  async function exporterPdf() {
    if (!sheetRef.current) return;
    setPdfEnCours(true);
    try {
      telecharger(await genererNotePdf(sheetRef.current), nomFichier);
    } finally {
      setPdfEnCours(false);
    }
  }

  async function exporterMarkdown() {
    const [{ BlockNoteEditor }, { schemaNotes }] = await Promise.all([
      import("@blocknote/core"),
      import("@/tools/notes/blocs/schema"),
    ]);
    const ed = BlockNoteEditor.create({
      schema: schemaNotes,
      initialContent: page.contenu.length ? (page.contenu as unknown as never[]) : undefined,
    });
    const md = await ed.blocksToMarkdownLossy(ed.document);
    telecharger(
      new Blob([`# ${page.titre}\n\n${md}`], { type: "text/markdown;charset=utf-8" }),
      `Wiki — ${page.titre || "sans titre"}.md`,
    );
  }

  return (
    <div>
      <div className="sticky top-0 z-30 border-b border-border-soft bg-page/85 backdrop-blur-md print:hidden">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center gap-2 px-4 py-2 md:px-8">
          <Link
            href={`/outils/wiki/${page.rubriqueSlug}/${page.id}`}
            className="group inline-flex min-w-0 items-center gap-1.5 text-sm text-muted transition-colors hover:text-fg"
          >
            <ArrowLeft className="h-4 w-4 shrink-0 transition-transform group-hover:-translate-x-0.5" />
            Retour à l&apos;édition
          </Link>
          <span className="hidden text-subtle sm:inline">·</span>
          <span className="hidden min-w-0 truncate text-sm font-medium text-fg sm:inline">
            {page.titre || "Sans titre"}
          </span>
          <span className="ml-auto flex flex-wrap items-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={exporterMarkdown}>
              <FileText className="h-4 w-4" /> Markdown
            </Button>
            <Button type="button" variant="outline" size="sm" disabled={pdfEnCours} onClick={exporterPdf}>
              {pdfEnCours ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              PDF
            </Button>
            <Button type="button" size="sm" onClick={() => window.print()}>
              <Printer className="h-4 w-4" /> Imprimer
            </Button>
          </span>
        </div>
      </div>

      <div className="mx-auto max-w-4xl px-4 py-6 md:px-8">
        <div className="print-root note-print">
          <div ref={sheetRef} className="note-sheet">
            <header className="note-sheet-entete">
              <div className="note-sheet-titre">{page.titre || "Sans titre"}</div>
              <div className="note-sheet-meta">
                Wiki · {page.rubriqueNom} · {new Date(page.updatedAt).toLocaleDateString("fr-FR")}
              </div>
            </header>
            <NoteLecture contenu={page.contenu} themeForce="light" />
          </div>
        </div>
      </div>
    </div>
  );
}
