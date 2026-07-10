import "server-only";
import { TOOLS } from "@/tools/registry";
import { listerPourChantier as affectationPourChantier } from "@/tools/affectation-es/queries";
import { listerPourChantier as documentsPourChantier } from "@/tools/documents/queries";
import type { ClientArtefact, ClientRealisation } from "@/lib/clients/types";

/* =============================================================================
 * AGRÉGATION AFFAIRE (multi-outils)
 * La fiche Affaire agrège « tout ce qui a été produit » pour une affaire (un
 * numéro Why) à travers TOUS les outils. Chaque outil qui rattache sa production
 * à une Affaire fournit un provider : (chantierId) => ClientArtefact[]. On
 * l'enregistre ici par son id d'outil (celui du registre src/tools/registry.ts).
 *
 * >>> AJOUTER UN OUTIL À LA FICHE AFFAIRE <<<
 *   1. Ajouter `chantierId` sur son entité principale (schema.prisma).
 *   2. Résoudre le chantierId au save (voir resoudreChantierId).
 *   3. Exporter `listerPourChantier(chantierId): Promise<ClientArtefact[]>`
 *      depuis son module queries.ts.
 *   4. Enregistrer le provider dans PROVIDERS ci-dessous.
 * Rien d'autre : la fiche Affaire le prend en compte automatiquement.
 * ========================================================================== */

type ChantierProvider = (chantierId: string) => Promise<ClientArtefact[]>;

const PROVIDERS: Record<string, ChantierProvider> = {
  "affectation-es": affectationPourChantier,
  documents: documentsPourChantier,
};

/** Artefacts d'une affaire, tous outils confondus, du + récent au + ancien. */
export async function listerRealisationsAffaire(
  chantierId: string,
): Promise<ClientRealisation[]> {
  const out: ClientRealisation[] = [];
  const results = await Promise.all(
    TOOLS.map(async (tool) => {
      const provider = PROVIDERS[tool.id];
      if (!provider) return [] as ClientRealisation[];
      const items = await provider(chantierId);
      return items.map((a) => ({ ...a, toolId: tool.id, toolNom: tool.nom }));
    }),
  );
  for (const list of results) out.push(...list);
  return out.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
}
