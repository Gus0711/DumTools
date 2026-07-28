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
import { Chiffre, EtatVide, RangeeChiffres } from "@/ui";
import { auth } from "@/auth";
import { cn } from "@/lib/cn";
import { TitreEcran } from "@/components/app-shell/contexte-ecran";
import { EspacePersoCard } from "@/components/espace-perso-card";
import { TOOLS_AFFAIRE, TOOLS_NAV, classeSignal, espacesPersoActifs } from "@/tools/registry";
import { listerAffaires, listerMesTaches } from "@/lib/chantiers/queries";
import { activiteRecente, LIBELLE_ACTIVITE, type TypeActivite } from "@/lib/activite/queries";
import { ETATS_ACTIFS } from "@/lib/chantiers/etats";
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

/** « Augustin Duhant » → « Augustin ». */
function prenom(nom: string) {
  return nom.split(/[\s.@]+/)[0] ?? nom;
}

export default async function AccueilPage() {
  const session = await auth();
  const [affaires, mesTaches, activite] = await Promise.all([
    listerAffaires(),
    session?.user?.id ? listerMesTaches(session.user.id) : Promise.resolve([]),
    activiteRecente(9),
  ]);
  const recentes = affaires.filter((a) => a.etat !== "CORBEILLE").slice(0, 6);
  const actives = affaires.filter((a) => ETATS_ACTIFS.includes(a.etat));
  const realisations = affaires.reduce((n, a) => n + a.nbRealisations, 0);

  const nom = session?.user?.name ?? session?.user?.email ?? "";
  const jour = new Date().toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <div className="mx-auto max-w-[1700px] px-4 py-5 md:px-7 md:py-7">
      <TitreEcran titre="Poste de travail" />

      {/* --- L'ouverture : qui, quel jour, et l'état de la maison en chiffres.
              LA surface marine de l'écran — une par page, jamais deux : c'est
              la couleur de la maison, elle ne se dilue pas. Les compteurs se
              posent dessous en feuilles blanches. --------------------------- */}
      <section className="anim-rise mb-6">
        <div className="bloc plaque-brand relative flex flex-wrap items-center justify-between gap-x-8 gap-y-5 overflow-hidden border-transparent px-4 py-5 md:px-6 md:py-6">
          {/* Les 5 signaux en tête d'écran : la signature, à sa place. */}
          <span aria-hidden className="rule-signal anim-sweep absolute inset-x-0 top-0 h-[3px]" />

          <div className="min-w-0">
            <p className="stamp text-white/55">{jour}</p>
            <h1 className="mt-2 font-display text-[clamp(1.8rem,1.1rem+2.2vw,2.9rem)] font-bold leading-none tracking-[-0.035em] text-white">
              {nom ? `Bonjour ${prenom(nom)}` : "La boîte à outils de la GTB"}
            </h1>
          </div>

          <Link
            href="/affaires"
            className="group bg-accent text-accent-fg press inline-flex w-full items-center justify-center gap-2.5 px-5 py-3.5 text-sm font-semibold transition-colors hover:bg-accent-strong sm:w-auto sm:py-3"
          >
            Ouvrir les affaires
            <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1" />
          </Link>
        </div>

        <RangeeChiffres className="-mt-px">
          <Chiffre
            label="Affaires actives"
            valeur={actives.length}
            detail={`sur ${affaires.length} au total`}
            href="/affaires"
          />
          <Chiffre
            label="Mes tâches"
            valeur={mesTaches.length}
            ton={mesTaches.length > 0 ? "accent" : "neutre"}
            detail={mesTaches.length > 0 ? "à traiter" : "rien en attente"}
          />
          <Chiffre
            label="Réalisations"
            valeur={realisations}
            detail="tous outils confondus"
          />
          <Chiffre
            label="Dernier mouvement"
            valeur={activite[0] ? fmtRelatif(activite[0].date) : "—"}
            detail={activite[0]?.titre}
            petit
          />
        </RangeeChiffres>
      </section>

      {mesTaches.length > 0 && (
        <section className="mb-6">
          <MesTaches taches={mesTaches} />
        </section>
      )}

      {/* --- Deux journaux côte à côte, bord à bord ------------------------ */}
      <section aria-label="Tableau de bord" className="planche mb-6 lg:grid-cols-2">
        <Journal
          icone={Briefcase}
          titre="Affaires récentes"
          lien={{ href: "/affaires", label: "Toutes" }}
        >
          {recentes.length === 0 ? (
            <EtatVide
              dessin="pochette"
              titre="Aucune affaire"
              texte="Une affaire naît d'un numéro Why. Créez la première pour démarrer."
              action={
                <Link href="/affaires" className="text-sm font-semibold text-brand hover:underline">
                  Créer une affaire →
                </Link>
              }
            />
          ) : (
            <ul className="stagger divide-y divide-hairline">
              {recentes.map((a) => (
                <li key={a.id}>
                  <Link
                    href={`/affaires/${a.id}`}
                    className="block px-4 py-3 transition-colors hover:bg-surface-2 sm:py-2.5"
                  >
                    <span className="flex items-baseline gap-3">
                      <span className="min-w-0 flex-1 truncate text-sm font-semibold text-fg">
                        {a.nom}
                      </span>
                      <span
                        suppressHydrationWarning
                        className="hidden shrink-0 text-xs tabular-nums text-subtle sm:block"
                      >
                        {fmtRelatif(a.updatedAt)}
                      </span>
                    </span>
                    <span className="mt-1 flex items-center gap-2">
                      <span className="min-w-0 flex-1 truncate text-xs text-muted">
                        {a.clientNom}
                      </span>
                      <EtatBadge etat={a.etat} className="shrink-0" />
                      <span
                        suppressHydrationWarning
                        className="shrink-0 text-xs tabular-nums text-subtle sm:hidden"
                      >
                        {fmtRelatif(a.updatedAt)}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Journal>

        <Journal icone={History} titre="Activité récente" mention="tous outils">
          {activite.length === 0 ? (
            <EtatVide
              dessin="touret"
              titre="Rien n'a encore bougé"
              texte="Dès qu'un projet, une note ou une visite est enregistré, il apparaît ici."
            />
          ) : (
            <ul className="stagger divide-y divide-hairline">
              {activite.map((e) => {
                const Icone = ICONE_ACTIVITE[e.type];
                return (
                  <li key={`${e.type}:${e.id}`}>
                    <Link
                      href={e.href}
                      className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-surface-2 sm:py-2.5"
                    >
                      <Icone className="mt-0.5 h-4 w-4 shrink-0 text-subtle" />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline gap-3">
                          <span className="min-w-0 flex-1 truncate text-sm font-medium text-fg">
                            {e.titre}
                          </span>
                          <span
                            suppressHydrationWarning
                            className="shrink-0 text-xs tabular-nums text-subtle"
                          >
                            {fmtRelatif(e.date)}
                          </span>
                        </span>
                        <span className="mt-0.5 block truncate text-xs text-muted">
                          {LIBELLE_ACTIVITE[e.type]}
                          {e.contexte ? ` · ${e.contexte}` : ""}
                          {e.auteur ? ` · ${e.auteur}` : ""}
                        </span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Journal>
      </section>

      {/* --- Les outils : une planche de cases, pas une grille de cartes --- */}
      <Rang titre="Outils" mention="l'affaire est le point d'entrée — les outils s'y rattachent" />
      <section
        aria-label="Outils disponibles"
        className="stagger planche mb-6 sm:grid-cols-2 lg:grid-cols-3"
      >
        {TOOLS_NAV.map((tool) => (
          <CaseOutil key={tool.id} tool={tool} />
        ))}
      </section>

      <div className="bloc mb-8 flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
        <span className="stamp">Depuis une affaire</span>
        {TOOLS_AFFAIRE.map((t) => (
          <span key={t.id} className="inline-flex items-center gap-1.5 text-sm text-muted">
            <t.icon className="h-4 w-4 text-subtle" />
            {t.nom}
          </span>
        ))}
        <Link
          href="/affaires"
          className="ml-auto inline-flex min-h-[2.25rem] items-center text-sm font-semibold text-brand transition-colors hover:text-brand-strong sm:min-h-0"
        >
          Voir les affaires →
        </Link>
      </div>

      {espacesPersoActifs().length > 0 && (
        <>
          <Rang titre="Espaces perso" mention="les outils de chacun, ouverts à tous" />
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

/** Journal : une liste posée dans un bloc, avec son entête estampillée. */
function Journal({
  icone: Icone,
  titre,
  lien,
  mention,
  children,
}: {
  icone: LucideIcon;
  titre: string;
  lien?: { href: string; label: string };
  mention?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bloc">
      <div className="bloc-entete">
        <Icone className="h-4 w-4 text-brand" />
        <span className="font-display text-sm font-semibold text-fg">{titre}</span>
        {mention && <span className="stamp ml-auto">{mention}</span>}
        {lien && (
          <Link
            href={lien.href}
            className="ml-auto inline-flex min-h-[2.25rem] items-center text-xs font-medium text-muted transition-colors hover:text-brand sm:min-h-0"
          >
            {lien.label} →
          </Link>
        )}
      </div>
      {children}
    </div>
  );
}

/** Case d'outil : un carreau de la planche, pas une carte qui flotte.
 *  Chaque outil porte son signal E/S (voir `SignalOutil` dans le registre) —
 *  c'est ce qui fait qu'on reconnaît le Wiki au turquoise et les Visites à
 *  l'ambre avant d'avoir lu leur nom. */
function CaseOutil({ tool }: { tool: (typeof TOOLS_NAV)[number] }) {
  const { icon: Icon, nom, description, href, status, signal } = tool;
  const ouvrable = status !== "planifie";

  const contenu = (
    <>
      <div className="flex items-start gap-3">
        <Icon className="text-signal mt-0.5 h-5 w-5 shrink-0" />
        <div className="min-w-0">
          <h3 className="font-display text-base font-semibold tracking-tight text-fg">{nom}</h3>
          <p className="mt-1 text-sm leading-relaxed text-muted">{description}</p>
        </div>
      </div>
      {ouvrable ? (
        <span className="text-signal mt-4 inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.08em]">
          Ouvrir
          <ArrowRight className="h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-1" />
        </span>
      ) : (
        <span className="stamp mt-4 block">Bientôt disponible</span>
      )}
    </>
  );

  const classes = cn(
    "bloc group relative flex flex-col justify-between p-4 transition-colors duration-150",
    classeSignal(signal),
  );

  return ouvrable ? (
    <Link href={href} className={cn(classes, "hover:bg-surface-2")}>
      {/* Le filet du signal se met sous tension au survol. */}
      <span
        aria-hidden
        className="bg-signal absolute inset-x-0 top-0 h-[3px] origin-left scale-x-0 transition-transform duration-500 group-hover:scale-x-100"
      />
      {contenu}
    </Link>
  ) : (
    <div className={cn(classes, "opacity-60")}>{contenu}</div>
  );
}

/** Titre de rang — le filet qui sépare deux familles de contenu. */
function Rang({ titre, mention }: { titre: string; mention?: string }) {
  return (
    <div className="mb-3 flex items-center gap-3">
      <h2 className="font-display text-sm font-semibold uppercase tracking-[0.12em] text-fg">
        {titre}
      </h2>
      <span aria-hidden className="h-px flex-1 bg-hairline" />
      {mention && <span className="hidden text-xs text-subtle sm:block">{mention}</span>}
    </div>
  );
}
