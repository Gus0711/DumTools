"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Archive,
  ArchiveRestore,
  Factory,
  Loader2,
  Pencil,
  Plus,
  Tags,
  Trash2,
  Truck,
  Warehouse,
  type LucideIcon,
} from "lucide-react";
import { Badge, Button, EnteteSection, Input, Label } from "@/ui";
import {
  enregistrerCategorie,
  enregistrerDepot,
  enregistrerFabricant,
  enregistrerFournisseur,
  supprimerCategorie,
  supprimerFabricant,
} from "./actions";
import {
  TYPE_DEPOT_LABEL,
  type CategorieVue,
  type DepotVue,
  type FabricantVue,
  type TypeDepot,
} from "./model";
import type { FournisseurVue } from "./queries";

/* =============================================================================
 * LES RÉFÉRENTIELS DU MAGASIN
 * Quatre listes courtes — dépôts, fournisseurs, catégories, fabricants — qui
 * n'ont pas mérité un écran chacune.
 *
 * Le « dortoir » est le réglage qui décide de la doctrine camion : coché, ce
 * qui entre dans le dépôt est considéré comme consommé (aucun stock tenu) ;
 * décoché, le véhicule devient un dépôt de plein exercice. Passer de l'un à
 * l'autre ne demande aucune migration — c'était tout l'intérêt de porter la
 * dimension « dépôt » dès le premier jour.
 * ========================================================================== */

const selectCls =
  "mt-1 h-[var(--control-h)] w-full rounded-md border border-border bg-surface px-2.5 text-sm text-fg";

type BrouillonDepot = {
  id?: string;
  nom: string;
  code: string;
  type: TypeDepot;
  dortoir: boolean;
  actif: boolean;
};

type BrouillonFournisseur = {
  id?: string;
  nom: string;
  contact: string;
  email: string;
  tel: string;
  delaiJours: string;
};

export function ConfigMagasin({
  depots,
  fournisseurs,
  categories,
  fabricants,
}: {
  depots: DepotVue[];
  fournisseurs: FournisseurVue[];
  categories: CategorieVue[];
  fabricants: FabricantVue[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [erreur, setErreur] = useState<string | null>(null);
  const [depot, setDepot] = useState<BrouillonDepot | null>(null);
  const [fournisseur, setFournisseur] = useState<BrouillonFournisseur | null>(null);

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

  return (
    <>
      {erreur && (
        <div className="mb-4 rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
          {erreur}
        </div>
      )}

      {/* Dépôts -------------------------------------------------------------- */}
      <section className="mb-8">
        <EnteteSection
          icone={Warehouse}
          titre="Dépôts"
          compteur={depots.length}
          actions={
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                setDepot({ nom: "", code: "", type: "VEHICULE", dortoir: true, actif: true })
              }
            >
              <Plus className="h-4 w-4" /> Dépôt
            </Button>
          }
        />

        <div className="data-card overflow-x-auto">
          <table className="data-table table-cards">
            <thead>
              <tr>
                <th>Dépôt</th>
                <th>Code</th>
                <th>Type</th>
                <th>Stock tenu</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {depots.map((d) => (
                <tr key={d.id} className={d.actif ? "" : "opacity-55"}>
                  <td className="cell-title cell-card-title">{d.nom}</td>
                  <td data-label="Code" className="ref">
                    {d.code}
                  </td>
                  <td data-label="Type">{TYPE_DEPOT_LABEL[d.type]}</td>
                  <td data-label="Stock tenu">
                    {d.dortoir ? (
                      <Badge tone="neutral">Consommé à l&apos;entrée</Badge>
                    ) : (
                      <Badge tone="success" point>
                        Oui
                      </Badge>
                    )}
                  </td>
                  <td className="text-right">
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label={`Modifier ${d.nom}`}
                      onClick={() =>
                        setDepot({
                          id: d.id,
                          nom: d.nom,
                          code: d.code,
                          type: d.type,
                          dortoir: d.dortoir,
                          actif: d.actif,
                        })
                      }
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {depot && (
          <div className="bloc mt-3 px-4 py-4">
            <div className="grid gap-3 sm:grid-cols-4">
              <div>
                <Label>Nom</Label>
                <Input
                  autoFocus
                  value={depot.nom}
                  onChange={(e) => setDepot({ ...depot, nom: e.target.value })}
                  placeholder="Camion Gus"
                  className="mt-1"
                />
              </div>
              <div>
                <Label>Code</Label>
                <Input
                  value={depot.code}
                  onChange={(e) => setDepot({ ...depot, code: e.target.value.toUpperCase() })}
                  placeholder="CAM-GUS"
                  className="mt-1 font-mono"
                />
              </div>
              <div>
                <Label>Type</Label>
                <select
                  value={depot.type}
                  onChange={(e) => {
                    const type = e.target.value as TypeDepot;
                    setDepot({ ...depot, type, dortoir: type === "ATELIER" ? false : depot.dortoir });
                  }}
                  className={selectCls}
                >
                  {(["ATELIER", "VEHICULE", "CHANTIER"] as TypeDepot[]).map((t) => (
                    <option key={t} value={t}>
                      {TYPE_DEPOT_LABEL[t]}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label>On y tient un stock ?</Label>
                <label className="mt-1 flex h-[var(--control-h)] items-center gap-2 rounded-md border border-border bg-surface px-2.5 text-sm text-fg">
                  <input
                    type="checkbox"
                    checked={!depot.dortoir}
                    onChange={(e) => setDepot({ ...depot, dortoir: !e.target.checked })}
                    className="h-4 w-4 accent-[var(--brand)]"
                  />
                  Oui, inventorier
                </label>
              </div>
            </div>
            <p className="mt-2 text-xs text-muted">
              Décoché : ce qui entre dans ce dépôt est considéré comme <strong>consommé</strong>{" "}
              (doctrine « le camion est un dortoir »). Cocher plus tard suffira à lui donner un
              vrai stock.
            </p>
            <div className="mt-3 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setDepot(null)} disabled={pending}>
                Annuler
              </Button>
              <Button
                disabled={pending || !depot.nom.trim() || !depot.code.trim()}
                onClick={() => run(() => enregistrerDepot(depot), () => setDepot(null))}
              >
                {pending && <Loader2 className="h-4 w-4 animate-spin" />}
                Enregistrer
              </Button>
            </div>
          </div>
        )}
      </section>

      {/* Fournisseurs -------------------------------------------------------- */}
      <section>
        <EnteteSection
          icone={Truck}
          titre="Fournisseurs"
          compteur={fournisseurs.length}
          actions={
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                setFournisseur({ nom: "", contact: "", email: "", tel: "", delaiJours: "" })
              }
            >
              <Plus className="h-4 w-4" /> Fournisseur
            </Button>
          }
        />

        <div className="data-card overflow-x-auto">
          <table className="data-table table-cards">
            <thead>
              <tr>
                <th>Fournisseur</th>
                <th>Contact</th>
                <th>Téléphone</th>
                <th className="text-right">Délai</th>
                <th className="text-right">Produits</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {fournisseurs.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-sm text-subtle">
                    Aucun fournisseur. L&apos;import de produits en crée automatiquement, et la fiche produit permet d&apos;en ajouter un à la volée.
                  </td>
                </tr>
              )}
              {fournisseurs.map((f) => (
                <tr key={f.id} className={f.actif ? "" : "opacity-55"}>
                  <td className="cell-title cell-card-title">{f.nom}</td>
                  <td data-label="Contact">{f.contact || <span className="text-subtle">—</span>}</td>
                  <td data-label="Téléphone">{f.tel || <span className="text-subtle">—</span>}</td>
                  <td data-label="Délai" className="text-right tabular-nums">
                    {f.delaiJours !== null ? `${f.delaiJours} j` : "—"}
                  </td>
                  <td data-label="Produits" className="text-right tabular-nums">
                    {f.nbProduits}
                  </td>
                  <td className="text-right">
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label={`Modifier ${f.nom}`}
                      onClick={() =>
                        setFournisseur({
                          id: f.id,
                          nom: f.nom,
                          contact: f.contact,
                          email: f.email,
                          tel: f.tel,
                          delaiJours: f.delaiJours === null ? "" : String(f.delaiJours),
                        })
                      }
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {fournisseur && (
          <div className="bloc mt-3 px-4 py-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <div className="lg:col-span-2">
                <Label>Nom</Label>
                <Input
                  autoFocus
                  value={fournisseur.nom}
                  onChange={(e) => setFournisseur({ ...fournisseur, nom: e.target.value })}
                  className="mt-1"
                />
              </div>
              <div>
                <Label>Contact</Label>
                <Input
                  value={fournisseur.contact}
                  onChange={(e) => setFournisseur({ ...fournisseur, contact: e.target.value })}
                  className="mt-1"
                />
              </div>
              <div>
                <Label>Téléphone</Label>
                <Input
                  value={fournisseur.tel}
                  onChange={(e) => setFournisseur({ ...fournisseur, tel: e.target.value })}
                  className="mt-1"
                />
              </div>
              <div>
                <Label>Délai (jours)</Label>
                <Input
                  type="number"
                  min={0}
                  value={fournisseur.delaiJours}
                  onChange={(e) => setFournisseur({ ...fournisseur, delaiJours: e.target.value })}
                  className="mt-1 tabular-nums"
                />
              </div>
            </div>
            <div className="mt-3">
              <Label>Email</Label>
              <Input
                value={fournisseur.email}
                onChange={(e) => setFournisseur({ ...fournisseur, email: e.target.value })}
                className="mt-1"
              />
            </div>
            <div className="mt-3 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setFournisseur(null)} disabled={pending}>
                Annuler
              </Button>
              <Button
                disabled={pending || !fournisseur.nom.trim()}
                onClick={() =>
                  run(
                    () =>
                      enregistrerFournisseur({
                        ...fournisseur,
                        delaiJours:
                          fournisseur.delaiJours.trim() === ""
                            ? null
                            : Number(fournisseur.delaiJours),
                      }),
                    () => setFournisseur(null),
                  )
                }
              >
                {pending && <Loader2 className="h-4 w-4 animate-spin" />}
                Enregistrer
              </Button>
            </div>
          </div>
        )}
      </section>

      {/* Catégories ---------------------------------------------------------- */}
      <ListeReferentiel
        icone={Tags}
        titre="Catégories"
        singulier="Catégorie"
        lignes={categories.map((c) => ({ id: c.id, nom: c.nom, actif: c.actif, nbProduits: c.nbProduits }))}
        vide="Aucune catégorie — le rayon ne peut alors plus être trié que par référence."
        aide="Le rangement du rayon. Supprimer une catégorie ne supprime jamais ses produits : ils basculent vers celle que vous désignez, ou se retrouvent « sans catégorie », visibles en fin de rayon."
        pending={pending}
        onEnregistrer={(id, nom) => run(() => enregistrerCategorie({ id, nom }).then(() => undefined))}
        onArchiver={(id, actif) =>
          run(() => enregistrerCategorie({ id, nom: nomDe(categories, id), actif }).then(() => undefined))
        }
        onSupprimer={(id, remplacerParId) => run(() => supprimerCategorie({ id, remplacerParId }))}
      />

      {/* Fabricants ---------------------------------------------------------- */}
      <ListeReferentiel
        icone={Factory}
        titre="Fabricants"
        singulier="Fabricant"
        lignes={fabricants.map((f) => ({ id: f.id, nom: f.nom, actif: f.actif, nbProduits: f.nbProduits }))}
        vide="Aucun fabricant enregistré."
        aide="Qui fabrique le matériel — à ne pas confondre avec le fournisseur, qui le facture. Renommer un fabricant SUR UN NOM DÉJÀ PRIS les FUSIONNE : c'est le geste qui répare un « Siemnes » saisi un jour de fatigue, sans perdre un seul produit."
        pending={pending}
        onEnregistrer={(id, nom) => run(() => enregistrerFabricant({ id, nom }).then(() => undefined))}
        onArchiver={(id, actif) =>
          run(() => enregistrerFabricant({ id, nom: nomDe(fabricants, id), actif }).then(() => undefined))
        }
        onSupprimer={(id, remplacerParId) => run(() => supprimerFabricant({ id, remplacerParId }))}
      />
    </>
  );
}

function nomDe(lignes: { id: string; nom: string }[], id: string): string {
  return lignes.find((l) => l.id === id)?.nom ?? "";
}

interface LigneReferentiel {
  id: string;
  nom: string;
  actif: boolean;
  nbProduits: number;
}

/**
 * Catégories et fabricants sont le même objet : une liste de noms, comptés en
 * produits. Un seul composant, donc — et surtout un seul comportement de
 * suppression, qui est la partie délicate.
 *
 * La règle : rien ne disparaît en silence. Supprimer une entrée encore portée
 * par des produits demande d'abord de dire où ils vont ; « nulle part » est une
 * réponse valable (ils deviennent « sans catégorie »), mais elle est CHOISIE.
 */
function ListeReferentiel({
  icone,
  titre,
  singulier,
  lignes,
  vide,
  aide,
  pending,
  onEnregistrer,
  onArchiver,
  onSupprimer,
}: {
  icone: LucideIcon;
  titre: string;
  singulier: string;
  lignes: LigneReferentiel[];
  vide: string;
  aide: string;
  pending: boolean;
  onEnregistrer: (id: string | undefined, nom: string) => void;
  onArchiver: (id: string, actif: boolean) => void;
  onSupprimer: (id: string, remplacerParId: string | null) => void;
}) {
  const [edition, setEdition] = useState<{ id?: string; nom: string } | null>(null);
  const [suppression, setSuppression] = useState<{ ligne: LigneReferentiel; vers: string } | null>(
    null,
  );

  return (
    <section className="mt-8">
      <EnteteSection
        icone={icone}
        titre={titre}
        compteur={lignes.length}
        actions={
          <Button size="sm" variant="outline" onClick={() => setEdition({ nom: "" })}>
            <Plus className="h-4 w-4" /> {singulier}
          </Button>
        }
      />

      <p className="mb-3 text-xs leading-relaxed text-muted">{aide}</p>

      <div className="data-card overflow-x-auto">
        <table className="data-table table-cards">
          <thead>
            <tr>
              <th>{singulier}</th>
              <th className="text-right">Produits</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {lignes.length === 0 && (
              <tr>
                <td colSpan={3} className="py-6 text-center text-sm text-subtle">
                  {vide}
                </td>
              </tr>
            )}
            {lignes.map((l) => (
              <tr key={l.id} className={l.actif ? "" : "opacity-55"}>
                <td className="cell-title cell-card-title">
                  {l.nom}
                  {!l.actif && (
                    <Badge tone="neutral" className="ml-2">
                      Archivé
                    </Badge>
                  )}
                </td>
                <td data-label="Produits" className="text-right tabular-nums">
                  {l.nbProduits}
                </td>
                <td className="whitespace-nowrap text-right">
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label={`Renommer ${l.nom}`}
                    onClick={() => setEdition({ id: l.id, nom: l.nom })}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    title={
                      l.actif
                        ? "Archiver : retiré des choix, conservé sur les produits qui le portent"
                        : "Remettre dans les choix"
                    }
                    aria-label={l.actif ? `Archiver ${l.nom}` : `Réactiver ${l.nom}`}
                    disabled={pending}
                    onClick={() => onArchiver(l.id, !l.actif)}
                  >
                    {l.actif ? <Archive className="h-4 w-4" /> : <ArchiveRestore className="h-4 w-4" />}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label={`Supprimer ${l.nom}`}
                    disabled={pending}
                    onClick={() =>
                      l.nbProduits === 0
                        ? onSupprimer(l.id, null)
                        : setSuppression({ ligne: l, vers: "" })
                    }
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {edition && (
        <div className="bloc mt-3 px-4 py-4">
          <Label>Nom</Label>
          <Input
            autoFocus
            value={edition.nom}
            onChange={(e) => setEdition({ ...edition, nom: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === "Enter" && edition.nom.trim()) {
                onEnregistrer(edition.id, edition.nom);
                setEdition(null);
              }
            }}
            className="mt-1"
          />
          <div className="mt-3 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setEdition(null)} disabled={pending}>
              Annuler
            </Button>
            <Button
              disabled={pending || !edition.nom.trim()}
              onClick={() => {
                onEnregistrer(edition.id, edition.nom);
                setEdition(null);
              }}
            >
              {pending && <Loader2 className="h-4 w-4 animate-spin" />}
              Enregistrer
            </Button>
          </div>
        </div>
      )}

      {suppression && (
        <div className="bloc mt-3 border-danger/40 px-4 py-4">
          <p className="text-sm text-fg">
            <strong>{suppression.ligne.nom}</strong> est encore portée par{" "}
            <strong>{suppression.ligne.nbProduits}</strong> produit
            {suppression.ligne.nbProduits > 1 ? "s" : ""}. Que deviennent-ils ?
          </p>
          <select
            value={suppression.vers}
            onChange={(e) => setSuppression({ ...suppression, vers: e.target.value })}
            className={`${selectCls} max-w-sm`}
          >
            <option value="">Aucune — ils resteront « sans {singulier.toLowerCase()} »</option>
            {lignes
              .filter((l) => l.id !== suppression.ligne.id)
              .map((l) => (
                <option key={l.id} value={l.id}>
                  Les basculer vers « {l.nom} »
                </option>
              ))}
          </select>
          <div className="mt-3 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setSuppression(null)} disabled={pending}>
              Annuler
            </Button>
            <Button
              variant="danger"
              disabled={pending}
              onClick={() => {
                onSupprimer(suppression.ligne.id, suppression.vers || null);
                setSuppression(null);
              }}
            >
              {pending && <Loader2 className="h-4 w-4 animate-spin" />}
              Supprimer
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
