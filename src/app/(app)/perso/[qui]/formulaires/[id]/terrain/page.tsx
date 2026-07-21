import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { getTool } from "@/tools/registry";
import { getFormulaire } from "@/tools/formulaires/queries";
import { listerAffaires } from "@/lib/chantiers/queries";
import { Remplir } from "@/tools/formulaires/remplir";
import type { RefOption } from "@/tools/formulaires/model";

export const metadata: Metadata = { title: "Remplir un formulaire · ToolGus" };

export default async function Page({
  params,
}: {
  params: Promise<{ qui: string; id: string }>;
}) {
  const { qui, id } = await params;
  const tool = getTool("formulaires");
  if (!tool || tool.proprietaire !== qui) notFound();

  const formulaire = await getFormulaire(id);
  if (!formulaire) notFound();

  // Un brouillon n'est accessible qu'aux admins (le temps de le construire) ;
  // les membres ne peuvent remplir qu'un formulaire publié.
  const session = await auth();
  const isAdmin = session?.user?.role === "ADMIN";
  if (!isAdmin && !formulaire.publie) notFound();

  // Affaires proposées aux champs « référence » (uniquement si le formulaire en
  // contient) — servies au client, mises en cache offline par la page (SW).
  let refAffaires: RefOption[] | undefined;
  if (formulaire.schema.some((c) => c.type === "reference")) {
    const affaires = await listerAffaires();
    refAffaires = affaires
      .filter((a) => a.etat !== "CORBEILLE")
      .map((a) => ({
        id: a.id,
        label: `${a.numeroWhy ? `${a.numeroWhy} — ` : ""}${a.nom}${
          a.clientNom ? ` (${a.clientNom})` : ""
        }`,
        numeroWhy: a.numeroWhy,
      }));
  }

  return (
    <Remplir qui={qui} formulaire={formulaire} refAffaires={refAffaires} />
  );
}
