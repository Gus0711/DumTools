import type { Metadata } from "next";
import { Cartouche } from "@/ui";
import { listerNotes } from "@/tools/notes/queries";
import { NotesIndex } from "@/tools/notes/index-notes";

export const metadata: Metadata = { title: "Notes" };

/** Vue transverse (recherche) — la création se fait depuis la fiche Affaire. */
export default async function Page() {
  const notes = await listerNotes();

  return (
    <div className="mx-auto max-w-[1700px] px-4 py-5 md:px-7 md:py-7">
      <Cartouche
        estampille="Vue transverse"
        titre="Notes"
        description="Toutes les notes, toutes affaires confondues — pour retrouver celle dont on ne sait plus à quelle affaire elle appartient. Au quotidien, on les écrit depuis la fiche de l’affaire."
        champs={[{ label: "Notes", valeur: notes.length, fort: true }]}
        className="mb-6"
      />

      <NotesIndex notes={notes} />
    </div>
  );
}
