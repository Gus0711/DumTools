import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Cpu, FileStack, FolderOpen, Globe, Hash, Layers, NotebookPen, Plus, TriangleAlert } from "lucide-react";
import { Button } from "@/ui";
import { auth } from "@/auth";
import { getAffaire, listerTaches } from "@/lib/chantiers/queries";
import { listerClients } from "@/lib/clients/queries";
import { listerUtilisateursActifs } from "@/lib/users/queries";
import { listerRealisationsAffaire } from "@/lib/chantiers/providers";
import { TOOLS_AFFAIRE } from "@/tools/registry";
import { calculerJalons } from "@/lib/chantiers/jalons";
import { FriseCycle } from "@/lib/chantiers/frise-cycle";
import { AffaireFicheHeader } from "@/lib/chantiers/affaire-fiche-header";
import { TachesKanban } from "@/lib/chantiers/taches-kanban";
import { DOSSIER_SCHEMA_ARMOIRE } from "@/lib/chantiers/armoire";
import { creerProjetPourAffaire } from "@/tools/affectation-es/actions";
import { listerProjetsAffaire, type AvancementTests } from "@/tools/affectation-es/queries";
import { listerDocuments, type DocResume } from "@/tools/documents/queries";
import { CATEGORIES, STATUT_LABEL, STATUT_TON, formatTaille } from "@/tools/documents/model";
import { DepotRapide } from "@/tools/documents/depot-rapide";
import { listerNotesAffaire } from "@/tools/notes/queries";
import { creerNotePourAffaire } from "@/tools/notes/actions";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const affaire = await getAffaire(id);
  return { title: affaire ? `Affaire · ${affaire.nom}` : "Affaire" };
}

function fmtDate(d: Date) {
  return new Date(d).toLocaleDateString("fr-FR");
}

/** Titre de section réutilisable (icône + libellé + pastille de compte). */
function SectionTitle({
  icon,
  children,
  count,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
  count: number;
}) {
  return (
    <h2 className="flex items-center gap-2 text-sm font-semibold text-fg">
      {icon}
      {children}
      <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs tabular-nums text-muted">
        {count}
      </span>
    </h2>
  );
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

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const affaire = await getAffaire(id);
  if (!affaire) notFound();

  const [projets, documents, notes, realisations, clients, taches, utilisateurs, session] =
    await Promise.all([
      listerProjetsAffaire(id),
      listerDocuments(id),
      listerNotesAffaire(id),
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

  return (
    <div className="mx-auto max-w-5xl space-y-10 px-6 py-8 md:px-10">
      <AffaireFicheHeader
        id={affaire.id}
        nom={affaire.nom}
        etat={affaire.etat}
        besoinArmoire={affaire.besoinArmoire}
        clientNom={affaire.clientNom}
        numeroWhy={affaire.numeroWhy}
        clients={clients.map((c) => c.nom)}
      />

      {/* ---- Avancement technique (frise des 7 étapes du cycle) ----------- */}
      <div className="-mt-4">
        <FriseCycle jalons={jalons} />
      </div>

      {/* ---- Alerte « schéma d'armoire manquant » : la frise dit l'état, ce
              bandeau dit quoi FAIRE. Rien quand tout va bien. --------------- */}
      {besoinNouvelleArmoire && !schemaArmoireOk && (
        <div className="-mt-6 flex items-center gap-2 rounded-lg border border-danger/45 bg-danger/10 px-4 py-2.5 text-sm text-danger">
          <TriangleAlert className="h-4 w-4 shrink-0" />
          <span>
            Nouvelle armoire à fabriquer — <strong>schéma d&apos;armoire manquant</strong> :
            déposez-le dans le dossier « {DOSSIER_SCHEMA_ARMOIRE} » des documents.
          </span>
        </div>
      )}

      {/* ---- Tâches (todo kanban de l'affaire) ----------------------------- */}
      <TachesKanban
        chantierId={id}
        taches={taches}
        utilisateurs={utilisateurs}
        moiId={session?.user?.id ?? null}
      />

      {/* ---- Projet GTB (automates de l'affaire) --------------------------- */}
      <section>
        <div className="mb-3 flex items-center justify-between gap-3">
          <SectionTitle icon={<Cpu className="h-4 w-4 text-muted" />} count={projets.length}>
            Projet GTB
          </SectionTitle>
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
        </div>

        {projets.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border bg-surface p-12 text-center text-muted">
            Aucun automate. Cliquez sur « Ajouter un automate » pour créer un
            Projet GTB rattaché à cette affaire.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border bg-surface">
            <table className="table-cards w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-subtle">
                  <th className="px-4 py-2.5 font-medium">Automate</th>
                  <th className="px-4 py-2.5 font-medium">Contrôleur</th>
                  <th className="px-4 py-2.5 font-medium">E/S</th>
                  <th className="px-4 py-2.5 font-medium">Mise en service</th>
                  <th className="px-4 py-2.5 font-medium">Modifié</th>
                </tr>
              </thead>
              <tbody>
                {projets.map((p) => (
                  <tr
                    key={p.id}
                    className="border-b border-border-soft last:border-0 hover:bg-surface-2"
                  >
                    <td className="cell-card-title px-4 py-2.5">
                      <Link href={p.href} className="font-medium text-fg hover:text-brand">
                        {p.nom}
                      </Link>
                    </td>
                    <td data-label="Contrôleur" className="px-4 py-2.5 text-muted">{p.controller || "—"}</td>
                    <td data-label="E/S" className="px-4 py-2.5 tabular-nums text-muted">{p.nbPoints}</td>
                    <td data-label="Mise en service" className="px-4 py-2.5">
                      <Avancement tests={p.tests} />
                    </td>
                    <td data-label="Modifié" className="px-4 py-2.5 text-muted">{fmtDate(p.updatedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ---- Notes (documents riches de l'affaire) ------------------------- */}
      <section>
        <div className="mb-3 flex items-center justify-between gap-3">
          <SectionTitle icon={<NotebookPen className="h-4 w-4 text-muted" />} count={notes.length}>
            Notes
          </SectionTitle>
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
        </div>

        {notes.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border bg-surface p-8 text-center text-muted">
            Aucune note. Cliquez sur « Nouvelle note » pour ouvrir un document
            rattaché à cette affaire.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border bg-surface">
            <table className="table-cards w-full border-collapse text-sm">
              <tbody>
                {notes.map((n) => (
                  <tr
                    key={n.id}
                    className="border-b border-border-soft last:border-0 hover:bg-surface-2"
                  >
                    <td className="cell-card-title px-4 py-2.5">
                      <Link
                        href={`/outils/notes/${n.id}`}
                        className="inline-flex items-center gap-2 font-medium text-fg hover:text-brand"
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
                    <td data-label="Détail" className="px-4 py-2.5 text-muted">{n.resume}</td>
                    <td data-label="Auteur" className="px-4 py-2.5 whitespace-nowrap text-muted">
                      {n.auteur ?? "—"}
                    </td>
                    <td data-label="Modifiée" className="px-4 py-2.5 whitespace-nowrap text-muted">
                      {fmtDate(n.updatedAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ---- Fichiers kDrive (sections par dossier) ------------------------ */}
      <section>
        <DepotRapide chantierId={id} count={documents.length} />

        {parDossier.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border bg-surface p-12 text-center text-muted">
            Aucun fichier déposé pour cette affaire. Cliquez sur « Déposer un
            fichier » pour en ajouter un sans quitter l&apos;affaire.
          </div>
        ) : (
          <div className="space-y-4">
            {parDossier.map((g) => (
              <div key={g.dossier} className="overflow-hidden rounded-lg border border-border bg-surface">
                <div className="flex items-center gap-2 border-b border-border bg-surface-2 px-4 py-2">
                  <FolderOpen className="h-4 w-4 text-brand" />
                  <span className="text-sm font-medium text-fg">{g.dossier}</span>
                  <span className="rounded-full bg-surface px-2 py-0.5 text-xs tabular-nums text-muted">
                    {g.fichiers.length}
                  </span>
                </div>
                <table className="table-cards w-full border-collapse text-sm">
                  <tbody>
                    {g.fichiers.map((f: DocResume) => (
                      <tr
                        key={f.id}
                        className="border-b border-border-soft last:border-0 hover:bg-surface-2"
                      >
                        <td className="cell-card-title px-4 py-2.5">
                          {/* Le nom ouvre LE fichier (spool ou kDrive), pas la
                              page de dépôt — même route que la liste Documents. */}
                          <a
                            href={`/api/documents/${f.id}/download`}
                            target="_blank"
                            rel="noreferrer"
                            className="font-medium text-fg hover:text-brand"
                          >
                            {f.nom}
                          </a>
                        </td>
                        <td data-label="Taille" className="px-4 py-2.5 whitespace-nowrap tabular-nums text-muted">
                          {formatTaille(f.taille)}
                        </td>
                        <td data-label="kDrive" className="px-4 py-2.5">
                          <span
                            className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium ${STATUT_TON[f.statutSync]}`}
                          >
                            {STATUT_LABEL[f.statutSync]}
                          </span>
                        </td>
                        <td data-label="Auteur" className="px-4 py-2.5 whitespace-nowrap text-muted">
                          {f.auteur ?? "—"}
                        </td>
                        <td data-label="Déposé" className="px-4 py-2.5 whitespace-nowrap text-muted">
                          {fmtDate(f.createdAt)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ---- Autres réalisations (agrégat des outils SANS section dédiée) -- */}
      {realisations.length > 0 && (
        <section>
          <div className="mb-3">
            <SectionTitle icon={<FileStack className="h-4 w-4 text-muted" />} count={realisations.length}>
              Autres réalisations
            </SectionTitle>
            <p className="mt-1 text-xs text-subtle">
              Ce qui est rattaché à l&apos;affaire par les autres outils (visites…) — les
              automates, notes et fichiers ont leur section ci-dessus.
            </p>
          </div>

          <div className="overflow-x-auto rounded-lg border border-border bg-surface">
            <table className="table-cards w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-subtle">
                  <th className="px-4 py-2.5 font-medium">Réalisation</th>
                  <th className="px-4 py-2.5 font-medium">Outil</th>
                  <th className="px-4 py-2.5 font-medium">N° Why</th>
                  <th className="px-4 py-2.5 font-medium">Détail</th>
                  <th className="px-4 py-2.5 font-medium">Modifié</th>
                </tr>
              </thead>
              <tbody>
                {realisations.map((r) => (
                  <tr
                    key={`${r.toolId}:${r.id}`}
                    className="border-b border-border-soft last:border-0 hover:bg-surface-2"
                  >
                    <td className="cell-card-title px-4 py-2.5">
                      <Link href={r.href} className="font-medium text-fg hover:text-brand">
                        {r.titre}
                      </Link>
                    </td>
                    <td data-label="Outil" className="px-4 py-2.5 text-muted">
                      <span className="inline-flex items-center gap-1">
                        <Layers className="h-3 w-3 text-subtle" />
                        {r.toolNom}
                      </span>
                    </td>
                    <td data-label="N° Why" className="px-4 py-2.5 text-muted">
                      {r.numeroWhy ? (
                        <span className="inline-flex items-center gap-1 rounded bg-surface-2 px-1.5 py-0.5 text-xs font-medium text-fg">
                          <Hash className="h-3 w-3 text-subtle" />
                          {r.numeroWhy}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td data-label="Détail" className="px-4 py-2.5 text-muted">{r.resume}</td>
                    <td data-label="Modifié" className="px-4 py-2.5 text-muted">{fmtDate(r.updatedAt)}</td>
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
