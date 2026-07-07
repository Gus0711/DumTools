import { notFound } from "next/navigation";
import { Editeur } from "@/tools/liste-points/editeur";
import {
  getCatalogue,
  getClients,
  getDocument,
} from "@/tools/liste-points/queries";

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [doc, clients, catalogue] = await Promise.all([
    getDocument(id),
    getClients(),
    getCatalogue(),
  ]);
  if (!doc) notFound();

  return (
    <Editeur
      id={doc.id}
      initial={{
        clientNom: doc.clientNom,
        chantierNom: doc.chantierNom,
        numeroWhy: doc.numeroWhy,
        date: doc.date,
        rows: doc.rows,
      }}
      clients={clients}
      catalogue={catalogue}
    />
  );
}
