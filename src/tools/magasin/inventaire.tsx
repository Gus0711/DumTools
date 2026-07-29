"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, ClipboardList, Loader2, Search, X } from "lucide-react";
import { Badge, Button, Chiffre, Input, Label, RangeeChiffres } from "@/ui";
import { cn } from "@/lib/cn";
import { annulerInventaire, ouvrirInventaire, saisirComptage, validerInventaire } from "./actions";
import { CATEGORIES, CATEGORIE_LABEL, type DepotVue } from "./model";
import type { InventaireDetail } from "./queries";

/* =============================================================================
 * LA CAMPAGNE D'INVENTAIRE
 * Ouvrir fige le THÉORIQUE de chaque produit : le stock peut continuer de
 * bouger pendant qu'on compte, l'écart constaté reste juste.
 * Valider n'écrase RIEN — chaque différence devient un mouvement d'écart, qui
 * reste lisible dans l'historique du produit. C'est ce qui permet de savoir, au
 * bout de quelques mois, si le rituel de saisie tient ou pas.
 * ========================================================================== */

export function OuvrirInventaire({ depots }: { depots: DepotVue[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [ouvert, setOuvert] = useState(false);
  const [depotId, setDepotId] = useState(depots.find((d) => !d.dortoir)?.id ?? depots[0]?.id ?? "");
  const [categorie, setCategorie] = useState("TOUTES");
  const [libelle, setLibelle] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);

  if (!ouvert) {
    return (
      <Button onClick={() => setOuvert(true)}>
        <ClipboardList className="h-4 w-4" />
        Ouvrir une campagne
      </Button>
    );
  }

  return (
    <div className="bloc w-full px-4 py-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <Label>Dépôt à compter</Label>
          <select
            value={depotId}
            onChange={(e) => setDepotId(e.target.value)}
            className="mt-1 h-[var(--control-h)] w-full rounded-md border border-border bg-surface px-2.5 text-sm text-fg"
          >
            {depots.map((d) => (
              <option key={d.id} value={d.id}>
                {d.nom}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label>Limiter à une catégorie</Label>
          <select
            value={categorie}
            onChange={(e) => setCategorie(e.target.value)}
            className="mt-1 h-[var(--control-h)] w-full rounded-md border border-border bg-surface px-2.5 text-sm text-fg"
          >
            <option value="TOUTES">Tout le magasin</option>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {CATEGORIE_LABEL[c]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label>Libellé</Label>
          <Input
            value={libelle}
            onChange={(e) => setLibelle(e.target.value)}
            placeholder="Inventaire annuel…"
            className="mt-1"
          />
        </div>
      </div>

      {erreur && <p className="mt-2 text-sm text-danger">{erreur}</p>}

      <div className="mt-3 flex justify-end gap-2">
        <Button variant="ghost" onClick={() => setOuvert(false)} disabled={pending}>
          Annuler
        </Button>
        <Button
          disabled={pending || !depotId}
          onClick={() =>
            startTransition(async () => {
              try {
                const { id } = await ouvrirInventaire({
                  depotId,
                  libelle,
                  categorie: categorie === "TOUTES" ? null : categorie,
                });
                router.push(`/outils/magasin/inventaires/${id}`);
              } catch (e) {
                setErreur(e instanceof Error ? e.message : "Erreur inattendue");
              }
            })
          }
        >
          {pending && <Loader2 className="h-4 w-4 animate-spin" />}
          Ouvrir
        </Button>
      </div>
    </div>
  );
}

export function ComptageInventaire({
  inventaire,
  peutValider,
}: {
  inventaire: InventaireDetail;
  peutValider: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [erreur, setErreur] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [seulementRestants, setSeulementRestants] = useState(false);
  // Saisie locale : le champ ne doit pas repartir au rechargement à chaque frappe.
  const [saisies, setSaisies] = useState<Record<string, string>>({});

  const ouvert = inventaire.etat === "OUVERT";

  const lignes = useMemo(() => {
    const f = q.trim().toLowerCase();
    return inventaire.lignes.filter((l) => {
      if (seulementRestants && l.compte !== null) return false;
      if (!f) return true;
      return (
        l.refInterne.toLowerCase().includes(f) ||
        l.designation.toLowerCase().includes(f) ||
        (l.emplacement ?? "").toLowerCase().includes(f)
      );
    });
  }, [inventaire.lignes, q, seulementRestants]);

  const comptees = inventaire.lignes.filter((l) => l.compte !== null).length;
  const ecarts = inventaire.lignes.filter((l) => l.ecart !== null && l.ecart !== 0);

  function enregistrer(ligneId: string, valeur: string) {
    setSaisies((s) => ({ ...s, [ligneId]: valeur }));
    const compte = valeur.trim() === "" ? null : Math.max(0, Math.round(Number(valeur)));
    if (valeur.trim() !== "" && !Number.isFinite(Number(valeur))) return;
    startTransition(async () => {
      try {
        await saisirComptage({ ligneId, compte });
        router.refresh();
      } catch (e) {
        setErreur(e instanceof Error ? e.message : "Erreur inattendue");
      }
    });
  }

  return (
    <>
      <RangeeChiffres className="mb-5">
        <Chiffre label="Références" valeur={inventaire.lignes.length} detail={inventaire.depot} />
        <Chiffre
          label="Comptées"
          valeur={`${comptees}/${inventaire.lignes.length}`}
          detail={ouvert ? "en cours" : "terminé"}
        />
        <Chiffre
          label="Écarts"
          valeur={ecarts.length}
          ton={ecarts.length > 0 ? "danger" : "success"}
          detail={ecarts.length > 0 ? "à assumer" : "aucun"}
        />
        <Chiffre
          label="Solde des écarts"
          valeur={ecarts.reduce((s, l) => s + (l.ecart ?? 0), 0)}
          detail="articles"
        />
      </RangeeChiffres>

      {erreur && (
        <div className="mb-4 rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
          {erreur}
        </div>
      )}

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[14rem] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Chercher une référence, un bac…"
            className="pl-8"
          />
        </div>
        <Button
          variant={seulementRestants ? "accent" : "outline"}
          onClick={() => setSeulementRestants((v) => !v)}
        >
          Reste à compter
          <span className="ml-1 tabular-nums">({inventaire.lignes.length - comptees})</span>
        </Button>
        {pending && <Loader2 className="h-4 w-4 animate-spin text-muted" />}

        {ouvert && peutValider && (
          <div className="ml-auto flex gap-2">
            <Button
              variant="ghost"
              onClick={() =>
                startTransition(async () => {
                  await annulerInventaire(inventaire.id);
                  router.refresh();
                })
              }
              disabled={pending}
            >
              <X className="h-4 w-4" /> Abandonner
            </Button>
            <Button
              onClick={() =>
                startTransition(async () => {
                  try {
                    await validerInventaire(inventaire.id);
                    router.refresh();
                  } catch (e) {
                    setErreur(e instanceof Error ? e.message : "Erreur inattendue");
                  }
                })
              }
              disabled={pending || comptees === 0}
            >
              <Check className="h-4 w-4" />
              Valider ({ecarts.length} écart{ecarts.length > 1 ? "s" : ""})
            </Button>
          </div>
        )}
      </div>

      {ouvert && (
        <p className="mb-3 text-xs text-muted">
          La validation écrira un mouvement d&apos;écart par différence constatée. Rien n&apos;est
          corrigé en douce : l&apos;écart restera visible dans l&apos;historique du produit.
        </p>
      )}

      <div className="data-card overflow-x-auto">
        <table className="data-table table-cards">
          <thead>
            <tr>
              <th>Produit</th>
              <th>Emplacement</th>
              <th className="text-right">Théorique</th>
              <th className="text-right">Compté</th>
              <th className="text-right">Écart</th>
            </tr>
          </thead>
          <tbody>
            {lignes.map((l) => (
              <tr key={l.id}>
                <td className="cell-title cell-card-title cell-wrap">
                  <span className="ref">{l.refInterne}</span> — {l.designation}
                </td>
                <td data-label="Emplacement">
                  {l.emplacement ? (
                    <span className="ref">{l.emplacement}</span>
                  ) : (
                    <span className="text-subtle">—</span>
                  )}
                </td>
                <td data-label="Théorique" className="text-right tabular-nums text-muted">
                  {l.theorique}
                </td>
                <td data-label="Compté" className="text-right">
                  {ouvert ? (
                    <Input
                      type="number"
                      min={0}
                      value={saisies[l.id] ?? (l.compte === null ? "" : String(l.compte))}
                      onChange={(e) => enregistrer(l.id, e.target.value)}
                      className="ml-auto w-24 text-right tabular-nums"
                      placeholder="—"
                    />
                  ) : (
                    <span className="tabular-nums">{l.compte ?? "—"}</span>
                  )}
                </td>
                <td data-label="Écart" className="text-right tabular-nums">
                  {l.ecart === null ? (
                    <span className="text-subtle">—</span>
                  ) : l.ecart === 0 ? (
                    <Badge tone="success">0</Badge>
                  ) : (
                    <Badge tone={l.ecart > 0 ? "warning" : "danger"} point>
                      {l.ecart > 0 ? `+${l.ecart}` : l.ecart}
                    </Badge>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {!ouvert && (
        <p className={cn("mt-3 text-sm text-muted")}>
          Campagne {inventaire.etat === "VALIDE" ? "validée" : "abandonnée"}
          {inventaire.valideLe ? ` le ${inventaire.valideLe.toLocaleDateString("fr-FR")}` : ""}.
        </p>
      )}
    </>
  );
}
