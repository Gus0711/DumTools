import Link from "next/link";
import { ArrowRight, Boxes, PackageX, TriangleAlert } from "lucide-react";
import { EnteteBloc, Repere } from "@/ui";
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
    /* Le vert du signal « DO » — celui de l'outil Magasin dans le registre. */
    <section className="bloc signal-do">
      <EnteteBloc
        icone={Boxes}
        titre="Matériel"
        mention="dérivé des projets GTB et des points, confronté au stock"
        actions={
          <Link
            href={`/outils/magasin/affaires/${chantierId}`}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand transition-colors hover:text-brand-strong"
          >
            Voir le matériel
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        }
      />

      {/* Les chiffres du magasin se lisent comme les repères de l'Avancement :
          une ligne, un libellé estampillé collé devant chaque nombre. Quatre
          gros compteurs empilés faisaient concurrence à la frise du cycle, qui
          est le vrai sujet du haut de fiche. */}
      <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2 px-4 py-2.5">
        <Repere
          label="Besoin"
          valeur={totalBesoin}
          detail={`article${totalBesoin > 1 ? "s" : ""} · ${aFournir.length} réf.`}
        />
        <Repere
          label="Déjà sorti"
          valeur={totalSorti}
          detail={peutPrix && coutSortiCents > 0 ? formatEuros(coutSortiCents) : undefined}
        />
        <Repere
          label="Manque"
          valeur={totalManquant}
          ton={totalManquant > 0 ? "danger" : "success"}
        />
        {peutPrix && <Repere label="Coût prévu" valeur={formatEuros(bom.coutPrevuCents)} />}
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
    </section>
  );
}
