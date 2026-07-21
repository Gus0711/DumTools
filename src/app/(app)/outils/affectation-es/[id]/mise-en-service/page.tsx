import { notFound } from "next/navigation";
import { getProjet } from "@/tools/affectation-es/queries";
import { moduleDisplayTitle, type Module } from "@/tools/affectation-es/model";
import { MiseEnServiceOffline } from "@/tools/affectation-es/mise-en-service-offline";
import type { MesPoint } from "@/lib/offline/mise-en-service";

/**
 * Route TERRAIN de la mise en service (îlot local-first / offline).
 * Séparée de l'éditeur monolithique : ici on ne charge qu'un snapshot léger des
 * points affectés, que le composant client met en cache (IndexedDB) et édite
 * hors-ligne. La ré-affectation lourde reste dans l'éditeur en ligne.
 */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const projet = await getProjet(id);
  if (!projet) notFound();

  const modules: Module[] = projet.project.modules ?? [];

  const points: MesPoint[] = (projet.project.points ?? [])
    .filter((p) => p.active && p.module != null && p.channel != null)
    .sort((a, b) => {
      const am = Number(a.module) - Number(b.module);
      if (am !== 0) return am;
      if (a.direction !== b.direction) return a.direction === "input" ? -1 : 1;
      return Number(a.channel) - Number(b.channel);
    })
    .map((p) => ({
      uid: p.uid,
      repere: p.repere,
      designation: p.designation,
      source: p.source,
      module: p.module ?? null,
      channel: p.channel ?? null,
      direction: p.direction,
      testStatus: p.testStatus,
      testComment: p.testComment,
    }));

  const moduleLabels: Record<number, string> = {};
  for (const n of new Set(points.map((p) => Number(p.module)))) {
    const mod = modules.find((m) => Number(m.number) === n) ?? null;
    moduleLabels[n] = mod ? moduleDisplayTitle(mod, modules) : `Module ${n}`;
  }

  return (
    <MiseEnServiceOffline
      snapshot={{ id: projet.id, nom: projet.nom, points }}
      moduleLabels={moduleLabels}
      retourHref={`/outils/affectation-es/${projet.id}`}
    />
  );
}
