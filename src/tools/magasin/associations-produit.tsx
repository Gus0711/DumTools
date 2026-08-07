"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Link2, Plus, Trash2, TriangleAlert, X } from "lucide-react";
import { Badge, Button, Input, Label } from "@/ui";
import { cn } from "@/lib/cn";
import { enregistrerAssociation, supprimerAssociation } from "./actions";
import {
  TYPE_ASSOCIATION_AIDE,
  TYPE_ASSOCIATION_LABEL,
  formatEuros,
  quantiteProposee,
  rangerAssociations,
  type AssociationVue,
  type TypeAssociation,
} from "./model";

/* =============================================================================
 * « CE PRODUIT EN APPELLE D'AUTRES »
 *
 * L'écran de réglage, sur la fiche du produit DÉCLENCHEUR. Ce qu'on y règle est
 * un fait sur le produit, vrai partout — pas une préférence de devis : c'est
 * pourquoi il vit ici et non dans l'outil Devis.
 *
 * Deux natures de lien, et la distinction porte tout :
 *   ACCESSOIRE  proposé EN PLUS, on en coche autant qu'on veut ;
 *   VARIANTE    proposé À LA PLACE des autres de son groupe — un seul, ou aucun.
 *
 * Le réglage qui compte est « par unité » : sans lui, l'alimentation d'un
 * automate ou le coffret mutualisé serait toujours à corriger à la main dans le
 * devis — et c'est justement la correction qu'on ne fait pas.
 * ========================================================================== */

interface ArticleTrouve {
  produitId: string;
  refInterne: string;
  designation: string;
  debourseCents: number | null;
}

export function AssociationsProduit({
  produitId,
  associations,
  groupesConnus,
  peutGerer,
}: {
  produitId: string;
  associations: AssociationVue[];
  /** Noms de groupes déjà utilisés — proposés plutôt que retapés (« Type de
   *  bus » écrit deux fois ferait deux groupes qui ne s'excluent pas). */
  groupesConnus: string[];
  peutGerer: boolean;
}) {
  const router = useRouter();
  const [enCours, demarrer] = useTransition();
  const [erreur, setErreur] = useState<string | null>(null);
  const [ajout, setAjout] = useState(false);

  const { accessoires, groupes } = rangerAssociations(associations);
  // Les archivés ne sont pas proposés au devis, mais ils doivent rester
  // visibles ICI : sinon la règle existe sans qu'on puisse la retirer.
  const archivees = associations.filter((a) => !a.actif);

  function agir(fn: () => Promise<unknown>) {
    setErreur(null);
    demarrer(async () => {
      try {
        await fn();
        router.refresh();
      } catch (e) {
        setErreur(e instanceof Error ? e.message : "Opération impossible");
      }
    });
  }

  return (
    <section className="mb-6">
      <div className="bloc">
        <header className="bloc-entete flex flex-wrap items-center gap-3">
          <Link2 className="h-4 w-4 text-io-ai" />
          <span className="flex-1 font-display font-semibold text-fg">
            Ce produit en appelle d&apos;autres
          </span>
          <span className="text-sm text-subtle">{associations.length}</span>
          {peutGerer && !ajout && (
            <Button size="sm" variant="outline" onClick={() => setAjout(true)}>
              <Plus className="h-3.5 w-3.5" /> Associer un article
            </Button>
          )}
        </header>

        <div className="p-4">
          <p className="mb-4 max-w-2xl text-sm text-muted">
            Quand on ajoute cet article à un devis, ceux-ci sont proposés dans la foulée. Un{" "}
            <strong className="text-fg">accessoire</strong> s&apos;ajoute en plus (on peut en
            cocher plusieurs) ; une <strong className="text-fg">variante</strong> s&apos;ajoute à
            la place des autres de son groupe. Rien n&apos;est imposé : tout se décoche au moment
            du devis.
          </p>

          {erreur && (
            <p className="mb-3 border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
              {erreur}
            </p>
          )}

          {ajout && peutGerer && (
            <FormulaireAssociation
              produitId={produitId}
              groupesConnus={groupesConnus}
              dejaAssocies={associations.map((a) => a.associeId)}
              enCours={enCours}
              agir={agir}
              onFerme={() => setAjout(false)}
            />
          )}

          {associations.length === 0 ? (
            <p className="py-6 text-center text-sm text-subtle">
              Aucune association. C&apos;est ici qu&apos;on dit qu&apos;un automate appelle son
              alimentation, ou qu&apos;une sonde de gaine appelle son doigt de gant.
            </p>
          ) : (
            <>
              {accessoires.length > 0 && (
                <Tableau
                  titre="Accessoires"
                  lignes={accessoires}
                  peutGerer={peutGerer}
                  enCours={enCours}
                  agir={agir}
                />
              )}
              {groupes.map((g) => (
                <Tableau
                  key={g.nom}
                  titre={`${g.nom} — un seul`}
                  lignes={g.options}
                  peutGerer={peutGerer}
                  enCours={enCours}
                  agir={agir}
                  avertissement={
                    g.choisiParDefaut === null
                      ? "Aucune option par défaut : le devis n'en proposera aucune tant qu'on n'aura pas choisi."
                      : undefined
                  }
                />
              ))}
              {archivees.length > 0 && (
                <p className="mt-3 flex items-start gap-2 text-xs text-warning">
                  <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>
                    {archivees.length} association{archivees.length > 1 ? "s pointent" : " pointe"}{" "}
                    vers un article archivé au magasin ({archivees.map((a) => a.refInterne).join(", ")})
                    : elle{archivees.length > 1 ? "s ne seront pas proposées" : " ne sera pas proposée"} au
                    devis.
                  </span>
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </section>
  );
}

function Tableau({
  titre,
  lignes,
  peutGerer,
  enCours,
  agir,
  avertissement,
}: {
  titre: string;
  lignes: AssociationVue[];
  peutGerer: boolean;
  enCours: boolean;
  agir: (fn: () => Promise<unknown>) => void;
  avertissement?: string;
}) {
  return (
    <div className="mb-4 last:mb-0">
      <p className="stamp mb-1">{titre}</p>
      <div className="overflow-x-auto">
        <table className="data-table table-cards">
          <thead>
            <tr>
              <th>Article</th>
              <th className="cell-num">Quantité</th>
              <th>Règle</th>
              <th className="cell-num">Déboursé</th>
              <th>Par défaut</th>
              {peutGerer && <th className="w-12" />}
            </tr>
          </thead>
          <tbody>
            {lignes.map((a) => (
              <tr key={a.id} className={cn(!a.actif && "opacity-55")}>
                <td className="cell-title cell-card-title cell-wrap">
                  <span className="ref mr-2 text-subtle">{a.refInterne}</span>
                  {a.designation}
                  {!a.actif && (
                    <Badge tone="neutral" className="ml-2">
                      Archivé
                    </Badge>
                  )}
                  {a.note && <span className="ml-2 text-xs text-subtle">{a.note}</span>}
                </td>
                <td data-label="Quantité" className="cell-num">
                  {a.quantite} {a.unite}
                </td>
                <td data-label="Règle">
                  {a.parUnite ? (
                    <span className="text-fg">
                      par unité
                      {/* L'exemple chiffré vaut mieux que la définition : on
                          vérifie le réglage d'un coup d'œil. */}
                      <span className="ml-1.5 text-xs text-subtle">
                        (3 → {quantiteProposee(a, 3)})
                      </span>
                    </span>
                  ) : (
                    <span className="text-muted">
                      quantité fixe
                      <span className="ml-1.5 text-xs text-subtle">(3 → {a.quantite})</span>
                    </span>
                  )}
                </td>
                <td data-label="Déboursé" className="cell-num">
                  {a.debourseCents === null ? (
                    <span className="text-warning">sans prix</span>
                  ) : (
                    formatEuros(a.debourseCents)
                  )}
                </td>
                <td data-label="Par défaut">
                  {a.parDefaut ? (
                    <Badge tone="brand">Proposé coché</Badge>
                  ) : (
                    <span className="text-subtle">à cocher</span>
                  )}
                </td>
                {peutGerer && (
                  <td>
                    <button
                      title="Retirer cette association"
                      disabled={enCours}
                      onClick={() => agir(() => supprimerAssociation(a.id))}
                      className="p-1 text-subtle hover:text-danger"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {avertissement && <p className="mt-1 text-xs text-warning">{avertissement}</p>}
    </div>
  );
}

/* -----------------------------------------------------------------------------
 * CRÉER UNE ASSOCIATION
 * -------------------------------------------------------------------------- */

function FormulaireAssociation({
  produitId,
  groupesConnus,
  dejaAssocies,
  enCours,
  agir,
  onFerme,
}: {
  produitId: string;
  groupesConnus: string[];
  dejaAssocies: string[];
  enCours: boolean;
  agir: (fn: () => Promise<unknown>) => void;
  onFerme: () => void;
}) {
  const [q, setQ] = useState("");
  const [resultats, setResultats] = useState<ArticleTrouve[]>([]);
  const [cherche, setCherche] = useState(false);
  const [choisi, setChoisi] = useState<ArticleTrouve | null>(null);
  const [type, setType] = useState<TypeAssociation>("ACCESSOIRE");
  const [groupe, setGroupe] = useState("");
  const [quantite, setQuantite] = useState(1);
  const [parUnite, setParUnite] = useState(true);
  const [parDefaut, setParDefaut] = useState(true);
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
      const data = (await res.json()) as ArticleTrouve[];
      if (monJeton === jeton.current) setResultats(data);
    } catch {
      if (monJeton === jeton.current) setResultats([]);
    } finally {
      if (monJeton === jeton.current) setCherche(false);
    }
  }

  const pret = choisi !== null && (type === "ACCESSOIRE" || groupe.trim().length > 0);

  return (
    <div className="mb-4 border border-border bg-surface-2/50 p-3">
      <div className="mb-2 flex items-center justify-between">
        <p className="stamp">Associer un article</p>
        <button onClick={onFerme} className="p-1 text-subtle hover:text-fg">
          <X className="h-4 w-4" />
        </button>
      </div>

      {!choisi ? (
        <>
          <Input
            autoFocus
            value={q}
            onChange={(e) => chercher(e.target.value)}
            placeholder="Référence ou désignation de l'article à proposer…"
          />
          {(resultats.length > 0 || cherche) && (
            <div className="mt-2 max-h-56 overflow-y-auto border border-border bg-surface">
              {cherche && resultats.length === 0 && (
                <p className="px-3 py-2 text-sm text-subtle">Recherche…</p>
              )}
              {resultats.map((a) => {
                // Ni lui-même, ni un article déjà associé : la contrainte
                // d'unicité les refuserait, autant ne pas les proposer.
                const impossible = a.produitId === produitId || dejaAssocies.includes(a.produitId);
                return (
                  <button
                    key={a.produitId}
                    disabled={impossible}
                    onClick={() => {
                      setChoisi(a);
                      setResultats([]);
                    }}
                    className={cn(
                      "flex w-full items-center gap-3 border-b border-border px-3 py-2 text-left text-sm last:border-0",
                      impossible ? "cursor-not-allowed opacity-45" : "hover:bg-surface-2",
                    )}
                  >
                    <span className="ref shrink-0 text-muted">{a.refInterne}</span>
                    <span className="flex-1 truncate text-fg">{a.designation}</span>
                    {impossible && (
                      <span className="text-xs text-subtle">
                        {a.produitId === produitId ? "c'est cet article" : "déjà associé"}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2 border border-border bg-surface px-2.5 py-1.5 text-sm">
            <span className="ref text-muted">{choisi.refInterne}</span>
            <span className="flex-1 text-fg">{choisi.designation}</span>
            <span className="text-xs text-subtle">{formatEuros(choisi.debourseCents)}</span>
            <button
              onClick={() => setChoisi(null)}
              className="text-subtle hover:text-danger"
              title="Choisir un autre article"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <Label htmlFor="as-type">Nature</Label>
              <select
                id="as-type"
                value={type}
                onChange={(e) => setType(e.target.value as TypeAssociation)}
                className="h-[var(--control-h)] w-full rounded-md border border-border bg-surface px-3 text-sm text-fg"
              >
                <option value="ACCESSOIRE">{TYPE_ASSOCIATION_LABEL.ACCESSOIRE}</option>
                <option value="VARIANTE">{TYPE_ASSOCIATION_LABEL.VARIANTE}</option>
              </select>
              <p className="mt-0.5 text-xs text-subtle">{TYPE_ASSOCIATION_AIDE[type]}</p>
            </div>

            {type === "VARIANTE" && (
              <div>
                <Label htmlFor="as-groupe">Groupe</Label>
                <Input
                  id="as-groupe"
                  list="groupes-assoc"
                  value={groupe}
                  onChange={(e) => setGroupe(e.target.value)}
                  placeholder="Type de bus"
                />
                <datalist id="groupes-assoc">
                  {groupesConnus.map((g) => (
                    <option key={g} value={g} />
                  ))}
                </datalist>
                <p className="mt-0.5 text-xs text-subtle">
                  C&apos;est lui qui rend les options exclusives.
                </p>
              </div>
            )}

            <div>
              <Label htmlFor="as-qte">Quantité</Label>
              <Input
                id="as-qte"
                type="number"
                min={1}
                value={quantite}
                onChange={(e) => setQuantite(Math.max(1, Math.round(Number(e.target.value) || 1)))}
                className="tabular-nums"
              />
            </div>

            <div className="flex flex-col justify-end gap-1.5">
              <label className="flex items-center gap-2 text-sm text-fg">
                <input
                  type="checkbox"
                  checked={parUnite}
                  onChange={(e) => setParUnite(e.target.checked)}
                  className="h-4 w-4 accent-[var(--brand)]"
                />
                Par unité
              </label>
              <label className="flex items-center gap-2 text-sm text-fg">
                <input
                  type="checkbox"
                  checked={parDefaut}
                  onChange={(e) => setParDefaut(e.target.checked)}
                  className="h-4 w-4 accent-[var(--brand)]"
                />
                Proposé coché
              </label>
            </div>
          </div>

          {/* Ce que le réglage produira, avant de l'enregistrer. */}
          <p className="text-xs text-subtle">
            Pour <strong className="text-muted">3</strong> de cet article, le devis proposera{" "}
            <strong className="text-muted">
              {quantiteProposee({ quantite, parUnite }, 3)}
            </strong>{" "}
            × {choisi.designation}
            {parDefaut ? ", coché d'avance." : ", à cocher."}
          </p>

          <div className="flex items-center gap-3">
            <Button
              disabled={enCours || !pret}
              onClick={() =>
                agir(async () => {
                  await enregistrerAssociation({
                    produitId,
                    associeId: choisi.produitId,
                    type,
                    groupe: type === "VARIANTE" ? groupe : null,
                    quantite,
                    parUnite,
                    parDefaut,
                  });
                  onFerme();
                })
              }
            >
              <Plus className="h-4 w-4" /> Enregistrer
            </Button>
            {type === "VARIANTE" && !groupe.trim() && (
              <span className="text-xs text-warning">Une variante a besoin d&apos;un groupe.</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
