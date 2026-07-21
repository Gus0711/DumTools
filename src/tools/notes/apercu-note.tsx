"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Download, FileText, Loader2, Printer } from "lucide-react";
import { Button } from "@/ui";
import { BoutonSauvegardeKdrive } from "@/tools/affectation-es/sauvegarder-kdrive";
import type { KdriveMarker } from "@/tools/affectation-es/model";
import { NoteLecture } from "./lecture";
import { genererNotePdf } from "./pdf-note";
import type { NoteContenu } from "./model";

/** Empreinte du contenu pour l'état « Sur kDrive / Modifié depuis ». */
function hashNote(titre: string, contenu: NoteContenu): string {
  const s = titre + JSON.stringify(contenu);
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return String(h >>> 0);
}

function telecharger(blob: Blob, nom: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nom;
  a.click();
  URL.revokeObjectURL(url);
}

export function ApercuNote({
  note,
}: {
  note: {
    id: string;
    titre: string;
    contenu: NoteContenu;
    chantierId: string;
    affaireNom: string;
    clientNom: string;
    numeroWhy: string | null;
    updatedAt: string;
  };
}) {
  const sheetRef = useRef<HTMLDivElement>(null);
  // Marqueur kDrive de session (non persisté : l'état repart à « jamais »
  // au rechargement, le dépôt versionne côté kDrive de toute façon).
  const [marker, setMarker] = useState<KdriveMarker | undefined>(undefined);
  const [pdfEnCours, setPdfEnCours] = useState(false);

  const nomFichier = `Note — ${note.titre || "sans titre"} — ${new Date()
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
      import("./blocs/schema"),
    ]);
    const ed = BlockNoteEditor.create({
      schema: schemaNotes,
      initialContent: note.contenu.length ? (note.contenu as unknown as never[]) : undefined,
    });
    const md = await ed.blocksToMarkdownLossy(ed.document);
    telecharger(
      new Blob([`# ${note.titre}\n\n${md}`], { type: "text/markdown;charset=utf-8" }),
      `Note — ${note.titre || "sans titre"}.md`,
    );
  }

  return (
    <div>
      <div className="sticky top-0 z-30 border-b border-border-soft bg-page/85 backdrop-blur-md print:hidden">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center gap-2 px-4 py-2 md:px-8">
          <Link
            href={`/outils/notes/${note.id}`}
            className="group inline-flex min-w-0 items-center gap-1.5 text-sm text-muted transition-colors hover:text-fg"
          >
            <ArrowLeft className="h-4 w-4 shrink-0 transition-transform group-hover:-translate-x-0.5" />
            Retour à l&apos;édition
          </Link>
          <span className="hidden text-subtle sm:inline">·</span>
          <span className="hidden min-w-0 truncate text-sm font-medium text-fg sm:inline">
            {note.titre || "Sans titre"}
          </span>
          <span className="ml-auto flex flex-wrap items-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={exporterMarkdown}>
              <FileText className="h-4 w-4" /> Markdown
            </Button>
            <Button type="button" variant="outline" size="sm" disabled={pdfEnCours} onClick={exporterPdf}>
              {pdfEnCours ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              PDF
            </Button>
            <BoutonSauvegardeKdrive
              chantierId={note.chantierId}
              nomFichier={nomFichier}
              currentHash={hashNote(note.titre, note.contenu)}
              marker={marker}
              genererPdf={async () => {
                if (!sheetRef.current) throw new Error("Aperçu non prêt");
                return genererNotePdf(sheetRef.current);
              }}
              onSaved={setMarker}
            />
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
              <div className="note-sheet-titre">{note.titre || "Sans titre"}</div>
              <div className="note-sheet-meta">
                {note.clientNom} · {note.affaireNom}
                {note.numeroWhy ? ` · N° Why ${note.numeroWhy}` : ""} ·{" "}
                {new Date(note.updatedAt).toLocaleDateString("fr-FR")}
              </div>
            </header>
            <NoteLecture contenu={note.contenu} themeForce="light" />
          </div>
        </div>
      </div>
    </div>
  );
}
