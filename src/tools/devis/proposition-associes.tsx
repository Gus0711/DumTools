"use client";

import { useMemo, useState } from "react";
import { Boxes, TriangleAlert, X } from "lucide-react";
import { Button } from "@/ui";
import { cn } from "@/lib/cn";
import {
  formatEuros,
  quantiteProposee,
  rangerAssociations,
  type AssociationVue,
} from "@/tools/magasin/model";
import type { ArticleChoix } from "./queries";

/* =============================================================================
 * « CE PRODUIT EN APPELLE D'AUTRES »
 *
 * Le panneau qui s'ouvre quand l'article ajouté a des associations. Il n'existe
 * QUE s'il y a quelque chose à décider : un article sans association s'ajoute
 * d'un clic, comme avant. Une boîte de dialogue qui s'ouvre pour dire « rien à
 * signaler » est le meilleur moyen de la faire fermer sans la lire.
 *
 * Trois règles de lecture :
 *
 *  1. RIEN N'EST AJOUTÉ TANT QU'ON N'A PAS VALIDÉ — y compris l'article
 *     déclencheur. Fermer le panneau, c'est renoncer à l'ajout ; on ne se
 *     retrouve pas avec une ligne à moitié posée dont on ne voulait plus.
 *  2. LES QUANTITÉS SONT PRÉ-REMPLIES JUSTES : l'accessoire à l'unité suit la
 *     quantité du déclencheur, l'article mutualisé non (`parUnite`). C'est tout
 *     l'intérêt du réglage — sinon on corrigerait à chaque fois.
 *  3. « AUCUN » EST UN CHOIX pour un groupe de variantes. On ne vend pas une
 *     fourniture que personne n'a demandée.
 * ========================================================================== */

interface LigneAAjouter {
  produitId: string;
  quantiteMillieme: number;
}

export function PropositionAssocies({
  article,
  associations,
  enCours,
  onAnnuler,
  onValider,
}: {
  article: ArticleChoix;
  associations: AssociationVue[];
  enCours: boolean;
  onAnnuler: () => void;
  onValider: (lignes: LigneAAjouter[]) => void;
}) {
  const { accessoires, groupes } = useMemo(
    () => rangerAssociations(associations),
    [associations],
  );

  /** Quantité du déclencheur — c'est elle qui pilote les pré-remplissages. */
  const [qteA, setQteA] = useState(1);
  const [coches, setCoches] = useState<Set<string>>(
    () => new Set(accessoires.filter((a) => a.parDefaut).map((a) => a.id)),
  );
  const [choix, setChoix] = useState<Record<string, string | null>>(() =>
    Object.fromEntries(groupes.map((g) => [g.nom, g.choisiParDefaut])),
  );
  /** Quantités forcées à la main : tant qu'une ligne n'y figure pas, elle suit
   *  la quantité du déclencheur. C'est ce qui rend le champ « vivant » sans le
   *  rendre têtu. */
  const [forcees, setForcees] = useState<Record<string, number>>({});

  function qteDe(a: AssociationVue): number {
    return forcees[a.id] ?? quantiteProposee(a, qteA);
  }

  function basculer(id: string) {
    setCoches((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  const retenus: AssociationVue[] = [
    ...accessoires.filter((a) => coches.has(a.id)),
    ...groupes.flatMap((g) => {
      const id = choix[g.nom];
      const o = g.options.find((x) => x.id === id);
      return o ? [o] : [];
    }),
  ];

  const totalDebourse =
    (article.debourseCents ?? 0) * qteA +
    retenus.reduce((s, a) => s + (a.debourseCents ?? 0) * qteDe(a), 0);

  function valider() {
    onValider([
      { produitId: article.produitId, quantiteMillieme: qteA * 1000 },
      ...retenus.map((a) => ({ produitId: a.associeId, quantiteMillieme: qteDe(a) * 1000 })),
    ]);
  }

  return (
    <div className="anim-rise mt-2 border border-brand/40 bg-surface">
      <header className="flex flex-wrap items-center gap-3 border-b border-border bg-surface-2 px-3 py-2">
        <Boxes className="h-4 w-4 shrink-0 text-io-ai" />
        <span className="min-w-0 flex-1">
          <span className="ref mr-2 text-muted">{article.refInterne}</span>
          <span className="font-semibold text-fg">{article.designation}</span>
        </span>
        <label className="flex items-center gap-1.5 text-sm text-muted">
          Quantité
          <input
            type="number"
            min={1}
            value={qteA}
            disabled={enCours}
            onChange={(e) => setQteA(Math.max(1, Math.round(Number(e.target.value) || 1)))}
            className="champ-inline w-16 text-right text-sm tabular-nums text-fg"
          />
        </label>
        <button onClick={onAnnuler} className="p-1 text-subtle hover:text-fg" title="Renoncer">
          <X className="h-4 w-4" />
        </button>
      </header>

      <div className="p-3">
        <p className="mb-2 text-xs text-subtle">
          Cet article en appelle d&apos;autres. Décochez ce dont vous n&apos;avez pas besoin — les
          quantités suivent celle ci-dessus quand l&apos;association le prévoit.
        </p>

        {accessoires.length > 0 && (
          <section className="mb-3">
            <p className="stamp mb-1">Accessoires</p>
            <ul className="border border-border">
              {accessoires.map((a) => (
                <li
                  key={a.id}
                  className={cn(
                    "flex flex-wrap items-center gap-2 border-b border-border px-2.5 py-1.5 text-sm last:border-0",
                    !coches.has(a.id) && "opacity-55",
                  )}
                >
                  <input
                    type="checkbox"
                    checked={coches.has(a.id)}
                    disabled={enCours}
                    onChange={() => basculer(a.id)}
                    className="h-4 w-4 shrink-0 accent-[var(--brand)]"
                  />
                  <span className="ref shrink-0 text-subtle">{a.refInterne}</span>
                  <span className="min-w-0 flex-1 truncate text-fg">{a.designation}</span>
                  {a.note && <span className="hidden text-xs text-subtle sm:inline">{a.note}</span>}
                  <PrixAssocie a={a} qte={qteDe(a)} />
                  <ChampQte
                    valeur={qteDe(a)}
                    unite={a.unite}
                    disabled={enCours || !coches.has(a.id)}
                    onChange={(n) => setForcees((f) => ({ ...f, [a.id]: n }))}
                  />
                </li>
              ))}
            </ul>
          </section>
        )}

        {groupes.map((g) => (
          <section key={g.nom} className="mb-3">
            <p className="stamp mb-1">{g.nom} — un seul</p>
            <ul className="border border-border">
              {g.options.map((o) => (
                <li
                  key={o.id}
                  className={cn(
                    "flex flex-wrap items-center gap-2 border-b border-border px-2.5 py-1.5 text-sm last:border-0",
                    choix[g.nom] !== o.id && "opacity-55",
                  )}
                >
                  <input
                    type="radio"
                    name={`grp-${g.nom}`}
                    checked={choix[g.nom] === o.id}
                    disabled={enCours}
                    onChange={() => setChoix((c) => ({ ...c, [g.nom]: o.id }))}
                    className="h-4 w-4 shrink-0 accent-[var(--brand)]"
                  />
                  <span className="ref shrink-0 text-subtle">{o.refInterne}</span>
                  <span className="min-w-0 flex-1 truncate text-fg">{o.designation}</span>
                  <PrixAssocie a={o} qte={qteDe(o)} />
                  <ChampQte
                    valeur={qteDe(o)}
                    unite={o.unite}
                    disabled={enCours || choix[g.nom] !== o.id}
                    onChange={(n) => setForcees((f) => ({ ...f, [o.id]: n }))}
                  />
                </li>
              ))}
              {/* « Aucun » est une option à part entière : le groupe propose une
                  fourniture, il ne l'impose pas. */}
              <li className="flex items-center gap-2 border-t border-border px-2.5 py-1.5 text-sm">
                <input
                  type="radio"
                  name={`grp-${g.nom}`}
                  checked={choix[g.nom] === null}
                  disabled={enCours}
                  onChange={() => setChoix((c) => ({ ...c, [g.nom]: null }))}
                  className="h-4 w-4 shrink-0 accent-[var(--brand)]"
                />
                <span className="text-muted">Aucun</span>
              </li>
            </ul>
          </section>
        ))}

        <div className="flex flex-wrap items-center gap-3 border-t border-border pt-3">
          <Button onClick={valider} disabled={enCours}>
            {enCours
              ? "Ajout…"
              : `Ajouter ${retenus.length + 1} ligne${retenus.length > 0 ? "s" : ""}`}
          </Button>
          <button
            onClick={onAnnuler}
            disabled={enCours}
            className="text-sm text-muted hover:text-fg"
          >
            Renoncer
          </button>
          <span className="text-xs text-subtle">
            Déboursé de l&apos;ensemble : <strong className="text-muted">{formatEuros(totalDebourse)}</strong>
          </span>
        </div>
      </div>
    </div>
  );
}

/** Le déboursé de l'associé, à sa quantité — pour juger sans quitter l'écran. */
function PrixAssocie({ a, qte }: { a: AssociationVue; qte: number }) {
  if (a.debourseCents === null) {
    return (
      <span className="inline-flex items-center gap-1 whitespace-nowrap text-xs text-warning">
        <TriangleAlert className="h-3 w-3" /> sans prix
      </span>
    );
  }
  return (
    <span className="whitespace-nowrap text-xs text-subtle">
      {formatEuros(a.debourseCents * qte)}
    </span>
  );
}

function ChampQte({
  valeur,
  unite,
  disabled,
  onChange,
}: {
  valeur: number;
  unite: string;
  disabled: boolean;
  onChange: (n: number) => void;
}) {
  return (
    <span className="inline-flex items-baseline gap-1">
      <input
        type="number"
        min={1}
        value={valeur}
        disabled={disabled}
        onChange={(e) => onChange(Math.max(1, Math.round(Number(e.target.value) || 1)))}
        className="champ-inline w-14 text-right text-sm tabular-nums text-fg"
      />
      <span className="text-xs text-subtle">{unite}</span>
    </span>
  );
}
