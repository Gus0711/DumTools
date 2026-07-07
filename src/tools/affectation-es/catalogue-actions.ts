"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { catalogueParDefaut, type AutomateDef, type ModuleDef } from "./catalogue";

const CONFIG = "/configuration/materiel";
const EDITOR = "/outils/affectation-es";

async function requireUser() {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Non authentifié");
}

function revalidate() {
  revalidatePath(CONFIG);
  // Les pages de l'éditeur chargent le catalogue → les rafraîchir aussi.
  revalidatePath(EDITOR, "layout");
}

const json = (v: unknown) => v as unknown as Prisma.InputJsonValue;
const entier = (v: number) => Math.max(0, Math.trunc(Number(v) || 0));

// --- Automates --------------------------------------------------------------

export interface AutomatePayload {
  id?: string;
  reference: string;
  image: string;
  alimIntegree: boolean;
  alimLabel: string;
  entreeKind: string;
  entreeCount: number;
  sortieKind: string;
  sortieCount: number;
  entreeCodes: string[];
  sortieCodes: string[];
  extensible: boolean;
  modulesCompat: string[];
  maxModules: number;
  maxPoints: number;
  docUrl: string;
  actif: boolean;
  ordre: number;
}

export async function enregistrerAutomate(p: AutomatePayload) {
  await requireUser();
  if (!p.reference.trim()) throw new Error("Référence requise");
  const data = {
    reference: p.reference.trim(),
    image: p.image.trim(),
    alimIntegree: p.alimIntegree,
    alimLabel: p.alimLabel.trim(),
    entreeKind: p.entreeKind.trim() || "UI",
    entreeCount: entier(p.entreeCount),
    sortieKind: p.sortieKind.trim() || "UO",
    sortieCount: entier(p.sortieCount),
    entreeCodes: json(p.entreeCodes ?? []),
    sortieCodes: json(p.sortieCodes ?? []),
    extensible: p.extensible,
    modulesCompat: json(p.extensible ? (p.modulesCompat ?? []) : []),
    maxModules: entier(p.maxModules),
    maxPoints: entier(p.maxPoints),
    docUrl: p.docUrl.trim(),
    actif: p.actif,
    ordre: Math.trunc(Number(p.ordre) || 0),
  };
  if (p.id) await prisma.automateModele.update({ where: { id: p.id }, data });
  else await prisma.automateModele.create({ data });
  revalidate();
}

export async function supprimerAutomate(id: string) {
  await requireUser();
  await prisma.automateModele.delete({ where: { id } });
  revalidate();
}

// --- Modules ----------------------------------------------------------------

export interface ModulePayload {
  id?: string;
  type: string;
  image: string;
  categorie: string;
  entreeKind: string;
  entreeCount: number;
  sortieKind: string;
  sortieCount: number;
  docUrl: string;
  actif: boolean;
  ordre: number;
}

export async function enregistrerModule(p: ModulePayload) {
  await requireUser();
  if (!p.type.trim()) throw new Error("Type requis");
  const data = {
    type: p.type.trim(),
    image: p.image.trim(),
    categorie: p.categorie.trim() || "extension",
    entreeKind: p.entreeKind.trim(),
    entreeCount: entier(p.entreeCount),
    sortieKind: p.sortieKind.trim(),
    sortieCount: entier(p.sortieCount),
    docUrl: p.docUrl.trim(),
    actif: p.actif,
    ordre: Math.trunc(Number(p.ordre) || 0),
  };
  if (p.id) await prisma.moduleModele.update({ where: { id: p.id }, data });
  else await prisma.moduleModele.create({ data });
  revalidate();
}

export async function supprimerModule(id: string) {
  await requireUser();
  await prisma.moduleModele.delete({ where: { id } });
  revalidate();
}

// --- Initialisation depuis les valeurs par défaut ---------------------------

function createAutomate(a: AutomateDef, ordre: number) {
  return {
    reference: a.reference,
    ordre,
    actif: true,
    image: a.image,
    alimIntegree: a.alimIntegree,
    alimLabel: a.alimLabel,
    entreeKind: a.entreeKind,
    entreeCount: a.entreeCount,
    sortieKind: a.sortieKind,
    sortieCount: a.sortieCount,
    entreeCodes: json(a.entreeCodes),
    sortieCodes: json(a.sortieCodes),
    extensible: a.extensible,
    modulesCompat: json(a.modulesCompat),
    maxModules: a.maxModules,
    maxPoints: a.maxPoints,
    docUrl: a.docUrl,
  };
}

function createModule(m: ModuleDef, ordre: number) {
  return {
    type: m.type,
    ordre,
    actif: true,
    image: m.image,
    categorie: m.categorie,
    entreeKind: m.entreeKind,
    entreeCount: m.entreeCount,
    sortieKind: m.sortieKind,
    sortieCount: m.sortieCount,
    docUrl: m.docUrl,
  };
}

/** Peuple la BDD depuis les défauts (upsert par référence/type ; ne réécrit pas
 *  les lignes existantes déjà éditées). */
export async function initialiserCatalogue() {
  await requireUser();
  const def = catalogueParDefaut();
  await prisma.$transaction([
    ...def.automates.map((a, i) =>
      prisma.automateModele.upsert({
        where: { reference: a.reference },
        create: createAutomate(a, i),
        update: {},
      }),
    ),
    ...def.modules.map((m, i) =>
      prisma.moduleModele.upsert({
        where: { type: m.type },
        create: createModule(m, i),
        update: {},
      }),
    ),
  ]);
  revalidate();
}
