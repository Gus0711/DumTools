import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { getTool } from "@/tools/registry";
import { getFormulaire } from "@/tools/formulaires/queries";
import { Builder } from "@/tools/formulaires/builder";

export const metadata: Metadata = { title: "Éditer un formulaire · ToolGus" };

export default async function Page({
  params,
}: {
  params: Promise<{ qui: string; id: string }>;
}) {
  const { qui, id } = await params;
  const tool = getTool("formulaires");
  if (!tool || tool.proprietaire !== qui) notFound();

  // Construction & édition : réservées aux administrateurs.
  const session = await auth();
  if (session?.user?.role !== "ADMIN") redirect(`/perso/${qui}/formulaires`);

  const formulaire = await getFormulaire(id);
  if (!formulaire) notFound();

  return <Builder qui={qui} formulaire={formulaire} />;
}
