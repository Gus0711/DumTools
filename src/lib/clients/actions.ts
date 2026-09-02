"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";

const BASE = "/clients";

async function requireUser(): Promise<string> {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Non authentifié");
  return session.user.id;
}

/** Crée un client dans le référentiel et redirige vers sa fiche. */
export async function creerClient(formData: FormData): Promise<void> {
  await requireUser();
  const nom = String(formData.get("nom") || "").trim();
  if (!nom) throw new Error("Nom requis");

  const existant = await prisma.client.findUnique({
    where: { nom },
    select: { id: true },
  });
  const id =
    existant?.id ??
    (await prisma.client.create({ data: { nom }, select: { id: true } })).id;

  revalidatePath(BASE);
  redirect(`${BASE}/${id}`);
}

export async function renommerClient(
  id: string,
  nom: string,
): Promise<{ ok: boolean; error?: string }> {
  await requireUser();
  const n = nom.trim();
  if (!n) return { ok: false, error: "Nom requis" };

  const collision = await prisma.client.findUnique({
    where: { nom: n },
    select: { id: true },
  });
  if (collision && collision.id !== id) {
    return { ok: false, error: "Un client porte déjà ce nom" };
  }

  await prisma.client.update({ where: { id }, data: { nom: n } });
  // Resynchronise le libellé dénormalisé des documents rattachés.
  //
  // ⚠️ CETTE LISTE DOIT COUVRIR TOUT CE QUI PORTE `clientNom`. Deux modèles y
  // manquaient : `Visite` et surtout `Devis` — qui IMPRIME ce libellé sur le
  // document envoyé au client, et le sert en direct sur `/d/{jeton}`. Renommer
  // un client laissait donc l'ancien nom sur la page que le client a sous les
  // yeux. Grep de contrôle avant d'ajouter un outil : `clientNom` dans
  // prisma/schema.prisma.
  //
  // Écriture TECHNIQUE (propagation de dénormalisation) : elle ne touche pas à
  // `updatedById`, sous peine de s'attribuer tout le fil d'activité.
  await Promise.all([
    prisma.pointsList.updateMany({
      where: { clientId: id },
      data: { clientNom: n },
    }),
    prisma.affectationProjet.updateMany({
      where: { clientId: id },
      data: { clientNom: n },
    }),
    prisma.visite.updateMany({
      where: { clientId: id },
      data: { clientNom: n },
    }),
    prisma.devis.updateMany({
      where: { clientId: id },
      data: { clientNom: n },
    }),
  ]);
  revalidatePath(BASE);
  revalidatePath(`${BASE}/${id}`);
  return { ok: true };
}

/* -----------------------------------------------------------------------------
 * L'IDENTITÉ POSTALE ET LES CONTACTS (docs/DEVIS.md §24)
 *
 * Le référentiel VIT. Ce qu'un devis en retient est une COPIE figée : rien ici
 * ne remonte modifier un devis, jamais — même quand une adresse change.
 * -------------------------------------------------------------------------- */

/** Retours à la ligne conservés (une adresse s'imprime telle qu'on l'a saisie),
 *  blancs de bord retirés. Même traitement que le pavé destinataire. */
function multiligne(v: unknown): string {
  return String(v ?? "")
    .split("\n")
    .map((l) => l.trimEnd())
    .join("\n")
    .trim();
}

function ligne(v: unknown): string {
  return String(v ?? "").trim();
}

export async function majIdentiteClient(
  id: string,
  saisie: {
    adresse: string;
    codePostal: string;
    ville: string;
    telephone: string;
    email: string;
  },
): Promise<{ ok: boolean; error?: string }> {
  await requireUser();
  await prisma.client.update({
    where: { id },
    data: {
      adresse: multiligne(saisie.adresse),
      codePostal: ligne(saisie.codePostal),
      ville: ligne(saisie.ville),
      telephone: ligne(saisie.telephone),
      email: ligne(saisie.email),
    },
  });
  revalidatePath(`${BASE}/${id}`);
  return { ok: true };
}

export interface SaisieContact {
  civilite: string;
  nom: string;
  fonction: string;
  email: string;
  telephone: string;
  mobile: string;
  note: string;
}

function champsContact(saisie: SaisieContact) {
  return {
    civilite: ligne(saisie.civilite),
    nom: ligne(saisie.nom),
    fonction: ligne(saisie.fonction),
    email: ligne(saisie.email),
    telephone: ligne(saisie.telephone),
    mobile: ligne(saisie.mobile),
    note: multiligne(saisie.note),
  };
}

export async function creerContact(
  clientId: string,
  saisie: SaisieContact,
): Promise<{ ok: boolean; error?: string }> {
  const userId = await requireUser();
  const champs = champsContact(saisie);
  if (!champs.nom) return { ok: false, error: "Le nom est requis" };

  // Le PREMIER contact d'un client devient le principal d'office : sans ça, un
  // client à une seule personne ne proposerait jamais rien, et il faudrait un
  // second clic pour dire une évidence.
  const premier = (await prisma.contactClient.count({ where: { clientId } })) === 0;

  await prisma.contactClient.create({
    data: { ...champs, clientId, principal: premier, createdById: userId },
  });
  revalidatePath(`${BASE}/${clientId}`);
  return { ok: true };
}

export async function majContact(
  id: string,
  saisie: SaisieContact,
): Promise<{ ok: boolean; error?: string }> {
  await requireUser();
  const champs = champsContact(saisie);
  if (!champs.nom) return { ok: false, error: "Le nom est requis" };

  const c = await prisma.contactClient.update({
    where: { id },
    data: champs,
    select: { clientId: true },
  });
  revalidatePath(`${BASE}/${c.clientId}`);
  return { ok: true };
}

/**
 * Le contact proposé d'office sur un nouveau devis de ce client.
 *
 * L'unicité est tenue ICI, en transaction, et non par un index partiel : la
 * contrainte demanderait du SQL brut dans la migration, or c'est exactement ce
 * que ce dépôt paie cher (la colonne tsvector du wiki). Deux écritures
 * concurrentes sur un référentiel de trois lignes ne le justifient pas.
 */
export async function definirContactPrincipal(id: string): Promise<{ ok: boolean }> {
  await requireUser();
  const c = await prisma.contactClient.findUnique({
    where: { id },
    select: { clientId: true },
  });
  if (!c) return { ok: false };

  await prisma.$transaction([
    prisma.contactClient.updateMany({
      where: { clientId: c.clientId, principal: true },
      data: { principal: false },
    }),
    prisma.contactClient.update({ where: { id }, data: { principal: true, actif: true } }),
  ]);
  revalidatePath(`${BASE}/${c.clientId}`);
  return { ok: true };
}

/**
 * Il a quitté la maison. On ne l'EFFACE pas : des devis le citent, et l'effacer
 * ferait disparaître la personne à qui ils sont partis des propositions ET de
 * la fiche. On le retire des propositions, c'est tout (même grammaire que
 * `Fournisseur.actif`). Un contact retiré ne peut plus être le principal.
 */
export async function basculerActifContact(
  id: string,
  actif: boolean,
): Promise<{ ok: boolean }> {
  await requireUser();
  const c = await prisma.contactClient.update({
    where: { id },
    data: actif ? { actif: true } : { actif: false, principal: false },
    select: { clientId: true },
  });
  revalidatePath(`${BASE}/${c.clientId}`);
  return { ok: true };
}

/**
 * La suppression franche, pour l'erreur de frappe. Les devis qui le citaient
 * gardent leur destinataire : ils en portent une COPIE, et `Devis.contactId`
 * est en `SetNull`.
 */
export async function supprimerContact(id: string): Promise<{ ok: boolean }> {
  await requireUser();
  const c = await prisma.contactClient.delete({
    where: { id },
    select: { clientId: true },
  });
  revalidatePath(`${BASE}/${c.clientId}`);
  return { ok: true };
}

/**
 * Supprime un client du référentiel. Les documents rattachés ne sont PAS
 * supprimés : leur clientId passe à null (onDelete: SetNull), le libellé
 * clientNom est conservé.
 */
export async function supprimerClient(id: string): Promise<void> {
  await requireUser();
  await prisma.client.delete({ where: { id } });
  revalidatePath(BASE);
  redirect(BASE);
}
