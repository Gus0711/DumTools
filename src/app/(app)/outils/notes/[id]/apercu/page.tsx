import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getNote } from "@/tools/notes/queries";
import { ApercuNote } from "@/tools/notes/apercu-note";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const note = await getNote(id);
  return { title: note ? `Aperçu · ${note.titre}` : "Aperçu" };
}

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const note = await getNote(id);
  if (!note) notFound();

  return (
    <ApercuNote
      note={{
        id: note.id,
        titre: note.titre,
        contenu: note.contenu,
        chantierId: note.chantierId,
        affaireNom: note.affaireNom,
        clientNom: note.clientNom,
        numeroWhy: note.numeroWhy,
        updatedAt: note.updatedAt.toISOString(),
      }}
    />
  );
}
