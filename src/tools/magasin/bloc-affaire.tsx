import Link from "next/link";
import { ArrowRight, Boxes, PackageX, TriangleAlert } from "lucide-react";
import { EnteteBloc, Repere } from "@/ui";
import { prisma } from "@/lib/db";
import { bomAffaire } from "./bom";
import { coutMaterielAffaire } from "./queries";
import { formatEuros } from "./model";
import { basculerArretBom } from "@/lib/chantiers/actions";
import { BasculeArret } from "@/lib/chantiers/bascule-arret";
import { arretBom } from "@/lib/chantiers/arret-serveur";

/* =============================================================================
 * LE BLOC « MATÉRIEL » DE LA FICHE AFFAIRE
 * Un résumé, pas un journal : combien de références, combien manquent, combien
 * est déjà sorti. Le détail vit sur l'écran dédié du magasin — la fiche Affaire
 * ne doit pas se transformer en tableau de stock.
 * ========================================================================== */

export async function BlocMaterielAffaire({
  chantierId,
  nbAutomates,
  peutPrix,
}: {
  chantierId: string;
  /** Combien d'automates l'affaire porte — sert à NOMMER la source du besoin
   *  (« dérivé des 3 automates ci-dessus »). Le bloc suivait autrefois le
   *  tableau des automates bord à bord, et l'adjacence disait la dérivation
   *  toute seule ; elle la disait si bien qu'on ne voyait plus la frontière.
   *  Le lien est maintenant énoncé, ce qui permet de rendre le blanc. */
  nbAutomates: number;
  peutPrix: boolean;
}) {
  const [bom, nbMouvements, coutSortiCents, arret] = await Promise.all([
    bomAffaire(chantierId),
    prisma.mouvementStock.count({ where: { chantierId } }),
    coutMaterielAffaire(chantierId),
    arretBom(chantierId),
  ]);

  // Rien de dérivable et rien de sorti : le bloc n'a rien à raconter. Des points
  // « pas de notre fourniture » suffisent en revanche à le justifier — une
  // affaire de pure reprise d'existant a un besoin nul, et c'est une information.
  if (
    bom.lignes.length === 0 &&
    nbMouvements === 0 &&
    bom.trous.length === 0 &&
    bom.nbHorsFourniture === 0 &&
    // ⚠️ …sauf si quelqu'un a déclaré le besoin arrêté : masquer le bloc
    // rendrait sa propre déclaration impossible à défaire.
    arret.etat === "ouvert"
  ) {
    return null;
  }

  // Ce qui est coché « hors fourniture » ne pèse sur aucun total (voir bom.ts).
  const aFournir = bom.lignes.filter((l) => !l.horsFourniture);
  const totalManquant = aFournir.reduce((s, l) => s + l.manquant, 0);
  const totalSorti = bom.lignes.reduce((s, l) => s + l.sorti, 0);
  const totalBesoin = aFournir.reduce((s, l) => s + l.besoin, 0);

  return (
    /* Le vert du signal « DO » — celui de l'outil Magasin dans le registre.
       Le filet de 3 px qui coiffe le bloc n'est pas un ornement : c'est LUI qui
       tranche avec le fond creusé d'une ligne d'entêtes de tableau, seule chose
       à quoi ce bandeau ressemblait quand il était collé sous les automates. */
    <section className="bloc signal-do border-t-[3px] border-t-signal">
      <EnteteBloc
        icone={Boxes}
        titre="Matériel"
        mention={
          // « dérivé des 1 automate » : l'accord ne se règle pas en collant un
          // « s », le déterminant change aussi.
          nbAutomates === 0
            ? "dérivé des projets GTB et des points, confronté au stock"
            : nbAutomates === 1
              ? "dérivé de l'automate ci-dessus, confronté au stock"
              : `dérivé des ${nbAutomates} automates ci-dessus, confronté au stock`
        }
        actions={
          <span className="flex items-center gap-3">
            <BasculeArret
              etat={arret.etat}
              arreteLe={arret.arreteeLe}
              arretePar={arret.arreteeParNom}
              referenceLe={arret.referenceLe}
              quoi="Le besoin en matériel"
              basculer={async () => {
                "use server";
                await basculerArretBom(chantierId);
              }}
            />
            <Link
              href={`/outils/magasin/affaires/${chantierId}`}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand transition-colors hover:text-brand-strong"
            >
              Voir le matériel
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </span>
        }
      />

      {/* Les chiffres du magasin se lisent comme les repères de l'Avancement :
          une ligne, un libellé estampillé collé devant chaque nombre. Quatre
          gros compteurs empilés faisaient concurrence à la frise du cycle, qui
          est le vrai sujet du haut de fiche. */}
      <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2 px-4 py-3.5">
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
            {/* « ne est pas » au singulier : l'élision se joue sur le mot entier,
                pas sur le seul verbe. */}
            {bom.trous.length > 3 ? "…" : ""}) {bom.trous.length > 1 ? "ne sont" : "n'est"} pas
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
