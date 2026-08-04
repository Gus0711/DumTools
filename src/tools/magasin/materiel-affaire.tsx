"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Ban,
  Blocks,
  Boxes,
  Info,
  Link2,
  Loader2,
  PackageCheck,
  PackagePlus,
  PackageX,
  Plus,
  Search,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { Badge, Button, Chiffre, EnteteSection, Input, Label, RangeeChiffres } from "@/ui";
import { cn } from "@/lib/cn";
import {
  associerTrou,
  basculerHorsFourniture,
  enregistrerLigneMateriel,
  marquerPointSansMateriel,
  reserver,
  servirReservation,
  supprimerLigneMateriel,
} from "./actions";
import {
  GENRE_TROU_LABEL,
  formatEuros,
  parseEuros,
  refDepuisLibelle,
  type CategorieVue,
  type DepotVue,
  type FabricantVue,
  type LigneBom,
  type TrouBom,
} from "./model";
import type { ProduitChoix } from "./saisie-mouvement";

/* =============================================================================
 * LE MATÉRIEL D'UNE AFFAIRE
 * La BOM n'est pas saisie : elle est DÉRIVÉE des projets GTB (automate,
 * modules) et des listes de points (nomenclature de chaque point). On n'ajoute
 * à la main que ce que la dérivation ne peut pas deviner.
 *
 * Et surtout : ce qu'elle ne sait pas chiffrer est affiché en clair. Un total
 * faussement complet serait pire que pas de total du tout.
 * ========================================================================== */

export interface ReservationVue {
  id: string;
  produitId: string;
  quantite: number;
}

export interface LigneManuelleVue {
  id: string;
  produitId: string;
  quantite: number;
  note: string;
}

/** Référence interne proposée par défaut quand on crée l'article à la volée :
 *  celle du constructeur pour un automate ou un module (elle est parlante), le
 *  nom du point sinon. */
function refDepuisTrou(t: TrouBom): string {
  return t.genre === "point" ? refDepuisLibelle(t.cle) : t.cle;
}

/** La catégorie qu'un trou appelle probablement. Renvoyée par son NOM : le
 *  serveur la rapproche du référentiel (casse et accents ignorés) et ne la crée
 *  que si elle a réellement été supprimée. */
function categorieProbable(genre: TrouBom["genre"]): string | undefined {
  if (genre === "automate") return "Automate";
  if (genre === "module") return "Module";
  return undefined;
}

interface Reparation {
  genre: TrouBom["genre"];
  cle: string;
  typeIo: string | null;
  recherche: string;
  refInterne: string;
  designation: string;
  quantite: string;
}

/** L'article qu'on ajoute n'existe pas encore au magasin : on le saisit ici, le
 *  strict nécessaire. Sa fiche complète (seuil, doc, codes-barres) se remplit
 *  plus tard depuis le rayon — l'important est de ne pas quitter l'affaire. */
interface Creation {
  refInterne: string;
  designation: string;
  /** "" = aucun · un id · NOUVEAU_FABRICANT pour déplier la saisie. */
  fabricantId: string;
  fabricantNom: string;
  categorieId: string;
  unite: string;
  prix: string;
  fournisseur: string;
}

/** Créer un fabricant depuis ici reste possible, mais jamais par accident : il
 *  faut le demander explicitement dans la liste. */
const NOUVEAU_FABRICANT = "__NOUVEAU__";

interface Ajout {
  recherche: string;
  quantite: string;
  /** null = on cherche dans le rayon ; sinon on saisit l'article manquant. */
  creation: Creation | null;
}

function creationDepuis(recherche: string): Creation {
  const nom = recherche.trim();
  return {
    refInterne: refDepuisLibelle(nom),
    designation: nom,
    fabricantId: "",
    fabricantNom: "",
    categorieId: "",
    unite: "U",
    prix: "",
    fournisseur: "",
  };
}

const selectCls =
  "mt-1 h-[var(--control-h)] w-full rounded-md border border-border bg-surface px-2.5 text-sm text-fg";

export function MaterielAffaire({
  chantierId,
  lignes,
  trous,
  projets,
  coutPrevuCents,
  nbSansPrix,
  reservations,
  lignesManuelles,
  produits,
  depots,
  fabricants,
  categories,
  peutPrix,
  peutGerer,
  coutSortiCents,
  nbHorsFourniture,
}: {
  chantierId: string;
  lignes: LigneBom[];
  trous: TrouBom[];
  projets: { id: string; nom: string }[];
  coutPrevuCents: number;
  nbSansPrix: number;
  nbHorsFourniture: number;
  reservations: ReservationVue[];
  lignesManuelles: LigneManuelleVue[];
  produits: ProduitChoix[];
  depots: DepotVue[];
  fabricants: FabricantVue[];
  categories: CategorieVue[];
  peutPrix: boolean;
  peutGerer: boolean;
  coutSortiCents: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [erreur, setErreur] = useState<string | null>(null);
  const [ajout, setAjout] = useState<Ajout | null>(null);
  const [reparation, setReparation] = useState<Reparation | null>(null);
  const [tousLesTrous, setTousLesTrous] = useState(false);

  const produitsFiltres = (recherche: string) => {
    const f = recherche.trim().toLowerCase();
    if (!f) return produits.slice(0, 6);
    return produits
      .filter(
        (p) =>
          p.refInterne.toLowerCase().includes(f) ||
          p.designation.toLowerCase().includes(f) ||
          (p.refFabricant ?? "").toLowerCase().includes(f),
      )
      .slice(0, 6);
  };

  const depotDefaut = depots.find((d) => d.actif && !d.dortoir)?.id ?? depots[0]?.id ?? "";

  /** L'article en cours de création, extrait une fois pour toutes : le narrowing
   *  de `ajout.creation` ne survivrait pas aux callbacks des champs. */
  const creation = ajout?.creation ?? null;
  const majCreation = (patch: Partial<Creation>) =>
    setAjout((a) => (a?.creation ? { ...a, creation: { ...a.creation, ...patch } } : a));

  function run(action: () => Promise<void>, apres?: () => void) {
    setErreur(null);
    startTransition(async () => {
      try {
        await action();
        apres?.();
        router.refresh();
      } catch (e) {
        setErreur(e instanceof Error ? e.message : "Erreur inattendue");
      }
    });
  }

  // Les lignes hors fourniture restent AFFICHÉES mais ne comptent nulle part :
  // c'est tout l'intérêt de la case.
  const aFournir = lignes.filter((l) => !l.horsFourniture);
  const totalBesoin = aFournir.reduce((s, l) => s + l.besoin, 0);
  const totalManquant = aFournir.reduce((s, l) => s + l.manquant, 0);
  const nbAReserver = aFournir.filter((l) => l.manquant > 0 && l.stock >= l.manquant).length;
  const resultatsAjout = (() => {
    if (!ajout) return [];
    const f = ajout.recherche.trim().toLowerCase();
    if (!f) return produits.slice(0, 8);
    return produits
      .filter(
        (p) =>
          p.refInterne.toLowerCase().includes(f) ||
          p.designation.toLowerCase().includes(f) ||
          (p.refFabricant ?? "").toLowerCase().includes(f),
      )
      .slice(0, 8);
  })();

  return (
    <>
      <RangeeChiffres className="mb-5">
        <Chiffre
          label="Articles à fournir"
          valeur={totalBesoin}
          detail={
            nbHorsFourniture > 0
              ? `${aFournir.length} réf. · ${nbHorsFourniture} hors fourniture`
              : `${lignes.length} références`
          }
        />
        <Chiffre
          label="Manquants"
          valeur={totalManquant}
          ton={totalManquant > 0 ? "danger" : "success"}
          detail={totalManquant > 0 ? "à réserver ou commander" : "tout est couvert"}
        />
        {peutPrix ? (
          <Chiffre
            label="Coût prévu"
            valeur={formatEuros(coutPrevuCents)}
            detail={nbSansPrix > 0 ? `${nbSansPrix} référence(s) sans prix connu` : "au prix moyen"}
          />
        ) : (
          <Chiffre label="Projets GTB" valeur={projets.length} detail="pris en compte" />
        )}
        {peutPrix ? (
          <Chiffre label="Déjà sorti" valeur={formatEuros(coutSortiCents)} detail="coût matériel réel" />
        ) : (
          <Chiffre label="À réserver" valeur={nbAReserver} detail="disponibles en stock" />
        )}
      </RangeeChiffres>

      {erreur && (
        <div className="mb-4 rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
          {erreur}
        </div>
      )}

      {/* Ce qui est EXCLU VOLONTAIREMENT — rien à réparer, juste à savoir ---- */}
      {nbHorsFourniture > 0 && (
        <p className="mb-5 flex items-start gap-2 border border-hairline border-l-2 border-l-accent bg-surface px-4 py-2.5 text-xs leading-relaxed text-muted">
          <PackageX className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent-strong" />
          <span>
            <strong className="font-semibold text-fg">
              {nbHorsFourniture} référence{nbHorsFourniture > 1 ? "s" : ""}
            </strong>{" "}
            coché{nbHorsFourniture > 1 ? "es" : "e"} « hors fourniture » : nécessaire
            {nbHorsFourniture > 1 ? "s" : ""} au chantier, mais déjà sur place ou d&apos;un autre
            lot. On les raccorde et on les met en service sans les vendre — d&apos;où leur absence
            du besoin, du manquant et du coût ci-dessus. Elles restent affichées, barrées, pour
            pouvoir revenir en arrière. Décision propre à <strong>cette affaire</strong>.
          </span>
        </p>
      )}

      {/* Ce que la dérivation ne sait pas chiffrer — et comment le réparer -- */}
      {trous.length > 0 && (
        <div className="bloc mb-5 border-warning/50">
          <div className="flex items-start gap-2 px-4 py-3">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-fg">
                {trous.length} élément{trous.length > 1 ? "s" : ""} pas encore relié
                {trous.length > 1 ? "s" : ""} à un produit
              </p>
              <p className="mt-1 text-xs leading-relaxed text-muted">
                Tant qu&apos;un automate, un module ou un point n&apos;est pas relié à un article
                du magasin, on ne sait ni le compter ni le chiffrer : il n&apos;entre{" "}
                <strong>pas</strong> dans le tableau ci-dessous. Reliez-le ici même — le produit
                peut être choisi dans le magasin ou créé au passage. Et si un point ne demande
                réellement rien (commande sur un contact existant, matériel déjà en place),
                « Aucun matériel » le règle définitivement. C&apos;est à faire{" "}
                <strong>une seule fois</strong> : ensuite, toutes les affaires en profitent.
              </p>
            </div>
            <Button size="sm" variant="ghost" onClick={() => setTousLesTrous((v) => !v)}>
              {tousLesTrous ? "Réduire" : "Tout voir"}
            </Button>
          </div>

          <ul className="divide-y divide-hairline border-t border-hairline">
            {(tousLesTrous ? trous : trous.slice(0, 6)).map((t) => (
              <li key={`${t.genre}:${t.cle}`}>
                <div className="flex flex-wrap items-center gap-2 px-4 py-2.5">
                  <Badge tone="neutral">{GENRE_TROU_LABEL[t.genre]}</Badge>
                  <span className="min-w-0 flex-1 truncate text-sm text-fg">{t.nom}</span>
                  {t.occurrences > 1 && (
                    <span className="tabular-nums text-xs text-muted">×{t.occurrences}</span>
                  )}
                  {peutGerer && t.genre === "point" && (
                    <Button
                      size="sm"
                      variant="ghost"
                      title="Ce point ne demande aucun matériel — il cessera d'être signalé"
                      onClick={() =>
                        run(() =>
                          marquerPointSansMateriel({
                            nom: t.cle,
                            valeur: true,
                            typeIo: t.typeIo,
                            chantierId,
                          }),
                        )
                      }
                    >
                      <Ban className="h-4 w-4" />
                      Aucun matériel
                    </Button>
                  )}
                  {peutGerer ? (
                    <Button
                      size="sm"
                      variant={reparation?.cle === t.cle ? "outline" : "primary"}
                      onClick={() =>
                        setReparation(
                          reparation?.cle === t.cle && reparation.genre === t.genre
                            ? null
                            : {
                                genre: t.genre,
                                cle: t.cle,
                                typeIo: t.typeIo ?? null,
                                recherche: "",
                                refInterne: refDepuisTrou(t),
                                designation: t.nom,
                                quantite: "1",
                              },
                        )
                      }
                    >
                      <Link2 className="h-4 w-4" />
                      Relier
                    </Button>
                  ) : (
                    <span className="text-xs text-subtle">Profil Achats requis</span>
                  )}
                </div>

                {reparation?.cle === t.cle && reparation.genre === t.genre && (
                  <div className="border-t border-hairline bg-surface-2 px-4 py-3">
                    <p className="mb-2 text-xs text-muted">
                      {t.genre === "point"
                        ? "Quel article pose-t-on pour ce point ? (on pourra en ajouter d'autres ensuite : sonde + doigt de gant + presse-étoupe)"
                        : "Quel article du magasin correspond à ce modèle ?"}
                    </p>

                    <div className="relative">
                      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" />
                      <Input
                        autoFocus
                        value={reparation.recherche}
                        onChange={(e) =>
                          setReparation({ ...reparation, recherche: e.target.value })
                        }
                        placeholder="Chercher un produit existant…"
                        className="pl-8"
                      />
                    </div>

                    {produitsFiltres(reparation.recherche).length > 0 && (
                      <ul className="mt-2 max-h-44 overflow-y-auto border border-hairline bg-surface">
                        {produitsFiltres(reparation.recherche).map((prod) => (
                          <li key={prod.id}>
                            <button
                              type="button"
                              onClick={() =>
                                run(
                                  () =>
                                    associerTrou({
                                      genre: reparation.genre,
                                      cle: reparation.cle,
                                      typeIo: reparation.typeIo,
                                      produitId: prod.id,
                                      quantite: Number(reparation.quantite) || 1,
                                      chantierId,
                                    }).then(() => undefined),
                                  () => setReparation(null),
                                )
                              }
                              className="flex w-full items-baseline gap-2 border-b border-hairline px-3 py-2 text-left text-sm transition-colors last:border-0 hover:bg-surface-2"
                            >
                              <span className="ref shrink-0">{prod.refInterne}</span>
                              <span className="min-w-0 flex-1 truncate text-fg">
                                {prod.designation}
                              </span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}

                    {/* Le magasin peut être vide : créer sur place évite d'aller
                        ailleurs et de perdre le fil. */}
                    <div className="mt-3 border-t border-hairline pt-3">
                      <p className="stamp mb-2">Ou créer l&apos;article</p>
                      <div className="grid gap-2 sm:grid-cols-[10rem_minmax(0,1fr)_5rem]">
                        <div>
                          <Label>Réf. interne</Label>
                          <Input
                            value={reparation.refInterne}
                            onChange={(e) =>
                              setReparation({ ...reparation, refInterne: e.target.value })
                            }
                            className="mt-1 font-mono"
                          />
                        </div>
                        <div>
                          <Label>Désignation</Label>
                          <Input
                            value={reparation.designation}
                            onChange={(e) =>
                              setReparation({ ...reparation, designation: e.target.value })
                            }
                            className="mt-1"
                          />
                        </div>
                        <div>
                          <Label>Qté</Label>
                          <Input
                            type="number"
                            min={1}
                            value={reparation.quantite}
                            onChange={(e) =>
                              setReparation({ ...reparation, quantite: e.target.value })
                            }
                            disabled={reparation.genre !== "point"}
                            className="mt-1 tabular-nums"
                          />
                        </div>
                      </div>
                      <div className="mt-2 flex justify-end gap-2">
                        <Button size="sm" variant="ghost" onClick={() => setReparation(null)}>
                          Annuler
                        </Button>
                        <Button
                          size="sm"
                          disabled={
                            pending ||
                            !reparation.refInterne.trim() ||
                            !reparation.designation.trim()
                          }
                          onClick={() =>
                            run(
                              () =>
                                associerTrou({
                                  genre: reparation.genre,
                                  cle: reparation.cle,
                                  typeIo: reparation.typeIo,
                                  nouveauProduit: {
                                    refInterne: reparation.refInterne,
                                    designation: reparation.designation,
                                    categorieNom: categorieProbable(reparation.genre),
                                  },
                                  quantite: Number(reparation.quantite) || 1,
                                  chantierId,
                                }).then(() => undefined),
                              () => setReparation(null),
                            )
                          }
                        >
                          {pending && <Loader2 className="h-4 w-4 animate-spin" />}
                          Créer et relier
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>

          {!tousLesTrous && trous.length > 6 && (
            <p className="border-t border-hairline px-4 py-2 text-xs text-muted">
              et {trous.length - 6} autre{trous.length - 6 > 1 ? "s" : ""}…
            </p>
          )}
        </div>
      )}

      {/* La BOM ------------------------------------------------------------- */}
      <EnteteSection
        icone={Boxes}
        titre="Besoin"
        compteur={lignes.length}
        actions={
          <>
            {pending && <Loader2 className="h-4 w-4 animate-spin text-muted" />}
            <Button
              size="sm"
              variant="outline"
              onClick={() => setAjout({ recherche: "", quantite: "1", creation: null })}
            >
              <Plus className="h-4 w-4" /> Ajouter du matériel
            </Button>
          </>
        }
      />

      {ajout && ajout.creation === null && (
        <div className="bloc mb-3 px-4 py-3">
          <Label>Produit à ajouter</Label>
          <div className="relative mt-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" />
            <Input
              autoFocus
              value={ajout.recherche}
              onChange={(e) => setAjout({ ...ajout, recherche: e.target.value })}
              placeholder="Chercher dans le magasin…"
              className="pl-8"
            />
          </div>

          {resultatsAjout.length > 0 ? (
            <ul className="mt-2 max-h-48 overflow-y-auto border border-hairline">
              {resultatsAjout.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() =>
                      run(
                        () =>
                          enregistrerLigneMateriel({
                            chantierId,
                            produitId: p.id,
                            quantite: Math.max(1, Number(ajout.quantite) || 1),
                          }).then(() => undefined),
                        () => setAjout(null),
                      )
                    }
                    className="flex w-full items-baseline gap-2 border-b border-hairline px-3 py-2 text-left text-sm transition-colors last:border-0 hover:bg-surface-2"
                  >
                    <span className="ref shrink-0">{p.refInterne}</span>
                    <span className="min-w-0 flex-1 truncate text-fg">{p.designation}</span>
                    <span className="shrink-0 text-xs text-muted">stock {p.stock}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 border border-dashed border-hairline px-3 py-3 text-sm text-muted">
              Aucun article du magasin ne correspond
              {ajout.recherche.trim() && (
                <>
                  {" "}
                  à « <strong className="text-fg">{ajout.recherche.trim()}</strong> »
                </>
              )}
              .
            </p>
          )}

          <div className="mt-2 flex flex-wrap items-end gap-2">
            <div className="w-28">
              <Label>Quantité</Label>
              <Input
                type="number"
                min={1}
                value={ajout.quantite}
                onChange={(e) => setAjout({ ...ajout, quantite: e.target.value })}
                className="mt-1 tabular-nums"
              />
            </div>
            <div className="ml-auto flex flex-wrap items-center gap-2">
              {/* Le magasin ne connaît pas tout : rien ne doit obliger à quitter
                  l'affaire, saisir la fiche dans le rayon, puis revenir. */}
              {peutGerer ? (
                <Button
                  variant="outline"
                  onClick={() => setAjout({ ...ajout, creation: creationDepuis(ajout.recherche) })}
                >
                  <PackagePlus className="h-4 w-4" />
                  Créer l&apos;article
                </Button>
              ) : (
                <span className="text-xs text-subtle">
                  Absent du magasin ? Profil Achats requis pour l&apos;y créer.
                </span>
              )}
              <Button variant="ghost" onClick={() => setAjout(null)}>
                Annuler
              </Button>
            </div>
          </div>
        </div>
      )}

      {ajout && creation && (
        <div className="bloc mb-3 px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="stamp">Nouvel article</p>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setAjout({ ...ajout, creation: null })}
            >
              <ArrowLeft className="h-4 w-4" />
              Revenir à la recherche
            </Button>
          </div>
          <p className="mt-1 text-xs leading-relaxed text-muted">
            Le strict nécessaire : l&apos;article entre au magasin <em>et</em> rejoint le besoin de
            cette affaire. Le reste de sa fiche (seuil, emplacement, documentation, codes-barres)
            se complète plus tard depuis le rayon. Une référence interne déjà connue n&apos;en crée
            pas un second : c&apos;est le même article, on le réutilise.
          </p>

          <div className="mt-3 grid gap-3 sm:grid-cols-[12rem_minmax(0,1fr)]">
            <div>
              <Label>Réf. interne *</Label>
              <Input
                autoFocus
                value={creation.refInterne}
                onChange={(e) => majCreation({ refInterne: e.target.value })}
                placeholder="STP100-2"
                className="mt-1 font-mono"
              />
            </div>
            <div>
              <Label>Désignation *</Label>
              <Input
                value={creation.designation}
                onChange={(e) => majCreation({ designation: e.target.value })}
                placeholder="Sonde de température de gaine"
                className="mt-1"
              />
            </div>
          </div>

          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <Label>Catégorie</Label>
              <select
                value={creation.categorieId}
                onChange={(e) => majCreation({ categorieId: e.target.value })}
                className={selectCls}
              >
                <option value="">— Sans catégorie —</option>
                {categories
                  .filter((c) => c.actif)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nom}
                    </option>
                  ))}
              </select>
            </div>
            <div>
              <Label>Unité</Label>
              <select
                value={creation.unite}
                onChange={(e) => majCreation({ unite: e.target.value })}
                className={selectCls}
              >
                <option value="U">Unité</option>
                <option value="m">Mètre</option>
                <option value="kg">Kilo</option>
              </select>
            </div>
            <div>
              <Label>Fabricant</Label>
              <select
                value={creation.fabricantId}
                onChange={(e) => majCreation({ fabricantId: e.target.value })}
                className={selectCls}
              >
                <option value="">— Aucun —</option>
                {fabricants
                  .filter((f) => f.actif)
                  .map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.nom}
                    </option>
                  ))}
                <option value={NOUVEAU_FABRICANT}>＋ Nouveau fabricant…</option>
              </select>
              {creation.fabricantId === NOUVEAU_FABRICANT && (
                <Input
                  autoFocus
                  value={creation.fabricantNom}
                  onChange={(e) => majCreation({ fabricantNom: e.target.value })}
                  placeholder="Nom du fabricant"
                  className="mt-2"
                />
              )}
            </div>
            <div>
              <Label>Quantité</Label>
              <Input
                type="number"
                min={1}
                value={ajout.quantite}
                onChange={(e) => setAjout({ ...ajout, quantite: e.target.value })}
                className="mt-1 tabular-nums"
              />
            </div>
          </div>

          {peutPrix && (
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div>
                <Label>Prix d&apos;achat</Label>
                <Input
                  value={creation.prix}
                  onChange={(e) => majCreation({ prix: e.target.value })}
                  placeholder="0,00"
                  className="mt-1 tabular-nums"
                />
                <p className="mt-1 text-xs text-muted">
                  {parseEuros(creation.prix) !== null
                    ? `${formatEuros(parseEuros(creation.prix))} — sert au coût prévu tant qu'aucune réception n'est valorisée.`
                    : "Facultatif — sans prix, la ligne comptera parmi les références sans prix connu."}
                </p>
              </div>
              <div>
                <Label>Fournisseur</Label>
                <Input
                  value={creation.fournisseur}
                  onChange={(e) => majCreation({ fournisseur: e.target.value })}
                  placeholder="Créé s'il n'existe pas encore"
                  className="mt-1"
                />
              </div>
            </div>
          )}

          <div className="mt-3 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setAjout(null)}>
              Annuler
            </Button>
            <Button
              disabled={pending || !creation.refInterne.trim() || !creation.designation.trim()}
              onClick={() =>
                run(
                  () =>
                    enregistrerLigneMateriel({
                      chantierId,
                      quantite: Math.max(1, Number(ajout.quantite) || 1),
                      nouveauProduit: {
                        refInterne: creation.refInterne,
                        designation: creation.designation,
                        fabricantId:
                          creation.fabricantId === NOUVEAU_FABRICANT
                            ? null
                            : creation.fabricantId || null,
                        fabricantNom:
                          creation.fabricantId === NOUVEAU_FABRICANT
                            ? creation.fabricantNom
                            : null,
                        categorieId: creation.categorieId || null,
                        unite: creation.unite,
                        // Sans le droit de voir les prix, on n'en transmet aucun :
                        // ce n'est pas notre rôle, et l'action le refuserait.
                        prixAchatCents: peutPrix ? parseEuros(creation.prix) : undefined,
                        fournisseurNom: peutPrix ? creation.fournisseur || null : undefined,
                      },
                    }).then(() => undefined),
                  () => setAjout(null),
                )
              }
            >
              {pending && <Loader2 className="h-4 w-4 animate-spin" />}
              Créer et ajouter
            </Button>
          </div>
        </div>
      )}

      <div className="data-card overflow-x-auto">
        <table className="data-table table-cards">
          <thead>
            <tr>
              <th>Produit</th>
              <th>D&apos;où vient le besoin</th>
              <th className="w-28 text-center" title="Nécessaire, mais déjà sur place ou fourni par un autre lot">
                Hors fourniture
              </th>
              <th className="text-right">Besoin</th>
              <th className="text-right">Stock</th>
              <th className="text-right">Réservé</th>
              <th className="text-right">Sorti</th>
              <th className="text-right">Manque</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {lignes.length === 0 && (
              <tr>
                <td colSpan={9} className="py-6 text-center text-sm text-subtle">
                  Rien à sortir pour l&apos;instant — ni projet GTB chiffrable, ni ajout manuel.
                </td>
              </tr>
            )}
            {lignes.map((l) => {
              const reservation = reservations.find((r) => r.produitId === l.produitId);
              const manuelle = lignesManuelles.find((m) => m.produitId === l.produitId);
              return (
                <tr key={l.produitId} className={cn(l.horsFourniture && "text-muted")}>
                  <td className="cell-title cell-card-title cell-wrap">
                    <Link
                      href={`/outils/magasin/produits/${l.produitId}`}
                      className="inline-flex items-baseline gap-2 transition-colors hover:text-brand"
                    >
                      <span className="ref shrink-0">{l.refInterne}</span>
                      <span className="min-w-0">{l.designation}</span>
                    </Link>
                  </td>
                  <td data-label="Origine" className="text-xs text-muted">
                    <ul className="space-y-0.5">
                      {l.origines.map((o, i) => (
                        <li key={i} className="flex items-center gap-1.5">
                          {o.source === "projet" ? (
                            <Blocks className="h-3 w-3 shrink-0 text-subtle" />
                          ) : o.source === "points" ? (
                            <Info className="h-3 w-3 shrink-0 text-subtle" />
                          ) : (
                            <Plus className="h-3 w-3 shrink-0 text-subtle" />
                          )}
                          {o.libelle}
                        </li>
                      ))}
                    </ul>
                  </td>
                  <td data-label="Hors fourniture" className="text-center">
                    <label
                      className="inline-flex cursor-pointer items-center justify-center gap-1.5"
                      title={
                        l.horsFourniture
                          ? "Hors de notre fourniture : compté nulle part, on le raccorde seulement. Décocher pour le remettre au besoin."
                          : "Cocher si cet article est déjà sur place (ou fourni par un autre lot) : il sort du besoin et du coût, sur cette affaire uniquement."
                      }
                    >
                      <input
                        type="checkbox"
                        checked={l.horsFourniture}
                        disabled={pending}
                        onChange={(e) =>
                          run(() =>
                            basculerHorsFourniture({
                              chantierId,
                              produitId: l.produitId,
                              valeur: e.target.checked,
                            }),
                          )
                        }
                        className="h-4 w-4 cursor-pointer accent-accent"
                      />
                      {l.horsFourniture && (
                        <span className="text-xs font-medium text-accent-strong">sur site</span>
                      )}
                    </label>
                  </td>
                  <td data-label="Besoin" className="text-right tabular-nums">
                    {l.horsFourniture ? (
                      <span className="line-through">{l.besoin}</span>
                    ) : (
                      <strong>{l.besoin}</strong>
                    )}
                  </td>
                  <td data-label="Stock" className="text-right tabular-nums">
                    {l.stock}
                  </td>
                  <td data-label="Réservé" className="text-right tabular-nums">
                    {l.reserve > 0 ? l.reserve : <span className="text-subtle">—</span>}
                  </td>
                  <td data-label="Sorti" className="text-right tabular-nums">
                    {l.sorti > 0 ? l.sorti : <span className="text-subtle">—</span>}
                  </td>
                  <td data-label="Manque" className="text-right tabular-nums">
                    {l.horsFourniture ? (
                      // Un « OK » vert mentirait : rien n'est couvert, on ne le
                      // fournit simplement pas.
                      <span className="text-subtle">—</span>
                    ) : l.manquant > 0 ? (
                      <Badge tone={l.stock >= l.manquant ? "warning" : "danger"} point>
                        {l.manquant}
                      </Badge>
                    ) : (
                      <Badge tone="success">OK</Badge>
                    )}
                  </td>
                  <td className="whitespace-nowrap text-right">
                    {l.manquant > 0 && (
                      <Button
                        size="sm"
                        variant="ghost"
                        title="Réserver la quantité manquante"
                        onClick={() =>
                          run(() =>
                            reserver({
                              chantierId,
                              produitId: l.produitId,
                              quantite: l.reserve + l.manquant,
                            }),
                          )
                        }
                      >
                        Réserver
                      </Button>
                    )}
                    {reservation && (
                      <Button
                        size="sm"
                        variant="ghost"
                        title="Sortir le matériel réservé"
                        onClick={() =>
                          run(() =>
                            servirReservation({
                              reservationId: reservation.id,
                              depotSourceId: depotDefaut,
                            }),
                          )
                        }
                      >
                        <PackageCheck className="h-4 w-4" />
                        Sortir
                      </Button>
                    )}
                    {manuelle && (
                      <Button
                        size="sm"
                        variant="ghost"
                        aria-label="Retirer la ligne manuelle"
                        onClick={() => run(() => supprimerLigneMateriel(manuelle.id))}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {projets.length > 0 && (
        <p className={cn("mt-3 text-xs text-subtle")}>
          Dérivé de {projets.length} projet{projets.length > 1 ? "s" : ""} GTB :{" "}
          {projets.map((p) => p.nom).join(", ")}.
        </p>
      )}
    </>
  );
}
