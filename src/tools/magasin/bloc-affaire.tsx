import Link from "next/link";
import { ArrowRight, Boxes, PackageX, TriangleAlert } from "lucide-react";
import { prisma } from "@/lib/db";
import { bomAffaire } from "./bom";
import { coutMaterielAffaire } from "./queries";
import { formatEuros } from "./model";

/* =============================================================================
 * LE BLOC « MATÉRIEL » DE LA FICHE AFFAIRE
 * Un résumé, pas un journal : combien de références, combien manquent, combien
 * est déjà sorti. Le détail vit sur l'écran dédié du magasin — la fiche Affaire
 * ne doit pas se transformer en tableau de stock.
 * ========================================================================== */

export async function BlocMaterielAffaire({
  chantierId,
  peutPrix,
}: {
  chantierId: string;
  peutPrix: boolean;
}) {
  const [bom, nbMouvements, coutSortiCents] = await Promise.all([
    bomAffaire(chantierId),
    prisma.mouvementStock.count({ where: { chantierId } }),
    coutMaterielAffaire(chantierId),
  ]);

  // Rien de dérivable et rien de sorti : le bloc n'a rien à raconter. Des points
  // « pas de notre fourniture » suffisent en revanche à le justifier — une
  // affaire de pure reprise d'existant a un besoin nul, et c'est une information.
  if (
    bom.lignes.length === 0 &&
    nbMouvements === 0 &&
    bom.trous.length === 0 &&
    bom.nbHorsFourniture === 0
  ) {
    return null;
  }

  // Ce qui est coché « hors fourniture » ne pèse sur aucun total (voir bom.ts).
  const aFournir = bom.lignes.filter((l) => !l.horsFourniture);
  const totalManquant = aFournir.reduce((s, l) => s + l.manquant, 0);
  const totalSorti = bom.lignes.reduce((s, l) => s + l.sorti, 0);
  const totalBesoin = aFournir.reduce((s, l) => s + l.besoin, 0);

  return (
    <div className="border border-hairline bg-surface">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3.5">
        <div>
          <span className="stamp block">Besoin</span>
          <span className="font-display text-xl font-bold tabular-nums text-fg">
            {totalBesoin}
          </span>
          <span className="ml-1.5 text-xs text-muted">
            article{totalBesoin > 1 ? "s" : ""} · {aFournir.length} réf.
          </span>
        </div>

        <div>
          <span className="stamp block">Déjà sorti</span>
          <span className="font-display text-xl font-bold tabular-nums text-fg">{totalSorti}</span>
          {peutPrix && coutSortiCents > 0 && (
            <span className="ml-1.5 text-xs text-muted">{formatEuros(coutSortiCents)}</span>
          )}
        </div>

        <div>
          <span className="stamp block">Manque</span>
          <span
            className={`font-display text-xl font-bold tabular-nums ${
              totalManquant > 0 ? "text-danger" : "text-success"
            }`}
          >
            {totalManquant}
          </span>
        </div>

        {peutPrix && (
          <div>
            <span className="stamp block">Coût prévu</span>
            <span className="font-display text-xl font-bold tabular-nums text-fg">
              {formatEuros(bom.coutPrevuCents)}
            </span>
          </div>
        )}

        <Link
          href={`/outils/magasin/affaires/${chantierId}`}
          className="ml-auto inline-flex items-center gap-1.5 text-sm font-semibold text-brand hover:underline"
        >
          <Boxes className="h-4 w-4" />
          Voir le matériel
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>

      {bom.trous.length > 0 && (
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-hairline px-4 py-2.5 text-xs text-muted">
          <TriangleAlert className="h-3.5 w-3.5 shrink-0 text-warning" />
          <span>
            {bom.trous.length} élément{bom.trous.length > 1 ? "s" : ""} (
            {bom.trous
              .slice(0, 3)
              .map((t) => t.nom)
              .join(", ")}
            {bom.trous.length > 3 ? "…" : ""}) ne {bom.trous.length > 1 ? "sont" : "est"} pas
            encore relié{bom.trous.length > 1 ? "s" : ""} à un produit du magasin, donc pas
            compté{bom.trous.length > 1 ? "s" : ""} ici.
          </span>
          <Link
            href={`/outils/magasin/affaires/${chantierId}`}
            className="font-semibold text-brand hover:underline"
          >
            Les relier →
          </Link>
        </p>
      )}

      {bom.nbHorsFourniture > 0 && (
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-hairline px-4 py-2.5 text-xs text-muted">
          <PackageX className="h-3.5 w-3.5 shrink-0 text-accent-strong" />
          <span>
            {bom.nbHorsFourniture} référence{bom.nbHorsFourniture > 1 ? "s" : ""}{" "}
            <strong>hors de notre fourniture</strong> (déjà sur place ou d&apos;un autre lot) :
            raccordée{bom.nbHorsFourniture > 1 ? "s" : ""} et mise
            {bom.nbHorsFourniture > 1 ? "s" : ""} en service, volontairement hors du besoin
            ci-dessus.
          </span>
        </p>
      )}
    </div>
  );
}
