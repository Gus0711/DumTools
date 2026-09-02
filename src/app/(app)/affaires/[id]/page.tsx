import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Cpu, FileStack, Globe, Hash, Layers, NotebookPen, Plus, TriangleAlert } from "lucide-react";
import { Button, EnteteBloc, EtatVide, JaugeES, Repere, type CompteES } from "@/ui";
import { cn } from "@/lib/cn";
import { avecRetour, lienRetour } from "@/lib/retour";
import { TitreEcran } from "@/components/app-shell/contexte-ecran";
import { etatLabel } from "@/lib/chantiers/etats";
import { auth } from "@/auth";
import { getAffaire, listerTaches } from "@/lib/chantiers/queries";
import { listerClients } from "@/lib/clients/queries";
import { listerUtilisateursActifs } from "@/lib/users/queries";
import { listerRealisationsAffaire } from "@/lib/chantiers/providers";
import type { EtatAffaire } from "@/generated/prisma/enums";
import { TOOLS_AFFAIRE, classeSignal, getTool } from "@/tools/registry";
import { calculerJalons } from "@/lib/chantiers/jalons";
import { FriseCycle } from "@/lib/chantiers/frise-cycle";
import { AffaireFicheHeader } from "@/lib/chantiers/affaire-fiche-header";
import { TachesKanban } from "@/lib/chantiers/taches-kanban";
import { DOSSIER_SCHEMA_ARMOIRE } from "@/lib/chantiers/armoire";
import { basculerArretProjet } from "@/lib/chantiers/actions";
import { BasculeArret } from "@/lib/chantiers/bascule-arret";
import { creerProjetPourAffaire } from "@/tools/affectation-es/actions";
import { listerProjetsAffaire, type AvancementTests } from "@/tools/affectation-es/queries";
import { listerDocuments, type DocResume } from "@/tools/documents/queries";
import { CATEGORIES, STATUT_LABEL, STATUT_TON, formatTaille } from "@/tools/documents/model";
import { DepotRapide } from "@/tools/documents/depot-rapide";
import { listerNotesAffaire } from "@/tools/notes/queries";
import { creerNotePourAffaire } from "@/tools/notes/actions";
import { listerScansAffaire } from "@/tools/modems/queries";
import { ScansAffaire } from "@/tools/modems/scans-affaire";
import { BlocMaterielAffaire } from "@/tools/magasin/bloc-affaire";
import { peutVoirPrix } from "@/tools/magasin/model";

/* =============================================================================
 * LA FICHE AFFAIRE
 * Même grammaire que l'accueil : la page n'est PAS une pile de titres flottants
 * suivis de tableaux, c'est une planche de BLOCS. Chaque section est un cadre au
 * trait fin qui porte son propre en-tête (`EnteteBloc`) — icône au signal de
 * l'outil dont elle vient, titre, compteur, action — et sa table est une
 * `.data-table` comme partout ailleurs. Un vide est dessiné, jamais un cadre
 * pointillé avec du gris dedans.
 * ========================================================================== */

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const affaire = await getAffaire(id);
  return { title: affaire ? `Affaire · ${affaire.nom}` : "Affaire" };
}

/** Teinte de la pastille d'état dans la barre de chrome. */
const TON_ETAT: Record<EtatAffaire, "neutre" | "brand" | "accent" | "success" | "danger"> = {
  DEVIS: "accent",
  COMMANDE: "brand",
  EN_COURS: "brand",
  LIVRE: "success",
  CLOTURE: "neutre",
  CORBEILLE: "danger",
};

function fmtDate(d: Date) {
  return new Date(d).toLocaleDateString("fr-FR");
}

/** Avancement de mise en service : pastilles colorées OK / défaut / à tester. */
function Avancement({ tests }: { tests: AvancementTests }) {
  if (tests.total === 0) return <span className="text-subtle">—</span>;
  const items: { n: number; label: string; cls: string }[] = [
    { n: tests.ok, label: "OK", cls: "bg-success/15 text-success" },
    { n: tests.defaut, label: "défaut", cls: "bg-danger/15 text-danger" },
    { n: tests.nonTeste, label: "à tester", cls: "bg-surface-2 text-muted" },
  ].filter((i) => i.n > 0);
  return (
    <span className="flex flex-wrap items-center gap-1">
      {items.map((i) => (
        <span
          key={i.label}
          className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium tabular-nums ${i.cls}`}
        >
          {i.n} {i.label}
        </span>
      ))}
    </span>
  );
}

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  /** `retour` = la liste d'où l'on vient, filtres compris (voir lib/retour). */
  searchParams: Promise<{ retour?: string }>;
}) {
  const { id } = await params;
  const { retour } = await searchParams;
  const affaire = await getAffaire(id);
  if (!affaire) notFound();

  const [projets, documents, notes, scans, realisations, clients, taches, utilisateurs, session] =
    await Promise.all([
      listerProjetsAffaire(id),
      listerDocuments(id),
      listerNotesAffaire(id),
      listerScansAffaire(id),
      // Projet GTB / Notes / Documents ont leur section dédiée ci-dessous :
      // on les exclut de l'agrégat pour ne pas les lister deux fois.
      listerRealisationsAffaire(id, TOOLS_AFFAIRE.map((t) => t.id)),
      listerClients(),
      listerTaches(id),
      listerUtilisateursActifs(),
      auth(),
    ]);

  // Frise du cycle (ROADMAP §3) : jalons dérivés des artefacts déjà chargés.
  const jalons = await calculerJalons({
    chantierId: id,
    besoinArmoire: affaire.besoinArmoire,
    projets,
    documents,
  });

  // Fichiers regroupés par dossier kDrive (= catégorie), dossiers vides masqués,
  // dans l'ordre canonique des CATEGORIES.
  const parDossier = CATEGORIES.map((cat) => ({
    dossier: cat,
    fichiers: documents.filter((d) => d.categorie === cat),
  })).filter((g) => g.fichiers.length > 0);

  // Contrôle armoire : si une nouvelle armoire est à fabriquer, un schéma
  // d'armoire (document du dossier « Armoire ») doit être présent.
  const besoinNouvelleArmoire = affaire.besoinArmoire === "NOUVELLE";
  const nbSchemasArmoire = documents.filter((d) => d.categorie === DOSSIER_SCHEMA_ARMOIRE).length;
  const schemaArmoireOk = nbSchemasArmoire > 0;

  // Agrégats de l'affaire : ce qui se lit d'un coup d'œil en haut de fiche.
  const nbModules = projets.reduce((n, p) => n + p.nbModules, 0);
  const repartitionES: CompteES = projets.reduce<CompteES>((acc, p) => {
    for (const [type, n] of Object.entries(p.es)) {
      acc[type as keyof CompteES] = (acc[type as keyof CompteES] ?? 0) + n;
    }
    return acc;
  }, {});
  const totalES = Object.values(repartitionES).reduce((a, b) => a + b, 0);
  const testsTotal = projets.reduce(
    (acc, p) => ({
      ok: acc.ok + p.tests.ok,
      defaut: acc.defaut + p.tests.defaut,
      nonTeste: acc.nonTeste + p.tests.nonTeste,
      total: acc.total + p.tests.total,
    }),
    { ok: 0, defaut: 0, nonTeste: 0, total: 0 },
  );

  // Les deux gestes de création de la fiche. Définis une fois, posés deux fois :
  // dans l'en-tête du bloc, et au centre de l'état vide — un vide qui ne propose
  // rien oblige à remonter chercher le bouton.
  const ajouterAutomate = (
    <form
      action={async () => {
        "use server";
        await creerProjetPourAffaire(id);
      }}
    >
      <Button type="submit" size="sm" variant="outline">
        <Plus className="h-4 w-4" /> Ajouter un automate
      </Button>
    </form>
  );

  const ajouterNote = (
    <form
      action={async () => {
        "use server";
        await creerNotePourAffaire(id);
      }}
    >
      <Button type="submit" size="sm" variant="outline">
        <Plus className="h-4 w-4" /> Nouvelle note
      </Button>
    </form>
  );

  return (
    /* space-y-4 : le même pas que l'accueil entre deux planches. */
    <div className="mx-auto max-w-[1700px] space-y-4 px-4 py-4 md:px-7 md:py-5">
      <TitreEcran
        estampille="Affaire"
        titre={affaire.nom}
        etat={{ label: etatLabel(affaire.etat), ton: TON_ETAT[affaire.etat] }}
      />
      <AffaireFicheHeader
        id={affaire.id}
        nom={affaire.nom}
        etat={affaire.etat}
        besoinArmoire={affaire.besoinArmoire}
        clientNom={affaire.clientNom}
        numeroWhy={affaire.numeroWhy}
        clients={clients.map((c) => c.nom)}
        suiviParId={affaire.suiviParId}
        suiviParNom={affaire.suiviParNom}
        utilisateurs={utilisateurs}
        retour={lienRetour(retour, { href: "/affaires", label: "Affaires" })}
      />

      {/* ---- Avancement : la frise des 7 jalons, ET les repères chiffrés ---
              Un seul bloc. Les compteurs (automates, E/S, mise en service,
              documents) tenaient auparavant leur propre bandeau au-dessus,
              suivi d'un second pour la répartition des signaux : trois blocs
              empilés pour répondre à une seule question — où en est l'affaire.
              L'alerte d'armoire, quand il y en a une, se clipse sous la frise
              dans la même planche : elle dit quoi faire de ce qu'on vient de
              lire, ce n'est pas un sujet à part. ---------------------------- */}
      <div className="planche">
        <FriseCycle
          jalons={jalons}
          reperes={
            <>
              <Repere
                label="Automates"
                valeur={projets.length}
                detail={nbModules > 0 ? `${nbModules} mod.` : undefined}
              />
              <Repere label="E/S" valeur={totalES} />
              <Repere
                label="MES"
                valeur={`${testsTotal.ok}/${testsTotal.total}`}
                ton={
                  testsTotal.defaut > 0
                    ? "danger"
                    : testsTotal.total > 0 && testsTotal.ok === testsTotal.total
                      ? "success"
                      : "neutre"
                }
                detail={testsTotal.defaut > 0 ? `${testsTotal.defaut} en défaut` : undefined}
              />
              <Repere
                label="Documents"
                valeur={documents.length}
                detail={`${notes.length} note${notes.length > 1 ? "s" : ""}`}
              />
            </>
          }
          signaux={totalES > 0 ? <JaugeES compte={repartitionES} /> : undefined}
        />

        {besoinNouvelleArmoire && !schemaArmoireOk && (
          <p className="flex items-center gap-2 border border-danger/45 bg-danger/10 px-4 py-2.5 text-sm text-danger">
            <TriangleAlert className="h-4 w-4 shrink-0" />
            <span>
              Nouvelle armoire à fabriquer — <strong>schéma d&apos;armoire manquant</strong> :
              déposez-le dans le dossier « {DOSSIER_SCHEMA_ARMOIRE} » des documents.
            </span>
          </p>
        )}
      </div>

      {/* ---- Tâches (todo kanban de l'affaire) ----------------------------- */}
      <TachesKanban
        chantierId={id}
        taches={taches}
        utilisateurs={utilisateurs}
        moiId={session?.user?.id ?? null}
      />

      {/* ---- Projet GTB, puis le Matériel qui en découle -------------------- *
              Les deux vivaient dans UNE planche, bord à bord : le matériel EN
              DÉRIVE, et les séparer d'un blanc laissait craindre qu'on y lise
              deux sujets sans rapport. Mais collé sous la dernière ligne du
              tableau des automates, et coiffé du même fond creusé que sa ligne
              d'entêtes, le bandeau « Matériel » se lisait comme UNE LIGNE DE
              PLUS — la dérivation était devenue invisible à force d'être
              implicite.
              On rend donc le blanc, et on DIT le lien plutôt que de le faire
              porter par l'adjacence : le bloc Matériel se coiffe d'un filet à
              son signal (le vert du Magasin) et sa mention nomme sa source
              (« dérivé des 3 automates ci-dessus »). Un lien énoncé tient mieux
              qu'un lien deviné. */}
      <section className={cn("bloc", classeSignal("ai"))}>
        <EnteteBloc
          icone={Cpu}
          titre="Projet GTB"
          compteur={projets.length}
          mention="les automates de l'affaire"
          actions={ajouterAutomate}
        />

        {projets.length === 0 ? (
          <EtatVide
            dessin="automate"
            titre="Aucun automate"
            texte="Un Projet GTB porte un automate, ses modules et ses points. Créez le premier : il naîtra déjà rattaché à cette affaire."
            action={ajouterAutomate}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table table-cards">
              <thead>
                <tr>
                  <th>Automate</th>
                  <th>Contrôleur</th>
                  <th className="cell-num">E/S</th>
                  <th>Mise en service</th>
                  {/* « C'est fait ? » — la question qu'on se pose en
                      rouvrant une affaire, et à laquelle aucun compteur ne
                      répondait (voir lib/chantiers/arret.ts). */}
                  <th>Arrêt</th>
                  <th>Modifié</th>
                </tr>
              </thead>
              <tbody>
                {projets.map((p) => (
                  <tr key={p.id}>
                    <td className="cell-title cell-card-title cell-wrap">
                      <Link href={p.href} className="transition-colors hover:text-brand">
                        {p.nom}
                      </Link>
                    </td>
                    <td data-label="Contrôleur">{p.controller || "—"}</td>
                    <td data-label="E/S" className="cell-num">
                      {p.nbPoints}
                    </td>
                    <td data-label="Mise en service">
                      <Avancement tests={p.tests} />
                    </td>
                    <td data-label="Arrêt">
                      <BasculeArret
                        etat={p.etatArret}
                        arreteLe={p.arreteLe}
                        arretePar={p.arreteParNom}
                        referenceLe={p.updatedAt}
                        quoi={`L'automate « ${p.nom} »`}
                        basculer={async () => {
                          "use server";
                          await basculerArretProjet(p.id);
                        }}
                      />
                    </td>
                    <td data-label="Modifié">{fmtDate(p.updatedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <BlocMaterielAffaire
        chantierId={id}
        nbAutomates={projets.length}
        peutPrix={peutVoirPrix(session?.user?.role)}
      />

      {/* ---- Notes (documents riches de l'affaire) ------------------------- */}
      <section className={cn("bloc", classeSignal("ao"))}>
        <EnteteBloc
          icone={NotebookPen}
          titre="Notes"
          compteur={notes.length}
          mention="comptes rendus, brouillons"
          actions={ajouterNote}
        />

        {notes.length === 0 ? (
          <EtatVide
            dessin="carnet"
            titre="Aucune note"
            texte="Un document riche rattaché à l'affaire : compte rendu de réunion, relevé, mémo de mise en service."
            action={ajouterNote}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table table-cards">
              <thead>
                <tr>
                  <th>Note</th>
                  <th>Détail</th>
                  <th>Auteur</th>
                  <th>Modifiée</th>
                </tr>
              </thead>
              <tbody>
                {notes.map((n) => (
                  <tr key={n.id}>
                    <td className="cell-title cell-card-title cell-wrap">
                      <Link
                        href={`/outils/notes/${n.id}`}
                        className="inline-flex items-center gap-2 transition-colors hover:text-brand"
                      >
                        <span className="min-w-0 truncate">{n.titre}</span>
                        {n.partagee && (
                          <Globe
                            className="h-3.5 w-3.5 shrink-0 text-success"
                            aria-label="Partagée publiquement"
                          />
                        )}
                      </Link>
                    </td>
                    <td data-label="Détail" className="cell-wrap">
                      {n.resume}
                    </td>
                    <td data-label="Auteur">{n.auteur ?? "—"}</td>
                    <td data-label="Modifiée">{fmtDate(n.updatedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ---- Fichiers kDrive ----------------------------------------------- *
              Un seul bloc : l'en-tête (dépôt, lien vers l'outil), puis un bandeau
              par dossier. Auparavant chaque dossier avait son propre cadre, et
              la barre de dépôt flottait au-dessus sans cadre du tout. */}
      <DepotRapide chantierId={id} count={documents.length}>
        {parDossier.length === 0 ? (
          <EtatVide
            dessin="pochette"
            titre="Aucun fichier déposé"
            texte="Glissez un fichier ici via « Déposer un fichier » : il part sur kDrive dans le dossier de l'affaire, sans quitter cet écran."
          />
        ) : (
          parDossier.map((g, i) => (
            <div key={g.dossier}>
              <EnteteBloc
                titre={g.dossier}
                compteur={g.fichiers.length}
                className={cn(i > 0 && "border-t border-hairline")}
              />
              <table className="data-table table-cards">
                <tbody>
                  {g.fichiers.map((f: DocResume) => (
                    <tr key={f.id}>
                      <td className="cell-title cell-card-title cell-wrap">
                        {/* Le nom ouvre LE fichier (spool ou kDrive), pas la
                            page de dépôt — même route que la liste Documents. */}
                        <a
                          href={`/api/documents/${f.id}/download`}
                          target="_blank"
                          rel="noreferrer"
                          className="transition-colors hover:text-brand"
                        >
                          {f.nom}
                        </a>
                      </td>
                      <td data-label="Taille" className="cell-num">
                        {formatTaille(f.taille)}
                      </td>
                      <td data-label="kDrive">
                        <span
                          className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium ${STATUT_TON[f.statutSync]}`}
                        >
                          {STATUT_LABEL[f.statutSync]}
                        </span>
                      </td>
                      <td data-label="Auteur">{f.auteur ?? "—"}</td>
                      <td data-label="Déposé">{fmtDate(f.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))
        )}
      </DepotRapide>

      {/* ---- Scans (outil Scanner) — masqué si l'affaire n'en a aucun ----- */}
      {scans.length > 0 && (
        <ScansAffaire
          scans={scans}
          affaireNom={affaire.nom}
          hrefOutil={getTool("scan-modems")?.href ?? "/"}
        />
      )}

      {/* ---- Autres réalisations (agrégat des outils SANS section dédiée) -- */}
      {realisations.length > 0 && (
        <section className="bloc">
          <EnteteBloc
            icone={FileStack}
            titre="Autres réalisations"
            compteur={realisations.length}
            mention="visites et autres outils"
          />

          <div className="overflow-x-auto">
            <table className="data-table table-cards">
              <thead>
                <tr>
                  <th>Réalisation</th>
                  <th>Outil</th>
                  <th>N° Why</th>
                  <th>Détail</th>
                  <th>Modifié</th>
                </tr>
              </thead>
              <tbody>
                {realisations.map((r) => (
                  <tr key={`${r.toolId}:${r.id}`}>
                    <td className="cell-title cell-card-title cell-wrap">
                      {/* On emporte l'affaire : la fiche ouverte ramènera ici,
                          pas à l'index de son outil (voir lib/retour). */}
                      <Link
                        href={avecRetour(r.href, `/affaires/${id}`)}
                        className="transition-colors hover:text-brand"
                      >
                        {r.titre}
                      </Link>
                    </td>
                    <td data-label="Outil">
                      <span className="inline-flex items-center gap-1.5">
                        <Layers className="h-3 w-3 text-subtle" />
                        {r.toolNom}
                      </span>
                    </td>
                    <td data-label="N° Why">
                      {r.numeroWhy ? (
                        <span className="ref inline-flex items-center gap-1 rounded bg-surface-2 px-1.5 py-0.5 text-fg">
                          <Hash className="h-3 w-3 text-subtle" />
                          {r.numeroWhy}
                        </span>
                      ) : (
                        <span className="text-subtle">—</span>
                      )}
                    </td>
                    <td data-label="Détail" className="cell-wrap">
                      {r.resume}
                    </td>
                    <td data-label="Modifié">{fmtDate(r.updatedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
