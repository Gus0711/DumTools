"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { LifeBuoy, Search } from "lucide-react";
import { Badge, Chiffre, EtatVide, Input, RangeeChiffres } from "@/ui";
import { useReprendreFiltres, useSyncUrl } from "@/lib/filtres-url";
import {
  ETATS_EN_COURS,
  LIBELLE_ETAT,
  TON_ETAT,
  formatDuree,
  formatEuros,
  formatJourCourt,
  jour,
  type ContratResume,
  type EtatContrat,
  type StatsMaintenance,
} from "./model";
import { BadgeEcheance, BarreForfait } from "./forfait";

/* L'index des contrats.
 *
 * Trois filtres et une recherche, retenus par poste comme partout ailleurs
 * (src/lib/filtres-url.ts) : on ouvre un contrat, on revient par le rail, et le
 * réglage est encore là. */

type FiltreEtat = "tous" | "en-cours" | EtatContrat;

const OPTIONS_ETAT: { valeur: FiltreEtat; label: string }[] = [
  { valeur: "en-cours", label: "En cours" },
  { valeur: "tous", label: "Tous" },
  { valeur: "ACTIF", label: "Actifs" },
  { valeur: "SUSPENDU", label: "Suspendus" },
  { valeur: "BROUILLON", label: "Brouillons" },
  { valeur: "TERMINE", label: "Terminés" },
];

const CLASSE_SELECT =
  "h-[var(--control-h)] rounded-md border border-border bg-surface px-2.5 text-sm text-fg hover:border-brand/40 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20";

export function IndexMaintenance({
  qui,
  contrats,
  stats,
}: {
  qui: string;
  contrats: ContratResume[];
  stats: StatsMaintenance;
}) {
  const [q, setQ] = useState("");
  // Le défaut n'est pas « tous » : un contrat terminé n'a plus rien à dire, et
  // il y en aura toujours plus que d'actifs.
  const [etat, setEtat] = useState<FiltreEtat>("en-cours");
  const [client, setClient] = useState("");
  const [aFacturer, setAFacturer] = useState(false);

  useSyncUrl(
    {
      q,
      etat: etat === "en-cours" ? "" : etat,
      client,
      facturer: aFacturer,
    },
    "maintenance",
  );
  useReprendreFiltres("maintenance", ["q", "etat", "client", "facturer"], (v) => {
    setQ(v("q") ?? "");
    setEtat((v("etat") as FiltreEtat) ?? "en-cours");
    setClient(v("client") ?? "");
    setAFacturer(v("facturer") === "1");
  });

  const clients = useMemo(
    () => [...new Set(contrats.map((c) => c.clientNom))].sort((a, b) => a.localeCompare(b)),
    [contrats],
  );

  const visibles = useMemo(() => {
    const terme = q.trim().toLowerCase();
    return contrats.filter((c) => {
      if (etat === "en-cours" && !ETATS_EN_COURS.includes(c.etat)) return false;
      if (etat !== "tous" && etat !== "en-cours" && c.etat !== etat) return false;
      if (client && c.clientNom !== client) return false;
      if (aFacturer && c.aFacturerMin <= 0) return false;
      if (!terme) return true;
      // Les SITES entrent dans la recherche : on cherche « Brancourt », pas le
      // nom du contrat qui le couvre — souvent on ne le connaît même pas.
      const foin = [
        c.intitule,
        c.clientNom,
        c.reference ?? "",
        c.numeroWhy ?? "",
        ...c.sites.map((s) => s.nom),
      ]
        .join(" ")
        .toLowerCase();
      return foin.includes(terme);
    });
  }, [contrats, q, etat, client, aFacturer]);

  const filtre = q || etat !== "en-cours" || client || aFacturer;

  return (
    <>
      <RangeeChiffres className="mb-5">
        <Chiffre
          label="Contrats en cours"
          valeur={stats.nbEnCours}
          detail={
            stats.nbContrats > stats.nbEnCours
              ? `${stats.nbContrats} au total`
              : undefined
          }
        />
        <Chiffre
          label="Forfaits dépassés"
          valeur={stats.nbDepasses}
          ton={stats.nbDepasses > 0 ? "danger" : "neutre"}
          detail={stats.nbTendus > 0 ? `${stats.nbTendus} bientôt épuisés` : undefined}
        />
        <Chiffre
          label="À refacturer"
          valeur={stats.aFacturerMin > 0 ? formatDuree(stats.aFacturerMin) : "—"}
          ton={stats.aFacturerMin > 0 ? "accent" : "neutre"}
          /* Ce qu'on ne sait pas chiffrer est DIT : un montant qui tait les
             contrats sans tarif se lirait comme un montant complet. */
          detail={
            stats.aFacturerCents != null ? (
              <>
                {formatEuros(stats.aFacturerCents)}
                {stats.nbSansTarif > 0 && (
                  <span className="text-danger">
                    {" "}
                    · {stats.nbSansTarif} contrat{stats.nbSansTarif > 1 ? "s" : ""} sans
                    tarif horaire
                  </span>
                )}
              </>
            ) : stats.nbSansTarif > 0 ? (
              <span className="text-danger">aucun tarif horaire renseigné</span>
            ) : undefined
          }
        />
        <Chiffre
          label="Échéances"
          valeur={stats.nbEcheances}
          ton={stats.nbEcheances > 0 ? "accent" : "neutre"}
          detail="préavis entamé ou terme passé"
        />
      </RangeeChiffres>

      <div className="data-card">
        <div className="bloc-entete flex-wrap gap-y-2">
          <div className="relative min-w-0 flex-1 sm:max-w-xs">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Contrat, client, site, n° Why…"
              className="pl-8"
              aria-label="Rechercher un contrat"
            />
          </div>

          <select
            value={etat}
            onChange={(e) => setEtat(e.target.value as FiltreEtat)}
            className={CLASSE_SELECT}
            aria-label="État"
          >
            {OPTIONS_ETAT.map((o) => (
              <option key={o.valeur} value={o.valeur}>
                {o.label}
              </option>
            ))}
          </select>

          <select
            value={client}
            onChange={(e) => setClient(e.target.value)}
            className={CLASSE_SELECT}
            aria-label="Client"
          >
            <option value="">Tous les clients</option>
            {clients.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>

          <label className="flex cursor-pointer items-center gap-2 text-sm text-muted">
            <input
              type="checkbox"
              checked={aFacturer}
              onChange={(e) => setAFacturer(e.target.checked)}
              className="h-4 w-4 accent-[var(--brand)]"
            />
            À refacturer
          </label>

          <span className="ml-auto font-mono text-xs text-muted">
            {visibles.length} / {contrats.length}
          </span>
        </div>

        {visibles.length === 0 ? (
          <EtatVide
            dessin={filtre ? "carnet" : "pochette"}
            titre={filtre ? "Aucun contrat ne répond" : "Aucun contrat de maintenance"}
            texte={
              filtre
                ? "Élargis la recherche ou change l'état."
                : "Un contrat, c'est un client, des sites, et un forfait d'heures qui se consomme."
            }
            action={
              !filtre && (
                <Link
                  href={`/perso/${qui}/maintenance/nouveau`}
                  className="press inline-flex h-[var(--control-h)] items-center gap-2 rounded-md bg-brand px-4 text-sm font-medium text-brand-fg hover:bg-brand-strong"
                >
                  Créer le premier contrat
                </Link>
              )
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table table-cards">
              <thead>
                <tr>
                  <th>Contrat</th>
                  <th>Sites</th>
                  <th>Période en cours</th>
                  <th className="min-w-[11rem]">Téléassistance</th>
                  <th className="min-w-[11rem]">Présentiel</th>
                  <th>À refacturer</th>
                  <th>Terme</th>
                  <th>État</th>
                </tr>
              </thead>
              <tbody>
                {visibles.map((c) => (
                  <tr key={c.id}>
                    {/* ⚠️ UN SEUL enfant. Sous 640 px, `.table-cards` passe la
                        cellule en `display: flex` : deux enfants se rangeraient
                        CÔTE À CÔTE au lieu de s'empiler, et le nom du client
                        viendrait se serrer contre le titre du contrat. */}
                    <td className="cell-wrap cell-card-title">
                      <div className="min-w-0">
                        <Link
                          href={`/perso/${qui}/maintenance/${c.id}`}
                          className="cell-title hover:text-brand"
                        >
                          {c.intitule}
                        </Link>
                        <span className="mt-0.5 block text-xs font-normal text-muted">
                          {c.clientNom}
                          {c.numeroWhy && <span className="ref"> · {c.numeroWhy}</span>}
                        </span>
                      </div>
                    </td>

                    <td data-label="Sites" className="cell-wrap">
                      {c.sites.length === 0 ? (
                        <span className="text-subtle">—</span>
                      ) : c.sites.length <= 2 ? (
                        c.sites.map((s) => s.nom).join(", ")
                      ) : (
                        <span title={c.sites.map((s) => s.nom).join(", ")}>
                          {c.nbSites} sites
                        </span>
                      )}
                    </td>

                    <td data-label="Période" className="font-mono text-xs tabular-nums">
                      {formatJourCourt(jour(c.periode.debut))}
                      <span className="text-subtle"> → </span>
                      {formatJourCourt(jour(c.periode.dernierJour))}
                    </td>

                    <td data-label="Téléassistance">
                      <BarreForfait c={c.consommation.TELEASSISTANCE} compact />
                    </td>

                    <td data-label="Présentiel">
                      <BarreForfait c={c.consommation.PRESENTIEL} compact />
                    </td>

                    <td data-label="À refacturer" className="cell-droite">
                      {c.aFacturerMin > 0 ? (
                        <span className="font-medium text-accent-strong">
                          {formatDuree(c.aFacturerMin)}
                        </span>
                      ) : (
                        <span className="text-subtle">—</span>
                      )}
                    </td>

                    <td data-label="Terme">
                      <BadgeEcheance echeance={c.echeance} tacite={c.tacite} />
                    </td>

                    <td data-label="État">
                      <Badge tone={TON_ETAT[c.etat]} point>
                        {LIBELLE_ETAT[c.etat]}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {contrats.length > 0 && visibles.length === 0 && (
        <p className="mt-3 flex items-center gap-2 text-xs text-muted">
          <LifeBuoy className="h-3.5 w-3.5" />
          Les contrats terminés sont masqués par défaut.
        </p>
      )}
    </>
  );
}
