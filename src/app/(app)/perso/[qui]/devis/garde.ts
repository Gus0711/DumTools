import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { getTool } from "@/tools/registry";
import { peutVoirDevis } from "@/tools/devis/model";

/**
 * Garde commune aux écrans de l'outil : espace perso correspondant, session
 * valide, ET profil autorisé.
 *
 * L'outil expose le déboursé du magasin — déjà réservé aux Achats — et, en
 * plus, les COEFFICIENTS DE MARGE de la maison. D'où `notFound()` plutôt qu'un
 * écran « accès refusé » : rien du contenu n'est rendu.
 *
 * ⚠️ Deux limites à connaître, vérifiées en navigateur :
 *
 *  1. Le rendu étant STREAMÉ, la coquille part avant que `notFound()` ne soit
 *     levé : la réponse porte un statut 200 tout en affichant la page
 *     « introuvable ». C'est le comportement de Next, commun à toutes les
 *     gardes de la plateforme. Ce qui compte tient : aucune donnée n'est rendue.
 *     Ne pas se fier au code HTTP pour tester ce chemin.
 *  2. Cette garde protège les ÉCRANS. Les server actions portent la leur
 *     (`acteur()` dans actions.ts) et la route d'API la sienne : un écran fermé
 *     n'est pas une autorisation refusée.
 */
export async function garde(qui: string): Promise<{ userId: string; role: string }> {
  const tool = getTool("devis");
  if (!tool || tool.proprietaire !== qui) notFound();

  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) redirect("/login");
  if (!peutVoirDevis(session.user.role)) notFound();

  return { userId, role: session.user.role ?? "MEMBRE" };
}
