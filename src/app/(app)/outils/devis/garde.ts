import { redirect } from "next/navigation";
import { auth } from "@/auth";

/**
 * Garde commune aux écrans de l'outil : une session valide, et c'est tout.
 *
 * ⚠️ ELLE NE FILTRE PLUS SUR LE RÔLE depuis le 2026-08-12. L'outil était réservé
 * aux Achats parce qu'il montre le déboursé du magasin ET les coefficients de
 * marge de la maison ; il a été ouvert à toute l'équipe, en connaissance de
 * cette contrepartie (voir la note « DROITS » de `src/tools/devis/model.ts`).
 * Ne pas remettre `peutVoirDevis` ici sans remettre aussi les gardes des
 * actions et des routes d'API : une seule des trois ne protège rien.
 *
 * Ce qui reste réservé : MODIFIER le référentiel (prestations, coefficients),
 * via `peutGererReferentielDevis` dans les actions. Voir et changer ne sont pas
 * le même geste.
 */
export async function garde(): Promise<{ userId: string; role: string }> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) redirect("/login");
  return { userId, role: session.user.role ?? "MEMBRE" };
}
