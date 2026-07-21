import type { Metadata } from "next";
import { listerNotes } from "@/tools/notes/queries";
import { NotesIndex } from "@/tools/notes/index-notes";

export const metadata: Metadata = { title: "Notes" };

/** Vue transverse (recherche) — la création se fait depuis la fiche Affaire. */
export default async function Page() {
  const notes = await listerNotes();

  return (
    <div className="mx-auto max-w-5xl px-6 py-8 md:px-10">
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-fg">Notes</h1>
        <p className="mt-1 text-muted">
          Toutes les notes, toutes affaires confondues — pour retrouver une note dont on ne
          sait plus à quelle affaire elle appartient. Au quotidien, on les écrit et on les
          ouvre depuis la fiche de l’affaire.
        </p>
      </header>

      <NotesIndex notes={notes} />
    </div>
  );
}
