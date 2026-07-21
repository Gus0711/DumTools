"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { CornerDownLeft, FileText, Loader2, Search } from "lucide-react";
import { rechercherWiki } from "./actions";
import { segmentsSurlignes } from "./model";
import type { WikiResultatRecherche } from "./queries";

/* Recherche globale du wiki : plein-texte Postgres (pertinence + extraits
 * surlignés), débouncée. Rien n'est chargé d'avance — chaque frappe (≥ 2
 * caractères, après 220 ms de pause) interroge le serveur. */

function Extrait({ texte }: { texte: string }) {
  return (
    <>
      {segmentsSurlignes(texte).map((s, i) =>
        s.fort ? (
          <mark key={i} className="rounded bg-accent-soft px-0.5 font-medium text-fg">
            {s.texte}
          </mark>
        ) : (
          <span key={i}>{s.texte}</span>
        ),
      )}
    </>
  );
}

export function RechercheWiki() {
  const [q, setQ] = useState("");
  // On mémorise la requête associée à la réponse : les résultats ne s'affichent
  // que s'ils correspondent à la saisie courante (pas de flash de résultats
  // périmés, et aucun setState synchrone dans l'effet).
  const [rep, setRep] = useState<{ q: string; res: WikiResultatRecherche[] } | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    const requete = q.trim();
    if (requete.length < 2) return;
    const t = setTimeout(() => {
      start(async () => {
        const res = await rechercherWiki(requete);
        setRep({ q: requete, res });
      });
    }, 220);
    return () => clearTimeout(t);
  }, [q]);

  const requete = q.trim();
  const actif = requete.length >= 2;
  const resultats = rep && rep.q === requete ? rep.res : null;

  return (
    <div>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-subtle" />
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Rechercher dans tout le wiki…"
          aria-label="Rechercher dans le wiki"
          className="w-full rounded-xl border border-border bg-surface py-3 pl-11 pr-10 text-base text-fg shadow-sm outline-none transition-colors placeholder:text-subtle focus:border-brand"
        />
        {pending && (
          <Loader2 className="absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-subtle" />
        )}
      </div>

      {actif && (
        <div className="mt-3">
          {resultats === null ? (
            <p className="px-1 text-sm text-subtle">Recherche…</p>
          ) : resultats.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border bg-surface px-4 py-6 text-center text-sm text-muted">
              Aucune page ne correspond à « {q.trim()} ».
            </p>
          ) : (
            <ul className="divide-y divide-border-soft overflow-hidden rounded-xl border border-border bg-surface">
              {resultats.map((r) => (
                <li key={r.id}>
                  <Link
                    href={`/outils/wiki/${r.rubriqueSlug}/${r.id}`}
                    className="group flex items-start gap-3 px-4 py-3 transition-colors hover:bg-surface-2"
                  >
                    <FileText className="mt-0.5 h-4 w-4 shrink-0 text-subtle" />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="truncate font-medium text-fg group-hover:text-brand">
                          {r.titre || "Sans titre"}
                        </span>
                        <span className="shrink-0 rounded bg-surface-2 px-1.5 py-0.5 text-[0.7rem] font-medium text-muted">
                          {r.rubriqueNom}
                        </span>
                      </span>
                      {r.extrait && (
                        <span className="mt-0.5 block text-sm text-muted">
                          <Extrait texte={r.extrait} />
                        </span>
                      )}
                    </span>
                    <CornerDownLeft className="mt-1 h-3.5 w-3.5 shrink-0 text-subtle opacity-0 transition-opacity group-hover:opacity-100" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
