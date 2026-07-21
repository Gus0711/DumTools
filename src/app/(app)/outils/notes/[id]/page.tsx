import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getNote } from "@/tools/notes/queries";
import { listerDocuments } from "@/tools/documents/queries";
import { NoteEditeur } from "@/tools/notes/editeur";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const note = await getNote(id);
  return { title: note ? `Note · ${note.titre}` : "Note" };
}

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const note = await getNote(id);
  if (!note) notFound();

  // Documents GED de la même affaire, proposés par le bloc « carte lien ».
  const documents = await listerDocuments(note.chantierId);

  return (
    <NoteEditeur
      note={{
        id: note.id,
        titre: note.titre,
        contenu: note.contenu,
        version: note.version,
        jetonPartage: note.jetonPartage,
        chantierId: note.chantierId,
        affaireNom: note.affaireNom,
        clientNom: note.clientNom,
        numeroWhy: note.numeroWhy,
        auteur: note.auteur,
        updatedAt: note.updatedAt.toISOString(),
      }}
      documents={documents.map((d) => ({ id: d.id, nom: d.nom, categorie: d.categorie }))}
    />
  );
}
