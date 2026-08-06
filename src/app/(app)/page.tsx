import Link from "next/link";
import { Briefcase, ClipboardCheck, History, RotateCcw, ScanLine } from "lucide-react";
import { auth } from "@/auth";
import { TitreEcran } from "@/components/app-shell/contexte-ecran";
import { BoutonRecherche } from "@/components/recherche/bouton-recherche";
import { Cadran } from "@/components/accueil/cadran";
import { ParcAffaires } from "@/components/accueil/parc-affaires";
import { BandeauPerso, Fil } from "@/components/accueil/fil";
import { NouvelleAffaire } from "@/lib/chantiers/nouvelle-affaire";
import { MesTaches } from "@/lib/chantiers/mes-taches";
import { NoteRapide } from "@/tools/wiki/boutons";
import { chargerAccueil } from "@/lib/accueil/queries";
import { listerMesTaches } from "@/lib/chantiers/queries";
import { listerClients } from "@/lib/clients/queries";
import { activiteRecente } from "@/lib/activite/queries";
import { ESPACES_PERSO, STATUS_LABEL, TOOLS_NAV, toolsDeProprietaire } from "@/tools/registry";

/* =============================================================================
 * LE POSTE DE TRAVAIL
 * L'accueil ne refait pas la navigation (le rail et la barre du bas la portent
 * déjà) : il répond à « où en est la maison » puis « qu'est-ce que je reprends ».
 *
 * L'écran se lit en trois temps :
 *   1. le CARTOUCHE-LANCEUR — qui, quel jour, et par quoi on commence
 *      (recherche ⌘K + les quatre gestes de création) ;
 *   2. les QUATRE CADRANS — les destinations de l'appli, chacune avec son
 *      compteur vital et son alerte s'il y en a une ;
 *   3. LE TRAVAIL — le parc d'affaires à gauche, ce qui me concerne à droite.
 * ========================================================================== */

/** « Augustin Duhant » → « Augustin ». */
function prenom(nom: string) {
  return nom.split(/[\s.@]+/)[0] ?? nom;
}

export default async function AccueilPage() {
  const session = await auth();
  const moi = session?.user?.id;

  const [accueil, clients, mesTaches, reprendre, activite] = await Promise.all([
    chargerAccueil(),
    listerClients(),
    moi ? listerMesTaches(moi) : Promise.resolve([]),
    moi ? activiteRecente(5, moi) : Promise.resolve([]),
    activiteRecente(8),
  ]);

  const nom = session?.user?.name ?? session?.user?.email ?? "";
  const jour = new Date().toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const espaces = ESPACES_PERSO.map((e) => ({
    slug: e.slug,
    nom: e.nom,
    icone: e.icon,
    outils: toolsDeProprietaire(e.slug).map((t) => t.nom),
  })).filter((e) => e.outils.length > 0);

  return (
    <div className="mx-auto max-w-[1700px] px-4 py-5 md:px-7 md:py-7">
      <TitreEcran titre="Poste de travail" />

      {/* --- 1. Le cartouche-lanceur ------------------------------------- *
          LA surface marine de l'écran — une par page, jamais deux. Les gestes
          de création se posent juste dessous, sur une feuille blanche : ce sont
          des boutons de l'appli, ils gardent leur allure de boutons. */}
      <section className="anim-rise mb-4">
        <div className="bloc plaque-brand relative flex flex-wrap items-center justify-between gap-x-8 gap-y-4 overflow-hidden border-transparent px-4 py-5 md:px-6">
          {/* Les 5 signaux en tête d'écran : la signature, à sa place. */}
          <span aria-hidden className="rule-signal anim-sweep absolute inset-x-0 top-0 h-[3px]" />

          <div className="min-w-0">
            <p className="stamp text-white/55">{jour}</p>
            <h1 className="mt-2 font-display text-[clamp(1.8rem,1.1rem+2.2vw,2.9rem)] font-bold leading-none tracking-[-0.035em] text-white">
              {nom ? `Bonjour ${prenom(nom)}` : "La boîte à outils de la GTB"}
            </h1>
          </div>

          {/* Le point d'entrée VISIBLE de la palette : tout le monde ne connaît
              pas ⌘K, et depuis l'accueil c'est souvent par là qu'on part. */}
          <BoutonRecherche className="w-full border-white/20 bg-white/8 text-white/70 hover:border-white/40 hover:bg-white/15 hover:text-white sm:w-80 lg:w-96" />
        </div>

        <div className="bloc -mt-px flex flex-wrap items-center gap-2 px-4 py-3">
          <span className="stamp mr-1 hidden sm:block">Commencer</span>
          <NouvelleAffaire clients={clients.map((c) => c.nom)} />
          <NoteRapide />
          <Bouton href="/outils/visites/terrain" icone={ClipboardCheck} texte="Visite terrain" />
          <Bouton href="/outils/magasin/scan" icone={ScanLine} texte="Scanner un produit" />
        </div>
      </section>

      {/* --- 2. Les destinations, chacune avec son compteur vital ---------- *
          Les mêmes que le rail et que la barre du bas, dans le même ordre : le
          pivot d'abord, puis les outils du REGISTRE. Un outil ajouté à
          `TOOLS_NAV` prend donc sa case ici tout seul — il n'aura simplement
          pas de compteur tant que personne n'en aura écrit un dans
          `chargerAccueil()`. */}
      <section
        aria-label="Les outils"
        className="stagger planche mb-4 sm:grid-cols-2 xl:grid-cols-4"
      >
        <Cadran
          href="/affaires"
          nom="Affaires"
          icone={Briefcase}
          teinte="accent"
          donnees={accueil.affaires}
        />
        {TOOLS_NAV.map((outil) => (
          <Cadran
            key={outil.id}
            href={outil.href}
            nom={outil.nom}
            icone={outil.icon}
            teinte={outil.signal ?? "brand"}
            donnees={accueil.cadrans[outil.id]}
            aDefaut={STATUS_LABEL[outil.status]}
          />
        ))}
      </section>

      {/* --- 3. Le travail ------------------------------------------------ *
          À gauche, la colonne large : l'état du parc, puis ce que JE reprends —
          les deux choses sur lesquelles on revient, et « Reprendre » y gagne la
          place d'afficher le contexte de chaque document (l'affaire, la
          rubrique) plutôt qu'un titre coupé.
          À droite, la colonne étroite : ce qui m'est assigné, et ce que fait
          l'équipe — deux listes de lignes courtes, qui s'y logent sans être à
          l'étroit. */}
      <div className="mb-4 grid items-start gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="planche">
          <ParcAffaires
            parc={accueil.parc}
            nbActives={accueil.nbActives}
            esParc={accueil.esParc}
          />
          <Fil
            titre="Reprendre"
            icone={RotateCcw}
            mention="ce que j'ai touché"
            evenements={reprendre}
            vide={{
              dessin: "carnet",
              titre: "Rien à reprendre",
              texte: "Ce que vous modifierez apparaîtra ici, pour y retomber d'un clic.",
            }}
          />
        </div>

        <div className="planche">
          <MesTaches taches={mesTaches} colonne />
          <Fil
            titre="Activité"
            icone={History}
            mention="toute l'équipe"
            evenements={activite}
            montrerAuteur
            vide={{
              dessin: "touret",
              titre: "Rien n'a encore bougé",
              texte: "Dès qu'un projet, une note ou une visite est enregistré, il apparaît ici.",
            }}
          />
        </div>
      </div>

      {espaces.length > 0 && <BandeauPerso espaces={espaces} />}
    </div>
  );
}

/** Un lien qui a l'allure d'un bouton `outline` — pour les gestes du lanceur
 *  qui ne sont qu'une navigation (le terrain, le scan). */
function Bouton({
  href,
  icone: Icone,
  texte,
}: {
  href: string;
  icone: React.ComponentType<{ className?: string }>;
  texte: string;
}) {
  return (
    <Link
      href={href}
      className="press inline-flex h-[var(--control-h)] items-center justify-center gap-2 whitespace-nowrap rounded-md border border-border bg-surface px-4 text-sm font-medium text-fg transition-[background-color,border-color] duration-150 hover:border-brand/45 hover:bg-surface-2"
    >
      <Icone className="h-4 w-4" />
      {texte}
    </Link>
  );
}
