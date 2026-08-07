"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { FileSpreadsheet, GitBranch, Plus, Search, TriangleAlert } from "lucide-react";
import { Badge, Button, Chiffre, Combobox, Input, Label, RangeeChiffres, EtatVide } from "@/ui";
import { cn } from "@/lib/cn";
import { creerDevis } from "./actions";
import {
  ETATS_DEVIS,
  ETAT_DEVIS_LABEL,
  formatEuros,
  formatPourcent,
  libelleDevis,
  type DevisResume,
  type EtatDevis,
} from "./model";
import type { StatsDevis } from "./queries";

/* =============================================================================
 * L'INDEX DES DEVIS
 * Ce qu'on vient y chercher, dans l'ordre : ce qui est en jeu (émis, en attente
 * de réponse), ce qu'on est en train de chiffrer, et le reste.
 * ========================================================================== */

const dateFr = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

const TON_ETAT: Record<EtatDevis, "neutral" | "brand" | "success" | "danger"> = {
  BROUILLON: "neutral",
  EMIS: "brand",
  ACCEPTE: "success",
  REFUSE: "danger",
};

export interface AffaireChoix {
  id: string;
  nom: string;
  numeroWhy: string | null;
  clientNom: string;
}

export function IndexDevis({
  devis,
  stats,
  clients,
  affaires,
}: {
  devis: DevisResume[];
  stats: StatsDevis;
  clients: string[];
  affaires: AffaireChoix[];
}) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [etat, setEtat] = useState<string>("TOUS");
  const [creation, setCreation] = useState(false);

  const filtres = useMemo(() => {
    const f = q.trim().toLowerCase();
    return devis.filter((d) => {
      if (etat !== "TOUS" && d.etat !== etat) return false;
      if (!f) return true;
      return (
        d.numero.toLowerCase().includes(f) ||
        d.titre.toLowerCase().includes(f) ||
        d.clientNom.toLowerCase().includes(f) ||
        (d.numeroWhy ?? "").toLowerCase().includes(f) ||
        (d.chantierNom ?? "").toLowerCase().includes(f)
      );
    });
  }, [devis, q, etat]);

  return (
    <>
      <RangeeChiffres className="mb-5">
        <Chiffre label="Devis" valeur={stats.nbTotal} detail="toutes révisions" />
        <Chiffre label="En chiffrage" valeur={stats.nbBrouillons} detail="brouillons" />
        <Chiffre
          label="En jeu"
          valeur={formatEuros(stats.enJeuCents)}
          detail={`${stats.nbEmis} devis émis, net HT`}
        />
        <Chiffre label="Accepté" valeur={formatEuros(stats.gagneCents)} detail="net HT" />
      </RangeeChiffres>

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="relative min-w-56 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Numéro, titre, client, affaire, n° Why…"
            className="pl-9"
          />
        </div>
        <select
          value={etat}
          onChange={(e) => setEtat(e.target.value)}
          className="h-[var(--control-h)] rounded-md border border-border bg-surface px-3 text-sm text-fg"
        >
          <option value="TOUS">Tous les états</option>
          {ETATS_DEVIS.map((e) => (
            <option key={e} value={e}>
              {ETAT_DEVIS_LABEL[e]}
            </option>
          ))}
        </select>
        <Button onClick={() => setCreation(true)}>
          <Plus className="h-4 w-4" /> Nouveau devis
        </Button>
      </div>

      {creation && (
        <NouveauDevis
          clients={clients}
          affaires={affaires}
          onFerme={() => setCreation(false)}
          onCree={(id) => router.push(`/perso/gus/devis/${id}`)}
        />
      )}

      {filtres.length === 0 ? (
        <EtatVide
          dessin="carnet"
          titre={devis.length === 0 ? "Aucun devis" : "Aucun devis ne correspond"}
          texte={
            devis.length === 0
              ? "Le chiffrage part d'ici : on compose des lots, on pioche dans le magasin, et le prix de vente se déduit du déboursé."
              : "Modifie la recherche ou l'état pour élargir."
          }
          action={
            devis.length === 0 ? (
              <Button onClick={() => setCreation(true)}>
                <Plus className="h-4 w-4" /> Nouveau devis
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="data-table table-cards">
            <thead>
              <tr>
                <th>Devis</th>
                <th>Client</th>
                <th>Affaire</th>
                <th>État</th>
                <th className="cell-num">Net HT</th>
                <th className="cell-num">Marge fourniture</th>
                <th>Modifié</th>
              </tr>
            </thead>
            <tbody>
              {filtres.map((d) => (
                <tr key={d.id}>
                  <td className="cell-title cell-card-title cell-wrap">
                    <Link
                      href={`/perso/gus/devis/${d.id}`}
                      className="group inline-flex items-center gap-2 transition-colors hover:text-brand"
                    >
                      <FileSpreadsheet className="h-4 w-4 shrink-0 text-subtle transition-colors group-hover:text-brand" />
                      <span className="ref">{libelleDevis(d.numero, d.revision)}</span>
                      {d.titre && <span className="text-muted">· {d.titre}</span>}
                    </Link>
                    {/* Une v1 dépassée doit se voir comme telle, sans avoir à
                        ouvrir le devis pour comprendre pourquoi elle est basse. */}
                    {d.nbRevisions > 0 && (
                      <span className="ml-2 inline-flex items-center gap-1 text-xs text-subtle">
                        <GitBranch className="h-3 w-3" />
                        {d.nbRevisions} révision{d.nbRevisions > 1 ? "s" : ""} après
                      </span>
                    )}
                  </td>
                  <td data-label="Client">{d.clientNom || <span className="text-subtle">—</span>}</td>
                  <td data-label="Affaire">
                    {d.chantierId ? (
                      <Link href={`/affaires/${d.chantierId}`} className="hover:text-brand">
                        {d.chantierNom}
                        {d.numeroWhy && <span className="ref ml-1.5 text-subtle">{d.numeroWhy}</span>}
                      </Link>
                    ) : (
                      <span className="text-subtle">—</span>
                    )}
                  </td>
                  <td data-label="État">
                    <Badge tone={TON_ETAT[d.etat]} point>
                      {ETAT_DEVIS_LABEL[d.etat]}
                    </Badge>
                  </td>
                  <td data-label="Net HT" className="cell-num font-semibold">
                    {formatEuros(d.netHtCents)}
                    {/* Le nombre de lignes non chiffrées voyage AVEC le total :
                        un montant qu'on ne peut pas défendre doit le dire là où
                        on le lit, pas dans un écran plus loin. */}
                    {d.nbSansPrix > 0 && (
                      <span
                        className="ml-1.5 inline-flex items-center gap-1 text-xs font-normal text-warning"
                        title={`${d.nbSansPrix} ligne(s) sans prix d'achat connu — exclues du déboursé`}
                      >
                        <TriangleAlert className="h-3 w-3" />
                        {d.nbSansPrix}
                      </span>
                    )}
                  </td>
                  <td data-label="Marge fourniture" className="cell-num">
                    {d.tauxMargeFournitureCentieme === null ? (
                      <span className="text-subtle">—</span>
                    ) : (
                      <span
                        className={cn(
                          d.margeFournitureCents <= 0 ? "text-danger" : "text-muted",
                        )}
                      >
                        {formatEuros(d.margeFournitureCents)}
                        <span className="ml-1 text-xs text-subtle">
                          {formatPourcent(d.tauxMargeFournitureCentieme)}
                        </span>
                      </span>
                    )}
                  </td>
                  <td data-label="Modifié">{dateFr.format(d.updatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

/* -----------------------------------------------------------------------------
 * NOUVEAU DEVIS
 * Deux chemins assumés : partir d'une AFFAIRE (le client et le n° Why suivent
 * tout seuls), ou d'un client libre — le devis d'avant-projet, quand l'affaire
 * n'existe pas encore.
 * -------------------------------------------------------------------------- */

function NouveauDevis({
  clients,
  affaires,
  onFerme,
  onCree,
}: {
  clients: string[];
  affaires: AffaireChoix[];
  onFerme: () => void;
  onCree: (id: string) => void;
}) {
  const [titre, setTitre] = useState("");
  const [clientNom, setClientNom] = useState("");
  const [numeroWhy, setNumeroWhy] = useState("");
  const [chantierId, setChantierId] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, demarrer] = useTransition();

  function choisirAffaire(id: string) {
    setChantierId(id);
    const a = affaires.find((x) => x.id === id);
    if (a) {
      setClientNom(a.clientNom);
      setNumeroWhy(a.numeroWhy ?? "");
      if (!titre) setTitre(a.nom);
    }
  }

  function valider() {
    setErreur(null);
    demarrer(async () => {
      try {
        const d = await creerDevis({ titre, clientNom, numeroWhy, chantierId: chantierId || null });
        onCree(d.id);
      } catch (e) {
        setErreur(e instanceof Error ? e.message : "Création impossible");
      }
    });
  }

  return (
    <div className="bloc anim-rise mb-5 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="stamp">Nouveau devis</h2>
        <button onClick={onFerme} className="text-sm text-muted hover:text-fg">
          Annuler
        </button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <Label htmlFor="dv-titre">Objet</Label>
          <Input
            id="dv-titre"
            value={titre}
            onChange={(e) => setTitre(e.target.value)}
            placeholder="GTB chaufferie — lot 3"
            autoFocus
          />
        </div>
        <div>
          <Label htmlFor="dv-affaire">Affaire (facultatif)</Label>
          <select
            id="dv-affaire"
            value={chantierId}
            onChange={(e) => choisirAffaire(e.target.value)}
            className="h-[var(--control-h)] w-full rounded-md border border-border bg-surface px-3 text-sm text-fg"
          >
            <option value="">— Sans affaire —</option>
            {affaires.map((a) => (
              <option key={a.id} value={a.id}>
                {a.nom} {a.numeroWhy ? `(${a.numeroWhy})` : ""}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label>Client</Label>
          <Combobox
            value={clientNom}
            onInput={setClientNom}
            onPick={(o) => setClientNom(o.value)}
            options={clients.map((c) => ({ value: c }))}
            placeholder="Nom du client"
          />
        </div>
        <div>
          <Label htmlFor="dv-why">N° Why</Label>
          <Input
            id="dv-why"
            value={numeroWhy}
            onChange={(e) => setNumeroWhy(e.target.value)}
            placeholder="SE60-001"
            className="ref"
          />
        </div>
      </div>
      {erreur && <p className="mt-3 text-sm text-danger">{erreur}</p>}
      <div className="mt-4 flex items-center gap-3">
        <Button onClick={valider} disabled={enCours}>
          {enCours ? "Création…" : "Créer et chiffrer"}
        </Button>
        <p className="text-xs text-subtle">
          Le numéro est attribué à la création, au format DT{"{AA}{NNNN}"}.
        </p>
      </div>
    </div>
  );
}
