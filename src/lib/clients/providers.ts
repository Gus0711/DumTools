import "server-only";
import { TOOLS } from "@/tools/registry";
import { listerPourClient as affectationPourClient } from "@/tools/affectation-es/queries";
import { listerPourClient as documentsPourClient } from "@/tools/documents/queries";
import { listerPourClient as visitesPourClient } from "@/tools/visites/queries";
import { listerPourClient as notesPourClient } from "@/tools/notes/queries";
import type { ClientArtefact, ClientRealisation } from "./types";

/* =============================================================================
 * AGRÉGATION CLIENT (multi-outils)
 * La fiche client agrège « tout ce qui a été fait » pour un client à travers
 * TOUS les outils. Chaque outil qui rattache sa production à un Client fournit
 * un provider : (clientId) => ClientArtefact[]. On l'enregistre ici par son id
 * d'outil (celui du registre src/tools/registry.ts).
 *
 * >>> AJOUTER UN OUTIL À LA FICHE CLIENT <<<
 *   1. Ajouter `clientId` + `numeroWhy` sur son entité principale (schema.prisma).
 *   2. Exporter `listerPourClient(clientId): Promise<ClientArtefact[]>` depuis
 *      son module queries.ts (résout clientId au save : voir resoudreClientId).
 *   3. Enregistrer le provider dans PROVIDERS ci-dessous.
 * Rien d'autre : la fiche client le prend en compte automatiquement.
 * ========================================================================== */

type ClientProvider = (clientId: string) => Promise<ClientArtefact[]>;

const PROVIDERS: Record<string, ClientProvider> = {
  "affectation-es": affectationPourClient,
  visites: visitesPourClient,
  notes: notesPourClient,
  documents: documentsPourClient,
};

/** Réalisations d'un client, tous outils confondus, triées du + récent au + ancien. */
export async function listerRealisationsClient(
  clientId: string,
): Promise<ClientRealisation[]> {
  const out: ClientRealisation[] = [];
  // On parcourt dans l'ordre du registre pour un affichage stable.
  const results = await Promise.all(
    TOOLS.map(async (tool) => {
      const provider = PROVIDERS[tool.id];
      if (!provider) return [] as ClientRealisation[];
      const items = await provider(clientId);
      return items.map((a) => ({ ...a, toolId: tool.id, toolNom: tool.nom }));
    }),
  );
  for (const list of results) out.push(...list);
  return out.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
}
