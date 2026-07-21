import type { Metadata } from "next";
import { getVisitePourTerrain, snapshotAffairesPourTerrain } from "@/tools/visites/queries";
import { TerrainVisites } from "@/tools/visites/terrain";

export const metadata: Metadata = { title: "Visites — mode terrain" };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Route TERRAIN des visites (îlot local-first / offline). Le serveur ne fournit
 * qu'un snapshot des affaires (+ réserves ouvertes) que l'îlot met en cache
 * (IndexedDB) pour permettre la création de visite SANS réseau. Tout le reste —
 * liste, édition, photos, vocaux — vit côté client.
 *
 * `?ouvrir=<id>` : « Modifier » depuis la fiche bureau — la visite synchronisée
 * est fournie à l'îlot, qui l'importe dans son store local puis l'ouvre.
 */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ ouvrir?: string }>;
}) {
  const { ouvrir } = await searchParams;
  const [affaires, importer] = await Promise.all([
    snapshotAffairesPourTerrain(),
    ouvrir && UUID_RE.test(ouvrir) ? getVisitePourTerrain(ouvrir) : Promise.resolve(null),
  ]);
  return <TerrainVisites initialAffaires={affaires} importer={importer} />;
}
