import Link from "next/link";
import {
  ArrowRight,
  Briefcase,
  CircuitBoard,
  ClipboardCheck,
  FolderOpen,
  History,
  Library,
  NotebookPen,
  type LucideIcon,
} from "lucide-react";
import { Badge } from "@/ui";
import { auth } from "@/auth";
import { FeaturedToolCard, ToolCard } from "@/components/tool-card";
import { EspacePersoCard } from "@/components/espace-perso-card";
import { TOOLS_AFFAIRE, TOOLS_NAV, espacesPersoActifs } from "@/tools/registry";
import { listerAffaires, listerMesTaches } from "@/lib/chantiers/queries";
import { activiteRecente, LIBELLE_ACTIVITE, type TypeActivite } from "@/lib/activite/queries";
import { EtatBadge } from "@/lib/chantiers/etat-badge";
import { MesTaches } from "@/lib/chantiers/mes-taches";
import { fmtRelatif } from "@/lib/dates";

/** Icône par type d'événement du fil d'activité. */
const ICONE_ACTIVITE: Record<TypeActivite, LucideIcon> = {
  affaire: Briefcase,
  projet: CircuitBoard,
  note: NotebookPen,
  document: FolderOpen,
  visite: ClipboardCheck,
  wiki: Library,
};

export default async function AccueilPage() {
  const session = await auth();
  const [affaires, mesTaches, activite] = await Promise.all([
    listerAffaires(),
    session?.user?.id ? listerMesTaches(session.user.id) : Promise.resolve([]),
    activiteRecente(8),
  ]);
  // Les affaires actives les plus récemment touchées (Corbeille exclue).
  const recentes = affaires.filter((a) => a.etat !== "CORBEILLE").slice(0, 5);

  return (
    <div className="mx-auto max-w-6xl px-6 py-8 md:px-10 md:py-10">
      {/* Bandeau marine « plan d'architecte » — signature de la maison, réduit
          au minimum : l'accueil est un tableau de bord, pas une page vitrine. */}
      <section className="bg-brand-gradient text-brand-fg relative mb-6 overflow-hidden rounded-xl shadow-sm">
        <div aria-hidden className="blueprint-grid pointer-events-none absolute inset-0" />
        {/* Filet de signaux E/S — la « langue » couleur du métier. */}
        <div aria-hidden className="absolute inset-x-0 top-0 flex h-0.5">
          <span className="flex-1 bg-io-ai" />
          <span className="flex-1 bg-io-di" />
          <span className="flex-1 bg-io-ao" />
          <span className="flex-1 bg-io-do" />
          <span className="flex-1 bg-io-com" />
        </div>

        <div className="relative flex flex-wrap items-baseline gap-x-3 gap-y-1 px-5 py-3.5 md:px-6">
          <h1 className="font-display text-lg font-bold tracking-tight text-white md:text-xl">
            La boîte à outils de la GTB
          </h1>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sidebar-muted">
            Groupe Fareneït · Dumortier
          </p>
        </div>
      </section>

      {/* Affaires — le pivot de la plateforme, au-dessus des outils. */}
      <section aria-label="Affaires" className="mb-9">
        <Link href="/affaires" className="group block">
          <div className="relative overflow-hidden rounded-2xl border border-brand/25 bg-surface shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-brand/50 hover:shadow-lg">
            <span aria-hidden className="rule-accent absolute inset-x-0 top-0 h-0.5" />
            <div className="flex flex-col gap-6 p-6 sm:flex-row sm:items-center sm:gap-7 sm:p-7">
              <div className="bg-brand-gradient relative flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl shadow-md">
                <span aria-hidden className="blueprint-grid absolute inset-0" />
                <Briefcase className="relative h-9 w-9 text-white" />
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2.5">
                  <h2 className="font-display text-xl font-semibold tracking-tight text-fg">
                    Affaires
                  </h2>
                  <Badge tone="accent">Point d&apos;entrée</Badge>
                </div>
                <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">
                  Le pivot de la plateforme : une affaire par numéro Why, qui regroupe tout ce
                  qui est produit pour un client à travers tous les outils. Client, n° Why et
                  suivi partent d&apos;ici.
                </p>
                {/* Les outils « d'affaire » vivent ici : on les annonce plutôt que
                    de leur donner une carte à part (on ne les crée jamais seuls). */}
                <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1.5 text-xs text-subtle">
                  <span>Depuis une affaire :</span>
                  {TOOLS_AFFAIRE.map((t) => (
                    <span
                      key={t.id}
                      className="inline-flex items-center gap-1.5 rounded-md bg-surface-2 px-2 py-1 font-medium text-muted"
                    >
                      <t.icon className="h-3.5 w-3.5 text-subtle" />
                      {t.nom}
                    </span>
                  ))}
                </div>
              </div>

              <span className="bg-brand text-brand-fg shadow-sm transition-colors group-hover:bg-brand-strong inline-flex shrink-0 items-center gap-2 self-start rounded-lg px-5 py-2.5 text-sm font-semibold sm:self-auto">
                Voir les affaires
                <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1" />
              </span>
            </div>
          </div>
        </Link>
      </section>

      {/* Mes tâches — la seule chose à FAIRE sur cette page, donc en premier. */}
      {mesTaches.length > 0 && (
        <div className="mb-9">
          <MesTaches taches={mesTaches} />
        </div>
      )}

      {/* Tableau de bord : où j'en étais / ce qui a bougé chez les autres. */}
      <section aria-label="Tableau de bord" className="mb-9 grid gap-4 lg:grid-cols-2">
        {/* --- Affaires récentes --- */}
        <div className="data-card overflow-hidden">
          <div className="flex items-center gap-2 border-b border-border bg-surface-2 px-4 py-2.5">
            <Briefcase className="h-4 w-4 text-muted" />
            <h2 className="text-sm font-semibold text-fg">Affaires récentes</h2>
            <Link
              href="/affaires"
              className="ml-auto text-xs text-muted transition-colors hover:text-fg"
            >
              Toutes →
            </Link>
          </div>
          {recentes.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-subtle">
              Aucune affaire pour l&apos;instant.
            </p>
          ) : (
            <ul className="divide-y divide-border-soft">
              {recentes.map((a) => (
                <li key={a.id}>
                  <Link
                    href={`/affaires/${a.id}`}
                    className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-surface-2"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-fg">{a.nom}</span>
                      <span className="block truncate text-xs text-muted">{a.clientNom}</span>
                    </span>
                    <EtatBadge etat={a.etat} className="shrink-0" />
                    <span
                      suppressHydrationWarning
                      className="w-20 shrink-0 text-right text-xs text-subtle"
                    >
                      {fmtRelatif(a.updatedAt)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* --- Activité récente (tous outils) --- */}
        <div className="data-card overflow-hidden">
          <div className="flex items-center gap-2 border-b border-border bg-surface-2 px-4 py-2.5">
            <History className="h-4 w-4 text-muted" />
            <h2 className="text-sm font-semibold text-fg">Activité récente</h2>
            <span className="ml-auto text-xs text-subtle">tous outils</span>
          </div>
          {activite.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-subtle">
              Rien n&apos;a encore été produit sur la plateforme.
            </p>
          ) : (
            <ul className="divide-y divide-border-soft">
              {activite.map((e) => {
                const Icone = ICONE_ACTIVITE[e.type];
                return (
                  <li key={`${e.type}:${e.id}`}>
                    <Link
                      href={e.href}
                      className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-surface-2"
                    >
                      <Icone className="h-4 w-4 shrink-0 text-subtle" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-fg">
                          {e.titre}
                        </span>
                        <span className="block truncate text-xs text-muted">
                          {LIBELLE_ACTIVITE[e.type]}
                          {e.contexte ? ` · ${e.contexte}` : ""}
                          {e.auteur ? ` · ${e.auteur}` : ""}
                        </span>
                      </span>
                      <span
                        suppressHydrationWarning
                        className="w-20 shrink-0 text-right text-xs text-subtle"
                      >
                        {fmtRelatif(e.date)}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>

      <div className="mb-4 flex items-center gap-3">
        <h2 className="text-lg font-semibold tracking-tight text-fg">Outils</h2>
        <span className="h-px flex-1 bg-border" />
        <span className="text-xs text-subtle">
          De nouveaux outils sont ajoutés au fil des besoins
        </span>
      </div>

      {TOOLS_NAV.length === 1 ? (
        <section aria-label="Outils disponibles">
          <FeaturedToolCard tool={TOOLS_NAV[0]} />
        </section>
      ) : (
        <section
          aria-label="Outils disponibles"
          className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
        >
          {TOOLS_NAV.map((tool) => (
            <ToolCard key={tool.id} tool={tool} />
          ))}
        </section>
      )}

      {/* Espaces perso — outils personnels, à l'écart des outils métier. */}
      {espacesPersoActifs().length > 0 && (
        <>
          <div className="mt-9 mb-4 flex items-center gap-3">
            <h2 className="text-lg font-semibold tracking-tight text-fg">
              Espaces perso
            </h2>
            <span className="h-px flex-1 bg-border" />
            <span className="text-xs text-subtle">
              Les outils perso de chacun, accessibles à tous
            </span>
          </div>
          <section aria-label="Espaces perso" className="space-y-4">
            {espacesPersoActifs().map((espace) => (
              <EspacePersoCard key={espace.slug} espace={espace} />
            ))}
          </section>
        </>
      )}
    </div>
  );
}
