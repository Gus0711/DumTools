import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { getTool } from "@/tools/registry";
import { getReponse } from "@/tools/formulaires/queries";
import { ReponseVue } from "@/tools/formulaires/reponse-vue";

export const metadata: Metadata = { title: "Réponse · ToolGus" };

export default async function Page({
  params,
}: {
  params: Promise<{ qui: string; id: string; reponseId: string }>;
}) {
  const { qui, id, reponseId } = await params;
  const tool = getTool("formulaires");
  if (!tool || tool.proprietaire !== qui) notFound();

  const reponse = await getReponse(reponseId);
  // La réponse doit bien appartenir au formulaire de l'URL.
  if (!reponse || reponse.formulaireId !== id) notFound();

  // Un membre ne peut consulter QUE ses propres réponses ; l'admin, toutes.
  const session = await auth();
  const isAdmin = session?.user?.role === "ADMIN";
  if (!isAdmin && reponse.createdById !== session?.user?.id) notFound();

  return <ReponseVue qui={qui} reponse={reponse} estAdmin={isAdmin} />;
}
