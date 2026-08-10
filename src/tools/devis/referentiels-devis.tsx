"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Boxes, Percent, Plus, Trash2, TriangleAlert, Wrench, X } from "lucide-react";
import { Badge, Button, EnteteBloc, Input, Label } from "@/ui";
import { cn } from "@/lib/cn";
import {
  enregistrerCoef,
  enregistrerPrestation,
  supprimerCoef,
  supprimerPrestation,
} from "./actions";
import { SocieteBloc } from "./societe-devis";
import {
  UNITES_PRESTATION,
  formatCoef,
  formatEuros,
  parseCoef,
  parseEuros,
  type PrestationVue,
  type SocieteVue,
} from "./model";
import type { ArticleChoix, CoefLigneVue } from "./queries";

/* =============================================================================
 * LES RÉFÉRENTIELS DE L'OUTIL
 *
 * Deux tables, deux natures :
 *  - les PRESTATIONS sont un vocabulaire (ce qu'on sait vendre en main d'œuvre) ;
 *  - les COEFFICIENTS sont une POLITIQUE COMMERCIALE — elle se révise en bloc,
 *    et elle ne modifie jamais un devis déjà chiffré (chaque ligne porte sa
 *    copie).
 * ========================================================================== */

export function ReferentielsDevis({
  prestations,
  coefs,
  categories,
  coefGlobal,
  societe,
}: {
  prestations: PrestationVue[];
  coefs: CoefLigneVue[];
  categories: { id: string; nom: string }[];
  coefGlobal: number;
  /** L'identité de la maison — troisième table de l'écran, d'une autre nature :
   *  elle ne chiffre rien, elle s'imprime. */
  societe: SocieteVue;
}) {
  const router = useRouter();
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  /* Pas de `useTransition` : une écriture n'est pas un changement de vue, et
     React se réserve le droit d'interrompre puis de rejouer un rendu de
     transition — la réponse du serveur s'y perdait une fois sur cinq (mesuré
     sur l'éditeur, voir le commentaire de `agir` là-bas). Ici le
     rafraîchissement explicite reste nécessaire : deux des quatre actions de
     cet écran ne revalident pas de chemin. */
  async function agir(fn: () => Promise<unknown>) {
    setErreur(null);
    setEnCours(true);
    try {
      await fn();
      router.refresh();
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Opération impossible");
    } finally {
      setEnCours(false);
    }
  }

  return (
    <div className="space-y-5">
      {erreur && (
        <p className="border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
          {erreur}
        </p>
      )}

      <CoefficientsBloc
        coefs={coefs}
        categories={categories}
        coefGlobal={coefGlobal}
        enCours={enCours}
        agir={agir}
      />
      <PrestationsBloc prestations={prestations} enCours={enCours} agir={agir} />
      <SocieteBloc societe={societe} enCours={enCours} agir={agir} />
    </div>
  );
}

/* -----------------------------------------------------------------------------
 * LES COEFFICIENTS
 * -------------------------------------------------------------------------- */

function CoefficientsBloc({
  coefs,
  categories,
  coefGlobal,
  enCours,
  agir,
}: {
  coefs: CoefLigneVue[];
  categories: { id: string; nom: string }[];
  coefGlobal: number;
  enCours: boolean;
  agir: (fn: () => Promise<unknown>) => void;
}) {
  const [global, setGlobal] = useState(formatCoef(coefGlobal).replace("×", ""));
  const [categorieId, setCategorieId] = useState("");
  const [coefCat, setCoefCat] = useState("");

  const parCategorie = coefs.filter((c) => c.portee === "CATEGORIE");
  const parProduit = coefs.filter((c) => c.portee === "PRODUIT");

  return (
    <section className="bloc signal-ao">
      <EnteteBloc
        icone={Percent}
        titre="Coefficients de vente"
        compteur={parCategorie.length + parProduit.length}
        mention="la politique commerciale de la maison"
      />

      <div className="p-4">
        <p className="mb-4 max-w-2xl text-sm text-muted">
          Le prix de vente d&apos;un article se déduit de son déboursé :{" "}
          <strong className="text-fg">déboursé × coefficient</strong>. Le premier trouvé gagne —
          ligne du devis, puis article, puis catégorie, puis défaut du devis. Modifier un
          coefficient ici <strong className="text-fg">ne change aucun devis déjà chiffré</strong> :
          chaque ligne porte sa copie.
        </p>

        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <Label htmlFor="coef-global">Coefficient par défaut de la maison</Label>
            <div className="mt-1 flex gap-2">
              <Input
                id="coef-global"
                value={global}
                onChange={(e) => setGlobal(e.target.value)}
                placeholder="1,35"
                className="tabular-nums"
              />
              <Button
                variant="outline"
                disabled={enCours}
                onClick={() => {
                  const c = parseCoef(global);
                  if (c === null) return;
                  agir(() => enregistrerCoef({ portee: "GLOBAL", coefMillieme: c }));
                }}
              >
                Enregistrer
              </Button>
            </div>
            <p className="mt-1 text-xs text-subtle">
              Il sert à <strong>initialiser</strong> un nouveau devis. Les devis existants gardent
              le leur.
            </p>
          </div>

          <div>
            <Label>Coefficient d&apos;une catégorie</Label>
            <div className="mt-1 flex gap-2">
              <select
                value={categorieId}
                onChange={(e) => setCategorieId(e.target.value)}
                className="h-[var(--control-h)] min-w-0 flex-1 rounded-md border border-border bg-surface px-3 text-sm text-fg"
              >
                <option value="">— Choisir —</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nom}
                  </option>
                ))}
              </select>
              <Input
                value={coefCat}
                onChange={(e) => setCoefCat(e.target.value)}
                placeholder="1,25"
                className="w-24 tabular-nums"
              />
              <Button
                variant="outline"
                disabled={enCours || !categorieId}
                onClick={() => {
                  const c = parseCoef(coefCat);
                  if (c === null || !categorieId) return;
                  agir(async () => {
                    await enregistrerCoef({
                      portee: "CATEGORIE",
                      cibleId: categorieId,
                      coefMillieme: c,
                    });
                    setCoefCat("");
                    setCategorieId("");
                  });
                }}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>

        {/* L'étage le plus fin : un article nommément désigné. Il n'avait aucun
            écran — seul un script pouvait en poser un, ce qui revenait à ne pas
            l'offrir du tout. */}
        <CoefArticle enCours={enCours} agir={agir} />

        {(parCategorie.length > 0 || parProduit.length > 0) && (
          <div className="mt-4 overflow-x-auto">
            <table className="data-table table-cards">
              <thead>
                <tr>
                  <th>Portée</th>
                  <th>Cible</th>
                  <th className="cell-num">Coefficient</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {[...parCategorie, ...parProduit].map((c) => (
                  <tr key={c.id}>
                    <td className="cell-card-title">
                      <Badge tone={c.portee === "PRODUIT" ? "brand" : "neutral"}>
                        {c.portee === "PRODUIT" ? "Article" : "Catégorie"}
                      </Badge>
                    </td>
                    <td data-label="Cible">
                      {c.cibleNom ?? (
                        <span className="text-subtle italic">cible supprimée du magasin</span>
                      )}
                    </td>
                    <td data-label="Coefficient" className="cell-num font-semibold">
                      {formatCoef(c.coefMillieme)}
                    </td>
                    <td>
                      <button
                        title="Retirer cette règle"
                        disabled={enCours}
                        onClick={() => agir(() => supprimerCoef(c.id))}
                        className="p-1 text-subtle hover:text-danger"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}

/* -----------------------------------------------------------------------------
 * LE COEFFICIENT D'UN ARTICLE PRÉCIS
 *
 * On cherche l'article dans le magasin, on le choisit, on pose son coefficient.
 * Le déboursé est affiché pendant la recherche et le prix de vente qui en
 * résultera juste avant d'enregistrer : régler un coefficient sans voir ce qu'il
 * produit, c'est régler à l'aveugle.
 * -------------------------------------------------------------------------- */

function CoefArticle({
  enCours,
  agir,
}: {
  enCours: boolean;
  agir: (fn: () => Promise<unknown>) => void;
}) {
  const [q, setQ] = useState("");
  const [resultats, setResultats] = useState<ArticleChoix[]>([]);
  const [cherche, setCherche] = useState(false);
  const [choisi, setChoisi] = useState<ArticleChoix | null>(null);
  const [coef, setCoef] = useState("");
  const jeton = useRef(0);

  async function chercher(valeur: string) {
    setQ(valeur);
    const monJeton = ++jeton.current;
    if (valeur.trim().length < 2) {
      setResultats([]);
      return;
    }
    setCherche(true);
    try {
      const res = await fetch(`/api/devis/articles?q=${encodeURIComponent(valeur)}`);
      const data = (await res.json()) as ArticleChoix[];
      if (monJeton === jeton.current) setResultats(data);
    } catch {
      if (monJeton === jeton.current) setResultats([]);
    } finally {
      if (monJeton === jeton.current) setCherche(false);
    }
  }

  const coefMillieme = useMemo(() => parseCoef(coef), [coef]);
  const apercu =
    choisi?.debourseCents != null && coefMillieme
      ? Math.round((choisi.debourseCents * coefMillieme) / 1000)
      : null;

  return (
    <div className="mt-4 border-t border-border pt-4">
      <Label>Coefficient d&apos;un article précis</Label>

      {choisi ? (
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-2 border border-border bg-surface-2 px-2.5 py-1.5 text-sm">
            <Boxes className="h-4 w-4 shrink-0 text-io-ai" />
            <span className="ref text-muted">{choisi.refInterne}</span>
            <span className="text-fg">{choisi.designation}</span>
            <button
              onClick={() => {
                setChoisi(null);
                setCoef("");
                setQ("");
              }}
              className="text-subtle hover:text-danger"
              title="Choisir un autre article"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </span>
          <Input
            value={coef}
            onChange={(e) => setCoef(e.target.value)}
            placeholder="1,55"
            className="w-24 tabular-nums"
            onKeyDown={(e) => {
              if (e.key === "Enter" && coefMillieme) {
                agir(async () => {
                  await enregistrerCoef({
                    portee: "PRODUIT",
                    cibleId: choisi.produitId,
                    coefMillieme,
                  });
                  setChoisi(null);
                  setCoef("");
                  setQ("");
                });
              }
            }}
          />
          <Button
            disabled={enCours || !coefMillieme}
            onClick={() =>
              agir(async () => {
                await enregistrerCoef({
                  portee: "PRODUIT",
                  cibleId: choisi.produitId,
                  coefMillieme: coefMillieme!,
                });
                setChoisi(null);
                setCoef("");
                setQ("");
              })
            }
          >
            <Plus className="h-4 w-4" /> Enregistrer
          </Button>

          {/* Ce que le coefficient produira, avant de l'enregistrer. */}
          {choisi.debourseCents === null ? (
            <span className="inline-flex items-center gap-1 text-xs text-warning">
              <TriangleAlert className="h-3.5 w-3.5" />
              Aucun prix d&apos;achat connu : le coefficient ne produira rien tant que le magasin
              ne le connaît pas.
            </span>
          ) : (
            <span className="text-sm text-muted">
              {formatEuros(choisi.debourseCents)}
              {apercu !== null && (
                <>
                  {" → "}
                  <strong className="text-fg">{formatEuros(apercu)}</strong>
                </>
              )}
            </span>
          )}
        </div>
      ) : (
        <>
          <Input
            value={q}
            onChange={(e) => chercher(e.target.value)}
            placeholder="Référence ou désignation de l'article…"
            className="mt-1"
          />
          {(resultats.length > 0 || cherche) && (
            <div className="mt-2 max-h-56 overflow-y-auto border border-border">
              {cherche && resultats.length === 0 && (
                <p className="px-3 py-2 text-sm text-subtle">Recherche…</p>
              )}
              {resultats.map((a) => (
                <button
                  key={a.produitId}
                  onClick={() => {
                    setChoisi(a);
                    setResultats([]);
                  }}
                  className="flex w-full items-center gap-3 border-b border-border px-3 py-2 text-left text-sm last:border-0 hover:bg-surface-2"
                >
                  <Boxes className="h-4 w-4 shrink-0 text-io-ai" />
                  <span className="ref shrink-0 text-muted">{a.refInterne}</span>
                  <span className="flex-1 truncate text-fg">{a.designation}</span>
                  {a.categorieNom && (
                    <span className="hidden text-xs text-subtle sm:inline">{a.categorieNom}</span>
                  )}
                  <span className="whitespace-nowrap text-muted">
                    {a.debourseCents === null ? "sans prix" : formatEuros(a.debourseCents)}
                  </span>
                </button>
              ))}
            </div>
          )}
          {q.trim().length > 0 && q.trim().length < 2 && (
            <p className="mt-1 text-xs text-subtle">Tapez deux caractères pour chercher.</p>
          )}
        </>
      )}
      <p className="mt-1 text-xs text-subtle">
        Le plus fin des trois étages : il gagne sur la catégorie et sur le défaut du devis. Seule
        une ligne de devis peut encore le forcer.
      </p>
    </div>
  );
}

/* -----------------------------------------------------------------------------
 * LES PRESTATIONS
 * -------------------------------------------------------------------------- */

function PrestationsBloc({
  prestations,
  enCours,
  agir,
}: {
  prestations: PrestationVue[];
  enCours: boolean;
  agir: (fn: () => Promise<unknown>) => void;
}) {
  const [libelle, setLibelle] = useState("");
  const [unite, setUnite] = useState<string>("h");
  const [prix, setPrix] = useState("");
  const [famille, setFamille] = useState("");
  const [avecArchivees, setAvecArchivees] = useState(false);

  const visibles = prestations.filter((p) => avecArchivees || p.actif);
  const nbArchivees = prestations.filter((p) => !p.actif).length;

  return (
    <section className="bloc signal-ao">
      <EnteteBloc
        icone={Wrench}
        titre="Prestations"
        compteur={visibles.length}
        mention="ce qu'on sait vendre en main d'œuvre"
      />

      <div className="p-4">
        <p className="mb-4 max-w-2xl text-sm text-muted">
          La main d&apos;œuvre est saisie au <strong className="text-fg">taux de vente</strong> :
          l&apos;outil ne connaît pas son coût interne, elle n&apos;entre donc pas dans le calcul de
          marge. Ce qui n&apos;entre pas dans cette liste se chiffre en ligne « Divers ».
        </p>

        <div className="mb-4 grid gap-2 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_7rem_6rem_auto]">
          <div>
            <Label htmlFor="p-lib">Libellé</Label>
            <Input
              id="p-lib"
              value={libelle}
              onChange={(e) => setLibelle(e.target.value)}
              placeholder="Programmation automate"
            />
          </div>
          <div>
            <Label htmlFor="p-fam">Famille</Label>
            <Input
              id="p-fam"
              value={famille}
              onChange={(e) => setFamille(e.target.value)}
              placeholder="Bureau d'études"
            />
          </div>
          <div>
            <Label htmlFor="p-prix">Taux vendu</Label>
            <Input
              id="p-prix"
              value={prix}
              onChange={(e) => setPrix(e.target.value)}
              placeholder="74,40"
              className="tabular-nums"
            />
          </div>
          <div>
            <Label htmlFor="p-unite">Unité</Label>
            <select
              id="p-unite"
              value={unite}
              onChange={(e) => setUnite(e.target.value)}
              className="h-[var(--control-h)] w-full rounded-md border border-border bg-surface px-2 text-sm text-fg"
            >
              {UNITES_PRESTATION.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-end">
            <Button
              disabled={enCours || !libelle.trim()}
              onClick={() => {
                const c = parseEuros(prix) ?? 0;
                agir(async () => {
                  await enregistrerPrestation({
                    libelle,
                    unite,
                    prixVenteCents: c,
                    famille,
                  });
                  setLibelle("");
                  setPrix("");
                  setFamille("");
                });
              }}
            >
              <Plus className="h-4 w-4" /> Ajouter
            </Button>
          </div>
        </div>

        {nbArchivees > 0 && (
          <label className="mb-3 flex items-center gap-2 text-sm text-muted">
            <input
              type="checkbox"
              checked={avecArchivees}
              onChange={(e) => setAvecArchivees(e.target.checked)}
              className="h-4 w-4 accent-[var(--brand)]"
            />
            Afficher les {nbArchivees} prestation{nbArchivees > 1 ? "s" : ""} archivée
            {nbArchivees > 1 ? "s" : ""}
          </label>
        )}

        {visibles.length === 0 ? (
          <p className="py-6 text-center text-sm text-subtle">
            Aucune prestation. Commence par les trois ou quatre que tu factures le plus souvent.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table table-cards">
              <thead>
                <tr>
                  <th>Prestation</th>
                  <th>Famille</th>
                  <th className="cell-num">Taux vendu</th>
                  <th className="cell-num">Sur devis</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {visibles.map((p) => (
                  <tr key={p.id} className={cn(!p.actif && "opacity-60")}>
                    <td className="cell-title cell-card-title">
                      {p.libelle}
                      {!p.actif && (
                        <Badge tone="neutral" className="ml-2">
                          Archivée
                        </Badge>
                      )}
                    </td>
                    <td data-label="Famille">
                      {p.famille || <span className="text-subtle">—</span>}
                    </td>
                    <td data-label="Taux vendu" className="cell-num font-semibold">
                      {formatEuros(p.prixVenteCents)}
                      <span className="ml-0.5 text-xs font-normal text-subtle">/{p.unite}</span>
                    </td>
                    <td data-label="Sur devis" className="cell-num">
                      {p.nbLignes}
                    </td>
                    <td>
                      <button
                        title={
                          p.nbLignes > 0
                            ? "Portée par des devis : elle sera archivée, pas supprimée"
                            : "Supprimer"
                        }
                        disabled={enCours}
                        onClick={() => agir(() => supprimerPrestation(p.id))}
                        className="p-1 text-subtle hover:text-danger"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
