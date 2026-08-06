"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { EtatAffaire, BesoinArmoire } from "@/generated/prisma/enums";
import { resoudreClientId } from "@/lib/clients/queries";

/** Id de l'utilisateur courant — sert aussi à tracer l'auteur de la dernière
 *  modification (`updatedById`, fil d'activité de l'accueil). */
async function requireUserId(): Promise<string> {
  const session = await auth();
  const id = session?.user?.id;
  if (!id) throw new Error("Non authentifié");
  return id;
}

/* =============================================================================
 * CE QUI SE RETOURNE ET CE QUI SE LANCE
 * Next EFFACE le message d'une erreur lancée par une action en production (il
 * ne reste qu'un digest) : un `throw new Error("…")` destiné à l'utilisateur
 * arrive chez lui en « An error occurred in the Server Components render ».
 * Donc : tout ce que l'utilisateur doit LIRE se RETOURNE (`{ erreur }`) ; on ne
 * lance que ce qui n'est pas censé arriver (non authentifié, panne).
 * ========================================================================== */

/* Le retour est écrit en toutes lettres dans chaque signature — `{ erreur }` si
 * l'utilisateur a quelque chose à lire, rien sinon. Pas d'alias exporté : un
 * module "use server" n'exporte QUE des fonctions async, et un export de trop
 * invalide TOUT le module avec un message qui ne pointe pas la ligne fautive
 * (voir CLAUDE.md). */

/** Qui porte déjà ce numéro Why — pour le dire au lieu d'un « existe déjà »
 *  aveugle : on saura tout de suite si c'est une faute de frappe ou l'affaire
 *  qu'on cherchait. */
async function conflitNumeroWhy(numeroWhy: string | null): Promise<string> {
  const proprietaire = numeroWhy
    ? await prisma.chantier.findUnique({
        where: { numeroWhy },
        select: { nom: true, etat: true, client: { select: { nom: true } } },
      })
    : null;
  if (!proprietaire) return "Une affaire existe déjà avec ce numéro Why.";

  // Le cas qui rend fou : l'affaire qui retient le numéro est à la CORBEILLE,
  // donc absente du tableau de bord (filtre d'état par défaut). On cherche le
  // doublon partout sauf là où il est. Le dire évite la chasse au fantôme.
  const ou =
    proprietaire.etat === "CORBEILLE"
      ? " — elle est dans la corbeille : videz son n° Why, ou reprenez-la plutôt que d'en créer une autre"
      : "";
  return `Le n° Why ${numeroWhy} est déjà porté par l'affaire « ${proprietaire.nom} » (${proprietaire.client.nom})${ou}.`;
}

/** Crée une affaire (Chantier) rattachée à un client. Le numéro Why est optionnel
 *  mais unique : c'est la clé qui rattachera automatiquement les projets saisis
 *  avec ce même numéro. Redirige vers la fiche de la nouvelle affaire. */
export async function creerAffaire(p: {
  nom: string;
  clientNom: string;
  numeroWhy: string;
}): Promise<{ erreur: string } | void> {
  const userId = await requireUserId();
  const nom = p.nom.trim();
  const numeroWhy = p.numeroWhy.trim() || null;
  if (!nom) return { erreur: "Nom de l'affaire requis" };
  const clientId = await resoudreClientId(p.clientNom);
  if (!clientId) return { erreur: "Client requis" };

  let affaire: { id: string };
  try {
    affaire = await prisma.chantier.create({
      data: { nom, numeroWhy, clientId, updatedById: userId },
      select: { id: true },
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")
      return { erreur: await conflitNumeroWhy(numeroWhy) };
    throw e;
  }
  revalidatePath("/affaires");
  redirect(`/affaires/${affaire.id}`);
}

function revalidate(id: string) {
  revalidatePath("/affaires");
  revalidatePath(`/affaires/${id}`);
}

/** Modifie l'identité de l'affaire (nom, client, n° Why) — l'identification vit
 *  ici, plus dans chaque automate. Synchronise les automates rattachés. */
export async function modifierAffaire(
  id: string,
  p: { nom: string; clientNom: string; numeroWhy: string },
): Promise<{ erreur: string } | void> {
  const userId = await requireUserId();
  const nom = p.nom.trim();
  if (!nom) return { erreur: "Nom requis" };
  const clientNom = p.clientNom.trim();
  const clientId = await resoudreClientId(clientNom);
  if (!clientId) return { erreur: "Client requis" };
  const numeroWhy = p.numeroWhy.trim() || null;

  try {
    await prisma.chantier.update({
      where: { id },
      data: { nom, clientId, numeroWhy, updatedById: userId },
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")
      return { erreur: await conflitNumeroWhy(numeroWhy) };
    throw e;
  }

  // L'identité est dénormalisée sur les automates rattachés : on les resynchronise.
  await prisma.affectationProjet.updateMany({
    where: { chantierId: id },
    data: { clientId, clientNom, numeroWhy },
  });

  revalidate(id);
  revalidatePath("/outils/affectation-es", "layout");
  revalidatePath("/clients");
}

/* =============================================================================
 * NETTOYER LA CORBEILLE
 * Une affaire mise de côté RETIENT son n° Why, qui est unique : le numéro reste
 * pris alors que l'affaire est invisible du tableau de bord. D'où deux gestes,
 * et seulement depuis la corbeille — on ne libère ni ne détruit une affaire en
 * cours par un clic malheureux.
 * ========================================================================== */

/** Ce qu'une affaire porte, relation par relation. Sert à refuser une
 *  suppression en DISANT ce qui s'y oppose, plutôt qu'un « impossible » sec. */
async function contenuAffaire(id: string): Promise<{ total: number; detail: string }> {
  const c = await prisma.chantier.findUnique({
    where: { id },
    select: {
      _count: {
        select: {
          affectations: true,
          documents: true,
          visites: true,
          taches: true,
          notes: true,
          scans: true,
          formulaireReponses: true,
          depensesFrais: true,
          mouvementsStock: true,
          reservationsStock: true,
          lignesMateriel: true,
          materielHorsFourniture: true,
          exemplaires: true,
        },
      },
    },
  });
  if (!c) return { total: 0, detail: "" };

  const LIBELLE: Record<string, [string, string]> = {
    affectations: ["projet GTB", "projets GTB"],
    documents: ["document", "documents"],
    visites: ["visite", "visites"],
    taches: ["tâche", "tâches"],
    notes: ["note", "notes"],
    scans: ["scan", "scans"],
    formulaireReponses: ["réponse de formulaire", "réponses de formulaire"],
    depensesFrais: ["dépense", "dépenses"],
    mouvementsStock: ["mouvement de stock", "mouvements de stock"],
    reservationsStock: ["réservation", "réservations"],
    lignesMateriel: ["ligne matériel", "lignes matériel"],
    materielHorsFourniture: ["article hors fourniture", "articles hors fourniture"],
    exemplaires: ["exemplaire", "exemplaires"],
  };

  const morceaux: string[] = [];
  let total = 0;
  for (const [cle, n] of Object.entries(c._count)) {
    if (!n) continue;
    total += n;
    const [un, plusieurs] = LIBELLE[cle] ?? [cle, cle];
    morceaux.push(`${n} ${n > 1 ? plusieurs : un}`);
  }
  return { total, detail: morceaux.join(", ") };
}

/**
 * Libère le n° Why d'une affaire mise à la corbeille, sans rien détruire :
 * l'affaire reste là avec toute son histoire, son numéro redevient disponible.
 * C'est le geste sûr — celui qui débloque la réutilisation du numéro sans
 * décider à la place de personne.
 */
export async function libererNumeroWhy(id: string): Promise<{ erreur: string } | void> {
  const userId = await requireUserId();
  const affaire = await prisma.chantier.findUnique({
    where: { id },
    select: { etat: true, numeroWhy: true },
  });
  if (!affaire) return { erreur: "Affaire introuvable" };
  if (affaire.etat !== EtatAffaire.CORBEILLE)
    return { erreur: "Le numéro ne se libère que depuis la corbeille." };
  if (!affaire.numeroWhy) return { erreur: "Cette affaire n'a pas de numéro Why." };

  await prisma.chantier.update({
    where: { id },
    data: { numeroWhy: null, updatedById: userId },
  });
  // Le numéro est dénormalisé sur les automates rattachés : le laisser là ferait
  // renaître une affaire portant ce numéro au prochain enregistrement du projet
  // (resoudreChantierId fait un upsert par numeroWhy).
  await prisma.affectationProjet.updateMany({
    where: { chantierId: id },
    data: { numeroWhy: null },
  });

  revalidate(id);
  revalidatePath("/outils/affectation-es", "layout");
}

/**
 * Supprime DÉFINITIVEMENT une affaire — uniquement depuis la corbeille, et
 * uniquement si elle ne porte plus rien. Le garde-fou n'est pas de la prudence
 * décorative : la cascade emporterait notes et documents (dont les fichiers sur
 * disque et sur kDrive, eux, resteraient orphelins) et libérerait les
 * réservations de stock sans que personne ne l'ait demandé.
 */
export async function supprimerAffaire(id: string): Promise<{ erreur: string } | void> {
  await requireUserId();
  const affaire = await prisma.chantier.findUnique({
    where: { id },
    select: { etat: true, nom: true },
  });
  if (!affaire) return { erreur: "Affaire introuvable" };
  if (affaire.etat !== EtatAffaire.CORBEILLE)
    return { erreur: "Seule une affaire mise à la corbeille peut être supprimée." };

  const { total, detail } = await contenuAffaire(id);
  if (total > 0) {
    return {
      erreur: `Suppression refusée : cette affaire porte encore ${detail}. Détachez-les ou supprimez-les d'abord — ici, on ne supprime que ce qui est vide.`,
    };
  }

  await prisma.chantier.delete({ where: { id } });
  revalidatePath("/affaires");
  revalidatePath("/clients");
}

export async function changerEtatAffaire(id: string, etat: EtatAffaire): Promise<void> {
  const userId = await requireUserId();
  await prisma.chantier.update({ where: { id }, data: { etat, updatedById: userId } });
  revalidate(id);
}

/** Définit le besoin en armoire de l'affaire (null = non défini). */
export async function changerBesoinArmoire(
  id: string,
  besoinArmoire: BesoinArmoire | null,
): Promise<void> {
  const userId = await requireUserId();
  await prisma.chantier.update({
    where: { id },
    data: { besoinArmoire, updatedById: userId },
  });
  revalidate(id);
}
