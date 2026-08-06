"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Archive, ArrowLeftRight, Plus, Search, TriangleAlert } from "lucide-react";
import { Badge, Button, Chiffre, Input, RangeeChiffres } from "@/ui";
import { cn } from "@/lib/cn";
import { boolUrl, useSyncUrl } from "@/lib/filtres-url";
import { EditeurProduit } from "./editeur-produit";
import { SaisieMouvement, type AffaireChoix } from "./saisie-mouvement";
import {
  formatEuros,
  type CategorieVue,
  type DepotVue,
  type FabricantVue,
  type ProduitRayon,
} from "./model";
import type { FournisseurVue, StatsMagasin } from "./queries";

/* =============================================================================
 * LE RAYON
 * La liste du magasin, avec en tête ce qui compte vraiment : ce qui est passé
 * sous son seuil, c'est-à-dire la liste de courses. Le reste est un tableau
 * qu'on filtre.
 * ========================================================================== */

export function Rayon({
  lignes,
  stats,
  depots,
  affaires,
  fournisseurs,
  fabricants,
  categories,
  peutPrix,
  peutGerer,
}: {
  lignes: ProduitRayon[];
  stats: StatsMagasin;
  depots: DepotVue[];
  affaires: AffaireChoix[];
  fournisseurs: FournisseurVue[];
  fabricants: FabricantVue[];
  categories: CategorieVue[];
  peutPrix: boolean;
  peutGerer: boolean;
}) {
  // Recherche et filtres rangés dans l'URL : ouvrir une fiche produit puis
  // revenir ne doit pas rendre le rayon entier (voir lib/filtres-url).
  const params = useSearchParams();
  const [q, setQ] = useState(() => params.get("q") ?? "");
  const [categorieId, setCategorieId] = useState(() => params.get("cat") ?? "TOUTES");
  const [seulementAlertes, setSeulementAlertes] = useState(() => boolUrl(params.get("alertes")));
  // Les archivés sont chargés mais masqués : on les retrouve d'un clic, sans
  // aller-retour serveur, et sans encombrer le rayon au quotidien.
  const [avecArchives, setAvecArchives] = useState(() => boolUrl(params.get("archives")));
  useSyncUrl({
    q,
    cat: categorieId === "TOUTES" ? "" : categorieId,
    alertes: seulementAlertes,
    archives: avecArchives,
  });
  const [mouvement, setMouvement] = useState<{ produitId?: string } | null>(null);
  const [creation, setCreation] = useState(false);

  const filtrees = useMemo(() => {
    const f = q.trim().toLowerCase();
    return lignes.filter((l) => {
      if (!avecArchives && !l.actif) return false;
      // « SANS » est un filtre à part entière : c'est le seul moyen de retrouver
      // ce qui est tombé hors catégorie après une suppression.
      if (categorieId === "SANS" && l.categorieId !== null) return false;
      if (categorieId !== "TOUTES" && categorieId !== "SANS" && l.categorieId !== categorieId) {
        return false;
      }
      if (seulementAlertes && !l.sousSeuil) return false;
      if (!f) return true;
      return (
        l.refInterne.toLowerCase().includes(f) ||
        (l.refFabricant ?? "").toLowerCase().includes(f) ||
        l.designation.toLowerCase().includes(f) ||
        (l.fabricantNom ?? "").toLowerCase().includes(f) ||
        (l.emplacement ?? "").toLowerCase().includes(f)
      );
    });
  }, [lignes, q, categorieId, seulementAlertes, avecArchives]);

  const nbSansCategorie = lignes.filter((l) => l.actif && l.categorieId === null).length;

  const nbArchives = lignes.filter((l) => !l.actif).length;

  const produitsChoix = useMemo(
    () =>
      lignes
        .filter((l) => l.actif)
        .map((l) => ({
          id: l.id,
          refInterne: l.refInterne,
          refFabricant: l.refFabricant,
          designation: l.designation,
          unite: l.unite,
          serialisable: l.serialisable,
          stock: l.stock,
          dernierPrixCents: l.dernierPrixCents,
        })),
    [lignes],
  );

  return (
    <>
      <RangeeChiffres className="mb-5">
        <Chiffre label="Références" valeur={stats.nbProduits} detail="produits actifs" />
        <Chiffre
          label="Sous le seuil"
          valeur={stats.nbSousSeuil}
          ton={stats.nbSousSeuil > 0 ? "danger" : "success"}
          detail={stats.nbSousSeuil > 0 ? "à commander" : "rien à commander"}
        />
        {peutPrix ? (
          <Chiffre
            label="Valeur du stock"
            valeur={formatEuros(stats.valeurCents)}
            detail={
              stats.nbSansPrix > 0
                ? `${stats.nbSansPrix} référence${stats.nbSansPrix > 1 ? "s" : ""} sans prix connu`
                : "au prix moyen pondéré"
            }
          />
        ) : (
          <Chiffre label="En stock" valeur={lignes.filter((l) => l.stock > 0).length} detail="références servies" />
        )}
        <Chiffre label="Mouvements" valeur={stats.nbMouvements30j} detail="ces 30 derniers jours" />
      </RangeeChiffres>

      {/* Barre d'outils ------------------------------------------------------ */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[14rem] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Chercher une référence, une désignation, un bac…"
            className="pl-8"
          />
        </div>

        <select
          value={categorieId}
          onChange={(e) => setCategorieId(e.target.value)}
          className="h-[var(--control-h)] rounded-md border border-border bg-surface px-2.5 text-sm text-fg"
        >
          <option value="TOUTES">Toutes catégories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nom}
            </option>
          ))}
          {nbSansCategorie > 0 && <option value="SANS">Sans catégorie ({nbSansCategorie})</option>}
        </select>

        <Button
          variant={seulementAlertes ? "accent" : "outline"}
          onClick={() => setSeulementAlertes((v) => !v)}
        >
          <TriangleAlert className="h-4 w-4" />
          Sous le seuil
          {stats.nbSousSeuil > 0 && (
            <span className="ml-1 tabular-nums">({stats.nbSousSeuil})</span>
          )}
        </Button>

        <Button
          variant={avecArchives ? "accent" : "outline"}
          onClick={() => setAvecArchives((v) => !v)}
          title="Afficher aussi les produits archivés"
        >
          <Archive className="h-4 w-4" />
          Archivés
          {nbArchives > 0 && <span className="ml-1 tabular-nums">({nbArchives})</span>}
        </Button>

        <Button variant="outline" onClick={() => setMouvement({})}>
          <ArrowLeftRight className="h-4 w-4" />
          Mouvement
        </Button>

        {peutGerer && (
          <Button onClick={() => setCreation(true)}>
            <Plus className="h-4 w-4" />
            Produit
          </Button>
        )}
      </div>

      {/* Le tableau ---------------------------------------------------------- */}
      <div className="data-card overflow-x-auto">
        <table className="data-table table-cards">
          <thead>
            <tr>
              <th>Produit</th>
              <th>Catégorie</th>
              <th>Emplacement</th>
              <th className="text-right">Stock</th>
              <th className="text-right">Réservé</th>
              <th className="text-right">Dispo</th>
              {peutPrix && <th className="text-right">Prix unitaire</th>}
              <th />
            </tr>
          </thead>
          <tbody>
            {filtrees.length === 0 && (
              <tr>
                <td colSpan={peutPrix ? 8 : 7} className="py-6 text-center text-sm text-subtle">
                  Aucun produit ne correspond.
                </td>
              </tr>
            )}
            {filtrees.map((l) => (
              <tr key={l.id} className={cn(!l.actif && "opacity-55")}>
                <td className="cell-title cell-card-title cell-wrap">
                  <Link
                    href={`/outils/magasin/produits/${l.id}`}
                    className="group inline-flex items-baseline gap-2 transition-colors hover:text-brand"
                  >
                    <span className="ref shrink-0">{l.refInterne}</span>
                    <span className="min-w-0">{l.designation}</span>
                  </Link>
                  {l.fabricantNom && <div className="text-xs text-subtle">{l.fabricantNom}</div>}
                  {!l.actif && <Badge tone="neutral">Archivé</Badge>}
                </td>
                <td data-label="Catégorie">
                  {l.categorieNom ?? <span className="text-subtle">—</span>}
                </td>
                <td data-label="Emplacement">
                  {l.emplacement ? <span className="ref">{l.emplacement}</span> : <span className="text-subtle">—</span>}
                </td>
                <td data-label="Stock" className="text-right tabular-nums">
                  {l.stock} <span className="text-xs text-subtle">{l.unite}</span>
                </td>
                <td data-label="Réservé" className="text-right tabular-nums">
                  {l.reserve > 0 ? l.reserve : <span className="text-subtle">—</span>}
                </td>
                <td data-label="Dispo" className="text-right tabular-nums">
                  {l.sousSeuil ? (
                    <Badge tone="danger" point>
                      {l.disponible} / {l.seuilMini}
                    </Badge>
                  ) : (
                    <strong>{l.disponible}</strong>
                  )}
                </td>
                {peutPrix && (
                  <td data-label="Prix unitaire" className="text-right tabular-nums">
                    {l.prixRefCents === null ? (
                      <span className="text-subtle" title="Ni réception valorisée, ni tarif fournisseur">
                        —
                      </span>
                    ) : (
                      <>
                        {formatEuros(l.prixRefCents)}
                        {/* D'où sort ce prix : payé, ou seulement annoncé. */}
                        {l.sourcePrix === "achat" && (
                          <span
                            className="ml-1 text-xs text-subtle"
                            title="Prix d'achat annoncé — ce produit n'a jamais été reçu"
                          >
                            annoncé
                          </span>
                        )}
                      </>
                    )}
                  </td>
                )}
                <td className="text-right">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setMouvement({ produitId: l.id })}
                    aria-label={`Mouvement sur ${l.refInterne}`}
                  >
                    <ArrowLeftRight className="h-4 w-4" />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {lignes.length === 0 && (
        <p className="mt-4 text-center text-sm text-muted">
          Le magasin est vide.{" "}
          <Link href="/outils/magasin/import" className="font-semibold text-brand hover:underline">
            Importer le référentiel
          </Link>{" "}
          est plus rapide que de tout saisir.
        </p>
      )}

      {mouvement && (
        <SaisieMouvement
          produits={produitsChoix}
          depots={depots}
          affaires={affaires}
          peutPrix={peutPrix}
          produitInitial={mouvement.produitId}
          onFermer={() => setMouvement(null)}
        />
      )}

      {creation && (
        <EditeurProduit
          fournisseurs={fournisseurs}
          fabricants={fabricants}
          categories={categories}
          peutPrix={peutPrix}
          onFermer={() => {
            setCreation(false);
          }}
        />
      )}
    </>
  );
}
