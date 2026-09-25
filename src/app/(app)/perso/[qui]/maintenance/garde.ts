import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { getTool } from "@/tools/registry";

/**
 * Garde commune aux écrans de l'outil : espace perso correspondant + session.
 *
 * ⚠️ PAS de cloisonnement par utilisateur, contrairement aux Notes de frais.
 * Un contrat de maintenance est un engagement de la MAISON : n'importe qui peut
 * prendre l'appel du client un vendredi soir, et devra donc pouvoir noter son
 * heure de téléassistance sans attendre le retour de qui que ce soit. Un outil
 * qu'une seule personne peut nourrir n'est pas tenu à jour.
 */
export async function garde(qui: string): Promise<{ userId: string }> {
  const tool = getTool("maintenance");
  if (!tool || tool.proprietaire !== qui) notFound();

  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) redirect("/login");

  return { userId };
}
