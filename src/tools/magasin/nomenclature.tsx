"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Ban, Search, Tags } from "lucide-react";
import { Button, Input } from "@/ui";
import type { PointAvecNomenclature } from "./queries";
import { MaterielPoint } from "./materiel-point";
import type { ProduitChoix } from "./saisie-mouvement";

/* =============================================================================
 * LA NOMENCLATURE DES POINTS
 * « Sonde T° gaine » ne coûte pas qu'une entrée analogique : elle appelle une
 * sonde, un doigt de gant, un presse-étoupe. C'est ce tableau qui rend la BOM
 * d'une affaire dérivable depuis la simple liste de points — le plus gros
 * levier du magasin.
 * ========================================================================== */

export function Nomenclature({
  points,
  produits,
}: {
  points: PointAvecNomenclature[];
  produits: ProduitChoix[];
}) {
  const router = useRouter();
  // L'écriture vit dans <MaterielPoint> : ici on ne garde que la recherche et
  // les filtres, et on rafraîchit quand le bloc a écrit.
  const [q, setQ] = useState("");
  /** Les trois états d'un point du catalogue, en filtre : tout · à relier ·
   *  réglé « aucun matériel ». Le dernier était le seul introuvable — un point
   *  réduit au silence ne ressort nulle part, y compris ici. */
  const [vue, setVue] = useState<"tout" | "vides" | "silence">("tout");

  const filtres = useMemo(() => {
    const f = q.trim().toLowerCase();
    return points.filter((p) => {
      if (vue === "vides" && (p.lignes.length > 0 || p.sansMateriel)) return false;
      if (vue === "silence" && !p.sansMateriel) return false;
      if (!f) return true;
      return (
        p.nom.toLowerCase().includes(f) ||
        p.lignes.some(
          (l) =>
            l.refInterne.toLowerCase().includes(f) || l.designation.toLowerCase().includes(f),
        )
      );
    });
  }, [points, q, vue]);

  const nbVides = points.filter((p) => p.lignes.length === 0 && !p.sansMateriel).length;
  const nbSilence = points.filter((p) => p.sansMateriel).length;

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[14rem] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Chercher un point ou un produit…"
            className="pl-8"
          />
        </div>
        <Button
          variant={vue === "vides" ? "accent" : "outline"}
          onClick={() => setVue((v) => (v === "vides" ? "tout" : "vides"))}
        >
          <Tags className="h-4 w-4" />
          Sans nomenclature
          {nbVides > 0 && <span className="ml-1 tabular-nums">({nbVides})</span>}
        </Button>
        <Button
          variant={vue === "silence" ? "accent" : "outline"}
          onClick={() => setVue((v) => (v === "silence" ? "tout" : "silence"))}
          title="Les points réglés « aucun matériel » : ils ne sortent dans AUCUNE BOM et ne sont signalés nulle part. C'est le seul endroit où les revoir."
        >
          <Ban className="h-4 w-4" />
          Aucun matériel
          {nbSilence > 0 && <span className="ml-1 tabular-nums">({nbSilence})</span>}
        </Button>
      </div>

      <div className="data-card divide-y divide-hairline">
        {filtres.length === 0 && (
          <p className="px-4 py-6 text-center text-sm text-subtle">Aucun point.</p>
        )}
        {filtres.map((p) => (
          <div key={p.id} className="px-4 py-3">
            <MaterielPoint point={p} produits={produits} onFait={() => router.refresh()} />
          </div>
        ))}
      </div>
    </>
  );
}
