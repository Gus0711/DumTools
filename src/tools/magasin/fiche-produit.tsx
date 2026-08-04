"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeftRight,
  Barcode,
  Boxes,
  CircuitBoard,
  Coins,
  History,
  ClipboardCheck,
  Loader2,
  Archive,
  ArchiveRestore,
  Pencil,
  Tags,
  Trash2,
} from "lucide-react";
import { Badge, Button, EnteteSection, Input, Label } from "@/ui";
import { cn } from "@/lib/cn";
import { fmtDateHeure } from "@/lib/dates";
import { EditeurProduit } from "./editeur-produit";
import { SaisieMouvement, type AffaireChoix, type ProduitChoix } from "./saisie-mouvement";
import {
  basculerActifProduit,
  corrigerStock,
  oublierCode,
  supprimerProduit,
} from "./actions";
import {
  ETAT_EXEMPLAIRE_LABEL,
  MOUVEMENT_LABEL,
  SOURCE_PRIX_LABEL,
  formatEuros,
  sensAffiche,
} from "./model";
import type { CategorieVue, DepotVue, FabricantVue } from "./model";
import type { FicheProduit } from "./queries";
import type { FournisseurVue } from "./queries";

/* =============================================================================
 * LA FICHE PRODUIT
 * Tout ce qu'on veut savoir d'un article : où il est, combien il en reste, ce
 * qu'on l'a payé, qui l'a pris et pour quelle affaire. L'historique est en
 * bonne place : c'est lui qui répond à « où sont passés les 3 modules ? ».
 * ========================================================================== */

const TON_SENS = {
  entree: "text-success",
  sortie: "text-danger",
  interne: "text-muted",
} as const;

export function FicheProduitVue({
  fiche,
  depots,
  affaires,
  fournisseurs,
  fabricants,
  categories,
  autresProduits,
  peutPrix,
  peutGerer,
  peutCorriger,
}: {
  fiche: FicheProduit;
  depots: DepotVue[];
  affaires: AffaireChoix[];
  /** Passée à l'éditeur : le fournisseur se choisit sur la fiche produit. */
  fournisseurs: FournisseurVue[];
  fabricants: FabricantVue[];
  categories: CategorieVue[];
  /** Passée à l'éditeur : pour désigner un remplaçant. */
  autresProduits: { id: string; refInterne: string; designation: string }[];
  peutPrix: boolean;
  peutGerer: boolean;
  /** Correction manuelle du stock : administrateurs seulement. */
  peutCorriger: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [erreur, setErreur] = useState<string | null>(null);
  const [mouvement, setMouvement] = useState(false);
  const [edition, setEdition] = useState(false);
  const [confirmerSuppression, setConfirmerSuppression] = useState(false);
  const [correction, setCorrection] = useState<{
    depotId: string;
    quantite: string;
    motif: string;
  } | null>(null);

  const produitChoix: ProduitChoix = {
    id: fiche.id,
    refInterne: fiche.refInterne,
    refFabricant: fiche.refFabricant,
    designation: fiche.designation,
    unite: fiche.unite,
    serialisable: fiche.serialisable,
    stock: fiche.stock,
    dernierPrixCents: fiche.dernierPrixCents,
  };

  function run(action: () => Promise<void>) {
    setErreur(null);
    startTransition(async () => {
      try {
        await action();
        router.refresh();
      } catch (e) {
        setErreur(e instanceof Error ? e.message : "Erreur inattendue");
      }
    });
  }

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Button onClick={() => setMouvement(true)}>
          <ArrowLeftRight className="h-4 w-4" />
          Mouvement
        </Button>
        {peutCorriger && (
          <Button
            variant="outline"
            onClick={() =>
              setCorrection(
                correction
                  ? null
                  : {
                      depotId: fiche.parDepot.find((d) => !d.dortoir)?.depotId ?? "",
                      quantite: String(
                        fiche.parDepot.find((d) => !d.dortoir)?.quantite ?? fiche.stock,
                      ),
                      motif: "",
                    },
              )
            }
          >
            <ClipboardCheck className="h-4 w-4" />
            Corriger le stock
          </Button>
        )}
        {peutGerer && (
          <>
            <Button variant="outline" onClick={() => setEdition(true)}>
              <Pencil className="h-4 w-4" />
              Modifier
            </Button>
            <Button
              variant="outline"
              title={
                fiche.actif
                  ? "Le retirer du rayon et des listes de choix — son historique reste"
                  : "Le remettre en service"
              }
              onClick={() => run(() => basculerActifProduit(fiche.id, !fiche.actif))}
            >
              {fiche.actif ? (
                <>
                  <Archive className="h-4 w-4" /> Archiver
                </>
              ) : (
                <>
                  <ArchiveRestore className="h-4 w-4" /> Réactiver
                </>
              )}
            </Button>

            {/* Suppression en deux temps, et seulement si rien ne s'y rattache. */}
            {fiche.supprimable &&
              (confirmerSuppression ? (
                <>
                  <span className="text-sm text-danger">Supprimer définitivement ?</span>
                  <Button
                    variant="danger"
                    onClick={() =>
                      run(async () => {
                        await supprimerProduit(fiche.id);
                        router.push("/outils/magasin");
                      })
                    }
                  >
                    Oui, supprimer
                  </Button>
                  <Button variant="ghost" onClick={() => setConfirmerSuppression(false)}>
                    Annuler
                  </Button>
                </>
              ) : (
                <Button
                  variant="ghost"
                  title="Possible : ce produit n'a ni mouvement, ni exemplaire, ni réservation"
                  onClick={() => setConfirmerSuppression(true)}
                >
                  <Trash2 className="h-4 w-4" /> Supprimer
                </Button>
              ))}
          </>
        )}
        {pending && <Loader2 className="h-4 w-4 animate-spin text-muted" />}
      </div>

      {erreur && (
        <div className="mb-4 rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
          {erreur}
        </div>
      )}

      {peutGerer && !fiche.supprimable && !fiche.actif && (
        <p className="mb-4 text-xs text-muted">
          Ce produit ne peut plus être supprimé : il a une histoire (mouvements, exemplaires ou
          réservations). L&apos;archivage le retire du rayon sans effacer cette histoire — c&apos;est
          ce qu&apos;on veut.
        </p>
      )}

      {correction && (
        <div className="bloc mb-4 px-4 py-4">
          <p className="text-sm font-semibold text-fg">Corriger le stock</p>
          <p className="mt-1 text-xs leading-relaxed text-muted">
            Saisissez ce qu&apos;il y a <strong>réellement</strong> en rayon. L&apos;écart sera
            écrit comme un mouvement — le stock n&apos;est jamais modifié en place, et
            l&apos;historique gardera qui a corrigé, quand et pourquoi.
          </p>

          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <div>
              <Label>Dépôt</Label>
              <select
                value={correction.depotId}
                onChange={(e) => {
                  const d = fiche.parDepot.find((x) => x.depotId === e.target.value);
                  setCorrection({
                    ...correction,
                    depotId: e.target.value,
                    quantite: String(d?.quantite ?? 0),
                  });
                }}
                className="mt-1 h-[var(--control-h)] w-full rounded-md border border-border bg-surface px-2.5 text-sm text-fg"
              >
                {fiche.parDepot.map((d) => (
                  <option key={d.depotId} value={d.depotId}>
                    {d.depot} — {d.quantite} {fiche.unite}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label>Quantité réelle</Label>
              <Input
                type="number"
                min={0}
                value={correction.quantite}
                onChange={(e) => setCorrection({ ...correction, quantite: e.target.value })}
                className="mt-1 tabular-nums"
              />
              {(() => {
                const theorique =
                  fiche.parDepot.find((d) => d.depotId === correction.depotId)?.quantite ?? 0;
                const delta = (Number(correction.quantite) || 0) - theorique;
                return (
                  <p
                    className={cn(
                      "mt-1 text-xs",
                      delta === 0 ? "text-muted" : delta > 0 ? "text-success" : "text-danger",
                    )}
                  >
                    {delta === 0
                      ? "Aucun écart : rien ne sera écrit."
                      : `Écart de ${delta > 0 ? "+" : ""}${delta} ${fiche.unite}`}
                  </p>
                );
              })()}
            </div>
            <div>
              <Label>Motif *</Label>
              <Input
                autoFocus
                value={correction.motif}
                onChange={(e) => setCorrection({ ...correction, motif: e.target.value })}
                placeholder="Pris sans scanner par…"
                className="mt-1"
              />
            </div>
          </div>

          <div className="mt-3 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setCorrection(null)} disabled={pending}>
              Annuler
            </Button>
            <Button
              disabled={pending || !correction.motif.trim() || !correction.depotId}
              onClick={() =>
                run(async () => {
                  await corrigerStock({
                    produitId: fiche.id,
                    depotId: correction.depotId,
                    quantiteReelle: Number(correction.quantite) || 0,
                    motif: correction.motif,
                  });
                  setCorrection(null);
                })
              }
            >
              {pending && <Loader2 className="h-4 w-4 animate-spin" />}
              Enregistrer la correction
            </Button>
          </div>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="min-w-0">
          {/* Historique ---------------------------------------------------- */}
          <section className="mb-6">
            <EnteteSection icone={History} titre="Historique" compteur={fiche.mouvements.length} />
            <div className="data-card overflow-x-auto">
              <table className="data-table table-cards">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Mouvement</th>
                    <th className="text-right">Qté</th>
                    <th>Dépôt</th>
                    <th>Affaire</th>
                    {peutPrix && <th className="text-right">Prix unitaire</th>}
                    <th>Par</th>
                  </tr>
                </thead>
                <tbody>
                  {fiche.mouvements.length === 0 && (
                    <tr>
                      <td colSpan={peutPrix ? 7 : 6} className="py-6 text-center text-sm text-subtle">
                        Aucun mouvement — ce produit n&apos;est jamais entré ni sorti.
                      </td>
                    </tr>
                  )}
                  {fiche.mouvements.map((m) => {
                    const sens = sensAffiche(m.type);
                    return (
                      <tr key={m.id}>
                        <td className="cell-card-title whitespace-nowrap">
                          {fmtDateHeure(m.faitLe)}
                        </td>
                        <td data-label="Mouvement">
                          <span className={cn("font-medium", TON_SENS[sens])}>
                            {m.type === "ECART" && !m.inventaireId
                              ? "Correction manuelle"
                              : m.type === "ECART"
                                ? "Écart d'inventaire"
                                : MOUVEMENT_LABEL[m.type]}
                          </span>
                          {m.note && <div className="text-xs text-subtle">{m.note}</div>}
                          {m.numeroAchat && (
                            <div className="text-xs text-subtle">
                              Commande <span className="ref">{m.numeroAchat}</span>
                            </div>
                          )}
                        </td>
                        <td data-label="Qté" className="text-right tabular-nums">
                          <span className={TON_SENS[sens]}>
                            {sens === "sortie" ? "−" : sens === "entree" ? "+" : ""}
                            {m.quantite}
                          </span>
                          {m.nbExemplaires > 0 && (
                            <span className="ml-1 text-xs text-subtle">
                              ({m.nbExemplaires} série{m.nbExemplaires > 1 ? "s" : ""})
                            </span>
                          )}
                        </td>
                        <td data-label="Dépôt" className="text-xs">
                          {m.depotSource && <span>{m.depotSource}</span>}
                          {m.depotSource && m.depotDest && <span className="mx-1">→</span>}
                          {m.depotDest && <span>{m.depotDest}</span>}
                        </td>
                        <td data-label="Affaire">
                          {m.chantierId ? (
                            <Link
                              href={`/affaires/${m.chantierId}`}
                              className="text-brand hover:underline"
                            >
                              {m.chantierNom}
                            </Link>
                          ) : (
                            <span className="text-subtle">—</span>
                          )}
                        </td>
                        {peutPrix && (
                          <td data-label="Prix unitaire" className="text-right tabular-nums">
                            {m.prixUnitaireCents === null ? (
                              <span className="text-subtle">—</span>
                            ) : (
                              formatEuros(m.prixUnitaireCents)
                            )}
                          </td>
                        )}
                        <td data-label="Par" className="text-xs text-muted">
                          {m.auteur ?? "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          {/* Exemplaires --------------------------------------------------- */}
          {fiche.exemplaires.length > 0 && (
            <section className="mb-6">
              <EnteteSection
                icone={Boxes}
                titre="Exemplaires suivis"
                compteur={fiche.exemplaires.length}
              />
              <div className="data-card overflow-x-auto">
                <table className="data-table table-cards">
                  <thead>
                    <tr>
                      <th>N° de série</th>
                      <th>État</th>
                      <th>Où</th>
                    </tr>
                  </thead>
                  <tbody>
                    {fiche.exemplaires.map((e) => (
                      <tr key={e.id}>
                        <td className="cell-card-title">
                          <span className="ref">{e.numeroSerie}</span>
                        </td>
                        <td data-label="État">
                          <Badge
                            tone={
                              e.etat === "EN_STOCK"
                                ? "success"
                                : e.etat === "SORTI"
                                  ? "brand"
                                  : "danger"
                            }
                            point
                          >
                            {ETAT_EXEMPLAIRE_LABEL[e.etat]}
                          </Badge>
                        </td>
                        <td data-label="Où">
                          {e.chantierId ? (
                            <Link
                              href={`/affaires/${e.chantierId}`}
                              className="text-brand hover:underline"
                            >
                              {e.chantierNom}
                            </Link>
                          ) : (
                            (e.depot ?? <span className="text-subtle">—</span>)
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </div>

        {/* Colonne de droite ------------------------------------------------ */}
        <div className="min-w-0">
          {/* Stock par dépôt */}
          <section className="mb-6">
            <EnteteSection icone={Boxes} titre="Stock par dépôt" />
            <div className="bloc divide-y divide-hairline">
              {fiche.parDepot.map((d) => (
                <div key={d.depotId} className="flex items-baseline gap-3 px-4 py-2.5">
                  <span className="min-w-0 flex-1 truncate text-sm text-fg">
                    {d.depot}
                    {d.dortoir && (
                      <span className="ml-1.5 text-xs text-subtle">(consommé)</span>
                    )}
                  </span>
                  <span className="font-display text-lg font-bold tabular-nums text-fg">
                    {d.quantite}
                  </span>
                  <span className="text-xs text-subtle">{fiche.unite}</span>
                </div>
              ))}
            </div>
          </section>

          {/* Prix d'achat : d'où viennent les chiffres ------------------- */}
          {peutPrix && (
            <section className="mb-6">
              <EnteteSection icone={Coins} titre="Prix d'achat" />
              <div className="bloc divide-y divide-hairline">
                <div className="flex items-baseline gap-3 px-4 py-2.5">
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm text-fg">Prix moyen payé</span>
                    <span className="block text-xs text-subtle">
                      Moyenne pondérée de toutes les réceptions valorisées — ce que le stock a
                      réellement coûté.
                    </span>
                  </span>
                  <span className="shrink-0 tabular-nums text-sm font-semibold text-fg">
                    {formatEuros(fiche.pmpCents)}
                  </span>
                </div>
                <div className="flex items-baseline gap-3 px-4 py-2.5">
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm text-fg">Dernier prix payé</span>
                    <span className="block text-xs text-subtle">
                      La dernière réception. C&apos;est lui qui pré-remplit la prochaine saisie.
                    </span>
                  </span>
                  <span className="shrink-0 tabular-nums text-sm text-fg">
                    {formatEuros(fiche.dernierPrixCents)}
                  </span>
                </div>
                <div className="flex items-baseline gap-3 px-4 py-2.5">
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm text-fg">Prix d&apos;achat annoncé</span>
                    <span className="block text-xs text-subtle">
                      Celui de la fiche produit. Sert à chiffrer tant qu&apos;on n&apos;a rien reçu.
                    </span>
                  </span>
                  <span className="shrink-0 tabular-nums text-sm text-fg">
                    {formatEuros(fiche.prixAchatCents)}
                  </span>
                </div>
                <div className="flex items-baseline gap-3 px-4 py-2.5">
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm text-fg">Fournisseur</span>
                    <span className="block text-xs text-subtle">
                      {fiche.refFournisseur
                        ? `Sa référence : ${fiche.refFournisseur}`
                        : "Un produit, un fournisseur — le cas rare se note dans la fiche."}
                      {fiche.delaiJours !== null ? ` · ${fiche.delaiJours} j de délai` : ""}
                    </span>
                  </span>
                  <span className="shrink-0 text-sm text-fg">
                    {fiche.fournisseurNom ?? <span className="text-subtle">—</span>}
                  </span>
                </div>
              </div>
              {fiche.prixRefCents === null ? (
                <p className="mt-2 text-xs text-muted">
                  Aucun prix connu : ce produit ne compte ni dans la valeur du stock ni dans le
                  coût d&apos;une affaire. Un prix apparaît dès la première{" "}
                  <strong>réception valorisée</strong>, ou dès qu&apos;un{" "}
                  <strong>prix d&apos;achat</strong> est saisi sur la fiche (bouton
                  « Modifier »).
                </p>
              ) : (
                <p className="mt-2 text-xs text-muted">
                  Chiffré au <strong>{SOURCE_PRIX_LABEL[fiche.sourcePrix as "pmp" | "achat"]}</strong>{" "}
                  ({formatEuros(fiche.prixRefCents)}).
                </p>
              )}
            </section>
          )}

          {/* Codes-barres appris */}
          <section className="mb-6">
            <EnteteSection icone={Barcode} titre="Codes appris" compteur={fiche.codes.length} />
            <div className="bloc divide-y divide-hairline">
              {fiche.codes.length === 0 && (
                <p className="px-4 py-3 text-sm text-subtle">
                  Aucun code. Scannez ce produit une fois : le code du carton sera retenu pour
                  toujours.
                </p>
              )}
              {fiche.codes.map((c) => (
                <div key={c.id} className="flex items-baseline gap-2 px-4 py-2.5">
                  <span className="ref min-w-0 flex-1 truncate">{c.code}</span>
                  <span className="text-xs text-subtle">{c.format ?? "saisi"}</span>
                  {peutGerer && (
                    <button
                      type="button"
                      onClick={() => run(() => oublierCode(c.id))}
                      aria-label="Oublier ce code"
                      className="text-subtle transition-colors hover:text-danger"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </section>

          {/* Rattachements techniques & nomenclature */}
          {(fiche.modelesTechniques.length > 0 || fiche.pointsAppelants.length > 0) && (
            <section className="mb-6">
              <EnteteSection icone={CircuitBoard} titre="Dans le métier" />
              <div className="bloc divide-y divide-hairline">
                {fiche.modelesTechniques.map((m) => (
                  <div key={`${m.type}-${m.reference}`} className="px-4 py-2.5 text-sm">
                    <span className="stamp mr-2">{m.type === "automate" ? "Automate" : "Module"}</span>
                    <span className="ref">{m.reference}</span>
                  </div>
                ))}
                {fiche.pointsAppelants.length > 0 && (
                  <div className="px-4 py-2.5">
                    <div className="flex items-center gap-1.5 text-xs text-muted">
                      <Tags className="h-3.5 w-3.5" />
                      Appelé par {fiche.pointsAppelants.length} point
                      {fiche.pointsAppelants.length > 1 ? "s" : ""} du catalogue
                    </div>
                    <ul className="mt-1.5 space-y-0.5 text-sm text-fg">
                      {fiche.pointsAppelants.map((p) => (
                        <li key={p.id}>
                          {p.nom}
                          {p.quantite > 1 && (
                            <span className="text-subtle"> × {p.quantite}</span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </section>
          )}

          <p className="text-xs text-subtle">
            {fiche.categorieNom ? `Catégorie ${fiche.categorieNom}` : "Sans catégorie"}
            {fiche.fabricantNom ? ` · ${fiche.fabricantNom}` : ""}
            {fiche.note ? ` · ${fiche.note}` : ""}
          </p>
        </div>
      </div>

      {mouvement && (
        <SaisieMouvement
          produits={[produitChoix]}
          depots={depots}
          affaires={affaires}
          peutPrix={peutPrix}
          produitInitial={fiche.id}
          onFermer={() => setMouvement(false)}
        />
      )}

      {edition && (
        <EditeurProduit
          initial={{
            id: fiche.id,
            refInterne: fiche.refInterne,
            refFabricant: fiche.refFabricant,
            designation: fiche.designation,
            fabricantId: fiche.fabricantId,
            categorieId: fiche.categorieId,
            unite: fiche.unite,
            serialisable: fiche.serialisable,
            seuilMini: fiche.seuilMini,
            emplacement: fiche.emplacement,
            docUrl: fiche.docUrl,
            note: fiche.note,
            remplaceParId: fiche.remplaceParId,
            fournisseurId: fiche.fournisseurId,
            refFournisseur: fiche.refFournisseur,
            prixAchatCents: fiche.prixAchatCents,
            delaiJours: fiche.delaiJours,
          }}
          fournisseurs={fournisseurs}
          fabricants={fabricants}
          categories={categories}
          produits={autresProduits}
          peutPrix={peutPrix}
          onFermer={() => setEdition(false)}
        />
      )}
    </>
  );
}
