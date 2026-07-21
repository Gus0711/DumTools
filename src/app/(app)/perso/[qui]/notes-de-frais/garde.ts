import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { getTool } from "@/tools/registry";
import { profilNdfDe } from "@/tools/notes-de-frais/queries";
import type { ProfilNdf } from "@/tools/notes-de-frais/model";

/**
 * Garde commune aux écrans de l'outil : espace perso correspondant + session
 * valide. Renvoie l'identité de l'appelant — TOUTES les requêtes de l'outil s'y
 * rattachent, c'est ce qui matérialise le cloisonnement (docs/NDF.md §6).
 *
 * `profil` à null = la personne n'établit pas de note de frais. L'accueil le lui
 * explique ; les écrans internes la renvoient à l'accueil plutôt que d'afficher
 * un formulaire sans rubriques.
 */
export async function garde(
  qui: string,
): Promise<{ userId: string; profil: ProfilNdf | null }> {
  const tool = getTool("notes-de-frais");
  if (!tool || tool.proprietaire !== qui) notFound();

  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) redirect("/login");

  return { userId, profil: await profilNdfDe(userId) };
}

/** Variante des écrans internes : exige un profil, sinon retour à l'accueil. */
export async function gardeAvecProfil(
  qui: string,
): Promise<{ userId: string; profil: ProfilNdf }> {
  const { userId, profil } = await garde(qui);
  if (!profil) redirect(`/perso/${qui}/notes-de-frais`);
  return { userId, profil };
}
