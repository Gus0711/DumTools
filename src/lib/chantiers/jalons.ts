import "server-only";
import { prisma } from "@/lib/db";
import type { BesoinArmoire } from "@/generated/prisma/enums";
import { normaliserData } from "@/tools/visites/queries";
import { statsVisite } from "@/tools/visites/model";
import type { ProjetAffaireResume } from "@/tools/affectation-es/queries";
import type { DocResume } from "@/tools/documents/queries";
import { DOSSIER_SCHEMA_ARMOIRE } from "./armoire";

/* =============================================================================
 * FRISE DU CYCLE D'UNE AFFAIRE (docs/ROADMAP.md §3)
 * Les 7 étapes métier — relevé → étude → armoire → programmation → mise en
 * service → livraison → SAV — avec des jalons **entièrement dérivés** des
 * artefacts déjà produits. Aucune saisie : cocher une case à la main mentirait
 * tôt ou tard, un jalon calculé ne ment jamais.
 *
 * C'est l'axe TECHNIQUE. L'axe COMMERCIAL (Devis → Commande → … ) reste
 * `EtatAffaire`, édité sur l'en-tête de la fiche. Les deux sont complémentaires.
 *
 * Étapes dont le signal n'existe pas encore (export WinRelais pour l'armoire,
 * dossier de livraison) : on retombe sur le meilleur signal disponible
 * aujourd'hui, jamais sur une case à cocher.
 * ========================================================================== */

export type EtatJalon =
  /** Atteint : le livrable de l'étape existe. */
  | "fait"
  /** Commencé mais pas terminé. */
  | "encours"
  /** Rien encore. */
  | "attente"
  /** Ne s'applique pas à cette affaire (ex. pas d'armoire à fabriquer). */
  | "sansobjet";

export interface Jalon {
  cle: "releve" | "etude" | "armoire" | "prog" | "mes" | "livraison" | "sav";
  libelle: string;
  etat: EtatJalon;
  /** Ce qui justifie l'état, en clair (« 12/40 points testés »). */
  detail: string;
}

/**
 * Calcule les 7 jalons. Les projets et documents sont passés par l'appelant
 * (la fiche Affaire les charge déjà) ; seules les visites sont lues ici.
 */
export async function calculerJalons(p: {
  chantierId: string;
  besoinArmoire: BesoinArmoire | null;
  projets: ProjetAffaireResume[];
  documents: DocResume[];
}): Promise<Jalon[]> {
  const visites = await prisma.visite.findMany({
    where: { chantierId: p.chantierId },
    select: { type: true, data: true },
  });

  const parType = (t: string) => visites.filter((v) => v.type === t).length;
  const reservesOuvertes = visites.reduce(
    (n, v) => n + statsVisite(normaliserData(v.data)).reservesOuvertes,
    0,
  );

  // --- 1. Relevé : une visite de relevé synchronisée.
  const nbReleves = parType("RELEVE");

  // --- 2. Étude : un automate choisi sur au moins un Projet GTB.
  const avecAutomate = p.projets.filter((x) => x.controller.trim()).length;

  // --- 3. Armoire : le besoin dicte l'attendu (schéma dans le dossier Armoire).
  //     L'export WinRelais (ROADMAP P3) prendra le relais quand il existera.
  const nbSchemas = p.documents.filter((d) => d.categorie === DOSSIER_SCHEMA_ARMOIRE).length;

  // --- 4. Programmation : un livrable de prog déposé en GED (dossier « Prog »
  //     ou fichier .gfx où qu'il soit).
  const nbProg = p.documents.filter(
    (d) => d.categorie === "Prog" || d.nom.toLowerCase().endsWith(".gfx"),
  ).length;

  // --- 5. Mise en service : cumul des points testés de tous les automates.
  const total = p.projets.reduce((n, x) => n + x.tests.total, 0);
  const testes = p.projets.reduce((n, x) => n + x.tests.ok + x.tests.defaut, 0);
  const defauts = p.projets.reduce((n, x) => n + x.tests.defaut, 0);

  // --- 6. Livraison : la visite de réception fait foi (le dossier de livraison
  //     automatique est à venir — ROADMAP P2.1).
  const nbReceptions = parType("RECEPTION");

  // --- 7. SAV : réserves encore ouvertes + passages de maintenance.
  const nbMaintenances = parType("MAINTENANCE");

  return [
    {
      cle: "releve",
      libelle: "Relevé",
      etat: nbReleves > 0 ? "fait" : "attente",
      detail: nbReleves > 0 ? `${nbReleves} visite${nbReleves > 1 ? "s" : ""}` : "aucune visite",
    },
    {
      cle: "etude",
      libelle: "Étude",
      etat: avecAutomate > 0 ? "fait" : p.projets.length > 0 ? "encours" : "attente",
      detail:
        avecAutomate > 0
          ? `${avecAutomate}/${p.projets.length} automate${p.projets.length > 1 ? "s" : ""} choisi${avecAutomate > 1 ? "s" : ""}`
          : p.projets.length > 0
            ? "automate à choisir"
            : "aucun automate",
    },
    {
      cle: "armoire",
      libelle: "Armoire",
      etat:
        p.besoinArmoire === "INTEGRATION"
          ? "sansobjet"
          : p.besoinArmoire === "NOUVELLE"
            ? nbSchemas > 0
              ? "fait"
              : "encours"
            : "attente",
      detail:
        p.besoinArmoire === "INTEGRATION"
          ? "intégration dans l'existant"
          : p.besoinArmoire === "NOUVELLE"
            ? nbSchemas > 0
              ? `${nbSchemas} schéma${nbSchemas > 1 ? "s" : ""}`
              : "schéma attendu"
            : "besoin non défini",
    },
    {
      cle: "prog",
      libelle: "Programmation",
      etat: nbProg > 0 ? "fait" : "attente",
      detail: nbProg > 0 ? `${nbProg} fichier${nbProg > 1 ? "s" : ""}` : "rien déposé",
    },
    {
      cle: "mes",
      libelle: "Mise en service",
      etat: total === 0 ? "attente" : testes >= total ? "fait" : testes > 0 ? "encours" : "attente",
      detail:
        total === 0
          ? "aucune E/S"
          : `${testes}/${total} points${defauts > 0 ? ` · ${defauts} défaut${defauts > 1 ? "s" : ""}` : ""}`,
    },
    {
      cle: "livraison",
      libelle: "Livraison",
      etat: nbReceptions > 0 ? "fait" : "attente",
      detail: nbReceptions > 0 ? "réception faite" : "pas de réception",
    },
    {
      cle: "sav",
      libelle: "SAV",
      etat: reservesOuvertes > 0 ? "encours" : nbMaintenances > 0 ? "fait" : "sansobjet",
      detail:
        reservesOuvertes > 0
          ? `${reservesOuvertes} réserve${reservesOuvertes > 1 ? "s" : ""} ouverte${reservesOuvertes > 1 ? "s" : ""}`
          : nbMaintenances > 0
            ? `${nbMaintenances} passage${nbMaintenances > 1 ? "s" : ""}`
            : "aucune réserve",
    },
  ];
}
