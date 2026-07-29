"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Pencil, Plus, Truck, Warehouse } from "lucide-react";
import { Badge, Button, EnteteSection, Input, Label } from "@/ui";
import { enregistrerDepot, enregistrerFournisseur } from "./actions";
import { TYPE_DEPOT_LABEL, type DepotVue, type TypeDepot } from "./model";
import type { FournisseurVue } from "./queries";

/* =============================================================================
 * FOURNISSEURS & DÉPÔTS
 * Deux référentiels courts qui n'ont pas mérité un écran chacun.
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
}: {
  depots: DepotVue[];
  fournisseurs: FournisseurVue[];
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
    </>
  );
}
