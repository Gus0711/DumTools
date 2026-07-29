import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { Cartouche } from "@/ui";
import { fmtDateHeure } from "@/lib/dates";
import { ImportMagasin } from "@/tools/magasin/import-magasin";
import { peutGererReferentiel } from "@/tools/magasin/model";
import { listerImports } from "@/tools/magasin/queries";
import { GENRE_LABEL, type GenreImport } from "@/tools/magasin/import-model";

export const metadata: Metadata = { title: "Import — Magasin" };

export default async function Page() {
  const session = await auth();
  if (!peutGererReferentiel(session?.user?.role)) redirect("/outils/magasin");

  const journal = await listerImports(10);

  return (
    <div className="mx-auto max-w-5xl px-4 py-5 md:px-7 md:py-7">
      <Cartouche
        estampille="Magasin"
        titre="Importer"
        retour={{ href: "/outils/magasin", label: "Le rayon" }}
        description="Reprendre un fichier existant plutôt que de saisir : le référentiel produit, le stock en place, ou des tarifs fournisseurs. Rien n'est écrit avant l'aperçu."
        className="mb-6"
      />

      <ImportMagasin />

      {journal.length > 0 && (
        <section className="mt-8">
          <h2 className="stamp mb-2">Imports précédents</h2>
          <div className="data-card overflow-x-auto">
            <table className="data-table table-cards">
              <thead>
                <tr>
                  <th>Quand</th>
                  <th>Quoi</th>
                  <th>Fichier</th>
                  <th className="text-right">Créées</th>
                  <th className="text-right">Mises à jour</th>
                  <th className="text-right">Rejetées</th>
                  <th>Par</th>
                </tr>
              </thead>
              <tbody>
                {journal.map((i) => (
                  <tr key={i.id}>
                    <td className="cell-card-title whitespace-nowrap">
                      {fmtDateHeure(i.createdAt)}
                    </td>
                    <td data-label="Quoi">
                      {GENRE_LABEL[i.genre as GenreImport] ?? i.genre}
                    </td>
                    <td data-label="Fichier" className="ref">
                      {i.nomFichier || "—"}
                    </td>
                    <td data-label="Créées" className="text-right tabular-nums">
                      {i.nbCreees}
                    </td>
                    <td data-label="Mises à jour" className="text-right tabular-nums">
                      {i.nbMajs}
                    </td>
                    <td data-label="Rejetées" className="text-right tabular-nums">
                      {i.nbRejetees > 0 ? (
                        <span className="text-danger">{i.nbRejetees}</span>
                      ) : (
                        0
                      )}
                    </td>
                    <td data-label="Par" className="text-muted">
                      {i.par ?? "—"}
                    </td>
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
