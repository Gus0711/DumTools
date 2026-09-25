"use client";

import { useMemo, useState } from "react";
import { Archive, Check, Loader2, MapPinned, Pencil, Plus, Search, Undo2, X } from "lucide-react";
import { Badge, Button, Combobox, EtatVide, Input, Label } from "@/ui";
import { cn } from "@/lib/cn";
import { useReprendreFiltres, useSyncUrl } from "@/lib/filtres-url";
import { archiverSite, enregistrerSite } from "./actions";
import type { SiteAvecClient } from "./queries";

/* Le référentiel des sites.
 *
 * Il se remplit du TRAVAIL : on ajoute un site depuis l'éditeur de contrat, en
 * tapant son nom, et on vient ici quand on a besoin d'y mettre l'adresse, le
 * code du portail ou la façon de s'y connecter. L'inverse — exiger une fiche
 * complète avant de pouvoir rattacher un site — ferait qu'on ne rattacherait
 * jamais rien.
 * ========================================================================== */

interface Valeurs {
  id?: string;
  clientNom: string;
  nom: string;
  adresse: string;
  codePostal: string;
  ville: string;
  acces: string;
  accesDistant: string;
  note: string;
  actif: boolean;
}

function vide(clientNom = ""): Valeurs {
  return {
    clientNom,
    nom: "",
    adresse: "",
    codePostal: "",
    ville: "",
    acces: "",
    accesDistant: "",
    note: "",
    actif: true,
  };
}

function depuis(s: SiteAvecClient): Valeurs {
  return {
    id: s.id,
    clientNom: s.clientNom,
    nom: s.nom,
    adresse: s.adresse,
    codePostal: s.codePostal,
    ville: s.ville,
    acces: s.acces,
    accesDistant: s.accesDistant,
    note: s.note,
    actif: s.actif,
  };
}

export function ReferentielSites({
  sites,
  clients,
}: {
  sites: SiteAvecClient[];
  clients: { id: string; nom: string }[];
}) {
  const [q, setQ] = useState("");
  const [client, setClient] = useState("");
  const [avecArchives, setAvecArchives] = useState(false);
  const [edition, setEdition] = useState<Valeurs | null>(null);
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  useSyncUrl({ q, client, archives: avecArchives }, "maintenance-sites");
  useReprendreFiltres("maintenance-sites", ["q", "client", "archives"], (v) => {
    setQ(v("q") ?? "");
    setClient(v("client") ?? "");
    setAvecArchives(v("archives") === "1");
  });

  const nomsClients = useMemo(
    () => [...new Set(sites.map((s) => s.clientNom))].sort((a, b) => a.localeCompare(b)),
    [sites],
  );

  const visibles = useMemo(() => {
    const terme = q.trim().toLowerCase();
    return sites.filter((s) => {
      if (!avecArchives && !s.actif) return false;
      if (client && s.clientNom !== client) return false;
      if (!terme) return true;
      return [s.nom, s.clientNom, s.ville, s.codePostal, s.adresse]
        .join(" ")
        .toLowerCase()
        .includes(terme);
    });
  }, [sites, q, client, avecArchives]);

  async function enregistrer(e: React.FormEvent) {
    e.preventDefault();
    if (!edition || enCours) return;
    setErreur(null);

    const c = clients.find(
      (x) => x.nom.toLowerCase() === edition.clientNom.trim().toLowerCase(),
    );
    if (!c) {
      setErreur("Choisis un client existant — un site appartient toujours à quelqu'un.");
      return;
    }

    setEnCours(true);
    const r = await enregistrerSite({
      id: edition.id,
      clientId: c.id,
      nom: edition.nom,
      adresse: edition.adresse,
      codePostal: edition.codePostal,
      ville: edition.ville,
      acces: edition.acces,
      accesDistant: edition.accesDistant,
      note: edition.note,
      actif: edition.actif,
    });
    setEnCours(false);

    if (!r.ok) {
      setErreur(r.error);
      return;
    }
    setEdition(null);
  }

  async function archiver(s: SiteAvecClient) {
    setEnCours(true);
    await archiverSite(s.id, !s.actif);
    setEnCours(false);
  }

  return (
    <>
      {edition && (
        <form onSubmit={enregistrer} className="bloc mb-5 p-4">
          <p className="stamp mb-3">
            {edition.id ? "Modifier le site" : "Nouveau site"}
          </p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="grid gap-1.5">
              <Label>Client</Label>
              <Combobox
                value={edition.clientNom}
                onInput={(v) => setEdition({ ...edition, clientNom: v })}
                onPick={(o) => setEdition({ ...edition, clientNom: o.value })}
                options={clients.map((c) => ({ value: c.nom }))}
                placeholder="Nom du client"
              />
            </div>
            <div className="grid gap-1.5 lg:col-span-2">
              <Label htmlFor="s-nom">Nom du site</Label>
              <Input
                id="s-nom"
                value={edition.nom}
                onChange={(e) => setEdition({ ...edition, nom: e.target.value })}
                placeholder="Salle communale de Brancourt"
                required
              />
            </div>

            <div className="grid gap-1.5 lg:col-span-2">
              <Label htmlFor="s-adresse">Adresse</Label>
              <textarea
                id="s-adresse"
                value={edition.adresse}
                onChange={(e) => setEdition({ ...edition, adresse: e.target.value })}
                rows={2}
                className="w-full resize-y rounded-md border border-border bg-surface px-3 py-2 text-sm text-fg hover:border-brand/40 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
              />
            </div>
            <div className="grid grid-cols-[6.5rem_1fr] gap-2">
              <div className="grid gap-1.5">
                <Label htmlFor="s-cp">Code postal</Label>
                <Input
                  id="s-cp"
                  value={edition.codePostal}
                  onChange={(e) => setEdition({ ...edition, codePostal: e.target.value })}
                  className="font-mono"
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="s-ville">Ville</Label>
                <Input
                  id="s-ville"
                  value={edition.ville}
                  onChange={(e) => setEdition({ ...edition, ville: e.target.value })}
                />
              </div>
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="s-distant">Accès distant</Label>
              <Input
                id="s-distant"
                value={edition.accesDistant}
                onChange={(e) => setEdition({ ...edition, accesDistant: e.target.value })}
                placeholder="VPN, TeamViewer, IP, 4G…"
              />
              <p className="text-xs text-muted">
                Ce qu&apos;on cherche au moment où le client appelle.
              </p>
            </div>
            <div className="grid gap-1.5 lg:col-span-2">
              <Label htmlFor="s-acces">Accès sur place</Label>
              <Input
                id="s-acces"
                value={edition.acces}
                onChange={(e) => setEdition({ ...edition, acces: e.target.value })}
                placeholder="Code portail, à qui demander la clé, où est le local GTB"
              />
            </div>

            <div className="grid gap-1.5 lg:col-span-3">
              <Label htmlFor="s-note">Note</Label>
              <Input
                id="s-note"
                value={edition.note}
                onChange={(e) => setEdition({ ...edition, note: e.target.value })}
              />
            </div>
          </div>

          {erreur && (
            <p role="alert" className="mt-3 text-sm text-danger">
              {erreur}
            </p>
          )}

          <div className="mt-4 flex items-center gap-2">
            <Button type="submit" disabled={enCours}>
              {enCours ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Check className="h-4 w-4" />
              )}
              Enregistrer
            </Button>
            <Button type="button" variant="ghost" onClick={() => setEdition(null)}>
              <X className="h-4 w-4" /> Annuler
            </Button>
          </div>
        </form>
      )}

      <div className="data-card">
        <div className="bloc-entete flex-wrap gap-y-2">
          <div className="relative min-w-0 flex-1 sm:max-w-xs">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Site, client, ville…"
              className="pl-8"
              aria-label="Rechercher un site"
            />
          </div>

          <select
            value={client}
            onChange={(e) => setClient(e.target.value)}
            className="h-[var(--control-h)] rounded-md border border-border bg-surface px-2.5 text-sm text-fg hover:border-brand/40 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
            aria-label="Client"
          >
            <option value="">Tous les clients</option>
            {nomsClients.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>

          <label className="flex cursor-pointer items-center gap-2 text-sm text-muted">
            <input
              type="checkbox"
              checked={avecArchives}
              onChange={(e) => setAvecArchives(e.target.checked)}
              className="h-4 w-4 accent-[var(--brand)]"
            />
            Sortis du parc
          </label>

          <div className="ml-auto flex items-center gap-3">
            <span className="font-mono text-xs text-muted">
              {visibles.length} / {sites.length}
            </span>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setEdition(vide(client))}
            >
              <Plus className="h-4 w-4" /> Nouveau site
            </Button>
          </div>
        </div>

        {visibles.length === 0 ? (
          <EtatVide
            dessin="armoire"
            titre={sites.length === 0 ? "Aucun site" : "Aucun site ne répond"}
            texte={
              sites.length === 0
                ? "Les sites se créent aussi depuis un contrat, en tapant leur nom : ils atterrissent ici pour qu'on y mette l'adresse et les accès."
                : "Élargis la recherche."
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table table-cards">
              <thead>
                <tr>
                  <th>Site</th>
                  <th>Client</th>
                  <th className="cell-wrap">Adresse</th>
                  <th>Accès distant</th>
                  <th>Contrats</th>
                  <th>Interventions</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {visibles.map((s) => (
                  <tr key={s.id} className={cn(!s.actif && "opacity-60")}>
                    {/* Un seul enfant : voir la note de l'index. */}
                    <td className="cell-wrap cell-card-title">
                      <div className="min-w-0">
                        <span className="flex items-center gap-2">
                          <MapPinned className="h-3.5 w-3.5 shrink-0 text-subtle" />
                          <span className="cell-title">{s.nom}</span>
                          {!s.actif && <Badge tone="neutral">hors parc</Badge>}
                        </span>
                        {s.acces && (
                          <span className="mt-0.5 block text-xs font-normal text-muted">
                            {s.acces}
                          </span>
                        )}
                      </div>
                    </td>
                    <td data-label="Client" className="cell-tronque">
                      {s.clientNom}
                    </td>
                    <td data-label="Adresse" className="cell-wrap">
                      {s.adresse || s.ville ? (
                        <>
                          {s.adresse}
                          {s.adresse && (s.codePostal || s.ville) ? " · " : ""}
                          {[s.codePostal, s.ville].filter(Boolean).join(" ")}
                        </>
                      ) : (
                        <span className="text-subtle">—</span>
                      )}
                    </td>
                    <td data-label="Accès distant" className="cell-tronque">
                      {s.accesDistant ? (
                        <span className="ref">{s.accesDistant}</span>
                      ) : (
                        <span className="text-subtle">—</span>
                      )}
                    </td>
                    <td data-label="Contrats" className="cell-num">
                      {s.nbContrats || <span className="text-subtle">—</span>}
                    </td>
                    <td data-label="Interventions" className="cell-num">
                      {s.nbInterventions || <span className="text-subtle">—</span>}
                    </td>
                    <td>
                      <div className="actions-rangee flex items-center justify-end gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          title="Modifier"
                          onClick={() => setEdition(depuis(s))}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          title={s.actif ? "Sortir du parc" : "Remettre au parc"}
                          onClick={() => archiver(s)}
                          disabled={enCours}
                        >
                          {s.actif ? (
                            <Archive className="h-4 w-4" />
                          ) : (
                            <Undo2 className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className="mt-3 text-xs text-muted">
        Un site ne se supprime pas : des interventions le citent, et
        l&apos;historique d&apos;un contrat doit rester lisible dix ans après. On
        le sort du parc.
      </p>
    </>
  );
}
