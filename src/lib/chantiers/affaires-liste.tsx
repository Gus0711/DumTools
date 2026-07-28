"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Briefcase, RotateCcw, Search } from "lucide-react";
import { cn } from "@/lib/cn";
import { Combobox, EtatVide, type ComboOption } from "@/ui";
import type { EtatAffaire } from "@/generated/prisma/enums";
import type { AffaireResume } from "./queries";
import { ETATS_ACTIFS, ETATS_AFFAIRE } from "./etats";
import { EtatBadge, ETAT_TONE, SynoptiqueMini } from "./etat-badge";

function fmtDate(d: Date) {
  return new Date(d).toLocaleDateString("fr-FR");
}

/** Normalise pour une recherche insensible à la casse / aux accents. */
function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

export function AffairesListe({ affaires }: { affaires: AffaireResume[] }) {
  const [query, setQuery] = useState("");
  // Par défaut : uniquement les affaires actives (Devis, Commande, En cours) —
  // Livrée / Clôturée / Corbeille restent accessibles en cliquant leur puce.
  const [etats, setEtats] = useState<Set<EtatAffaire>>(new Set(ETATS_ACTIFS));
  const [client, setClient] = useState("");

  // Clients réellement présents dans les affaires (pour l'autocomplétion).
  const clientOptions = useMemo<ComboOption[]>(
    () =>
      Array.from(new Set(affaires.map((a) => a.clientNom)))
        .sort((a, b) => a.localeCompare(b))
        .map((c) => ({ value: c })),
    [affaires],
  );

  // Compte par état : une puce de filtre qui annonce ce qu'elle contient évite
  // le clic « pour voir ».
  const parEtat = useMemo(() => {
    const m = new Map<EtatAffaire, number>();
    for (const a of affaires) m.set(a.etat, (m.get(a.etat) ?? 0) + 1);
    return m;
  }, [affaires]);

  const filtrees = useMemo(() => {
    const q = norm(query.trim());
    const cl = norm(client.trim());
    return affaires.filter((a) => {
      if (etats.size > 0 && !etats.has(a.etat)) return false;
      if (cl && !norm(a.clientNom).includes(cl)) return false;
      if (q) {
        const cible = norm(`${a.nom} ${a.clientNom} ${a.numeroWhy ?? ""}`);
        if (!cible.includes(q)) return false;
      }
      return true;
    });
  }, [affaires, query, etats, client]);

  function toggleEtat(e: EtatAffaire) {
    setEtats((prev) => {
      const next = new Set(prev);
      if (next.has(e)) next.delete(e);
      else next.add(e);
      return next;
    });
  }

  const etatsParDefaut =
    etats.size === ETATS_ACTIFS.length && ETATS_ACTIFS.every((e) => etats.has(e));
  const filtreActif = query.trim() !== "" || client !== "" || !etatsParDefaut;
  function reinitialiser() {
    setQuery("");
    setEtats(new Set(ETATS_ACTIFS));
    setClient("");
  }

  // Base vide et liste filtrée vide sont deux situations différentes : la
  // première appelle une création, la seconde un élargissement des filtres.
  if (affaires.length === 0) {
    return (
      <div className="bloc">
        <EtatVide
          dessin="pochette"
          titre="Aucune affaire pour l'instant"
          texte="Renseignez un numéro Why dans un outil (Projet GTB, par exemple) et l'affaire se crée toute seule — ou créez-la directement depuis le bouton ci-dessus."
        />
      </div>
    );
  }

  return (
    <div>
      {/* --- Barre de recherche + filtres --- */}
      <div className="mb-4 space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-56 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Rechercher (nom, client, n° Why)…"
              className={cn(
                "h-9 w-full rounded-md border border-border bg-surface pl-9 pr-3 text-sm text-fg shadow-sm",
                "transition-[border-color,box-shadow] duration-150",
                "placeholder:text-subtle hover:border-brand/40 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20",
              )}
            />
          </div>

          <div className="w-56">
            <Combobox
              value={client}
              onInput={setClient}
              onPick={(o) => setClient(o.value)}
              options={clientOptions}
              placeholder="Filtrer par client…"
            />
          </div>
        </div>

        <div className="-mx-4 flex items-center gap-1.5 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {ETATS_AFFAIRE.map((e) => {
            const actif = etats.has(e.value);
            const n = parEtat.get(e.value) ?? 0;
            return (
              <button
                key={e.value}
                type="button"
                onClick={() => toggleEtat(e.value)}
                aria-pressed={actif}
                className={cn(
                  "inline-flex min-h-[2.25rem] shrink-0 items-center gap-1.5 rounded-md border px-3 text-xs font-medium sm:min-h-0 sm:px-2.5 sm:py-1",
                  "transition-[opacity,border-color,background-color] duration-150",
                  ETAT_TONE[e.value],
                  actif
                    ? "border-current opacity-100"
                    : "border-transparent opacity-45 hover:opacity-80",
                )}
              >
                {e.label}
                <span className="font-mono tabular-nums opacity-70">{n}</span>
              </button>
            );
          })}

          {filtreActif && (
            <button
              type="button"
              onClick={reinitialiser}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-xs text-muted transition-colors hover:text-fg sm:px-2.5 sm:py-1"
            >
              <RotateCcw className="h-3.5 w-3.5" /> Réinitialiser
            </button>
          )}

          <span className="ml-auto hidden shrink-0 text-xs tabular-nums text-subtle sm:block">
            {filtrees.length} / {affaires.length} affaire{affaires.length > 1 ? "s" : ""}
          </span>
        </div>

        {/* Au téléphone le compte sort du défilement horizontal : on doit
            pouvoir le lire sans faire glisser les puces. */}
        <p className="text-xs tabular-nums text-subtle sm:hidden">
          {filtrees.length} / {affaires.length} affaire{affaires.length > 1 ? "s" : ""}
        </p>
      </div>

      {/* --- Tableau --- */}
      {filtrees.length === 0 ? (
        <div className="bloc">
          <EtatVide
            icone={Search}
            titre="Aucune affaire ne correspond"
            texte="Élargissez les états retenus, ou effacez la recherche."
            action={
              <button
                type="button"
                onClick={reinitialiser}
                className="text-sm font-semibold text-brand hover:underline"
              >
                Réinitialiser les filtres
              </button>
            }
          />
        </div>
      ) : (
        <div className="bloc overflow-x-auto">
          <table className="data-table table-cards">
            <thead>
              <tr>
                <th>Affaire</th>
                <th>Client</th>
                <th>N° Why</th>
                <th>État</th>
                <th className="cell-num">Réal.</th>
                <th>Modifié</th>
              </tr>
            </thead>
            <tbody>
              {filtrees.map((a) => (
                <tr key={a.id}>
                  <td className="cell-title cell-card-title cell-wrap">
                    <Link
                      href={`/affaires/${a.id}`}
                      className="group inline-flex items-center gap-2 transition-colors hover:text-brand"
                    >
                      <Briefcase className="h-4 w-4 shrink-0 text-subtle transition-colors group-hover:text-brand" />
                      {a.nom}
                    </Link>
                  </td>
                  <td data-label="Client">{a.clientNom}</td>
                  <td data-label="N° Why">
                    {a.numeroWhy ? (
                      <span className="ref rounded bg-surface-2 px-1.5 py-0.5 text-fg">
                        {a.numeroWhy}
                      </span>
                    ) : (
                      <span className="text-subtle">—</span>
                    )}
                  </td>
                  <td data-label="État">
                    <span className="inline-flex items-center gap-2.5">
                      <EtatBadge etat={a.etat} />
                      <SynoptiqueMini etat={a.etat} className="hidden lg:inline-flex" />
                    </span>
                  </td>
                  <td data-label="Réalisations" className="cell-num">
                    {a.nbRealisations}
                  </td>
                  <td data-label="Modifié">{fmtDate(a.updatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
