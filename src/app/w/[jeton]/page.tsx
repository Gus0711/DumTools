import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Clock } from "lucide-react";
import { getPagePublique } from "@/tools/wiki/queries";
import { reecrireMediasPublics } from "@/tools/wiki/model";
import { NoteLecture } from "@/tools/notes/lecture";
import { dateEcheance, libelleEcheance } from "@/lib/partage/model";

/* Page PUBLIQUE d'une page de wiki partagée TEMPORAIREMENT — servie SANS
 * session (exclue du matcher de src/proxy.ts, et l'app est exposée sur internet
 * via le tunnel Cloudflare). Mêmes règles de sûreté que /n/[jeton] :
 *   - chargement par JETON uniquement (jamais par id) ;
 *   - jeton échu = 404, indistinguable d'un jeton inexistant ;
 *   - lecture seule ;
 *   - médias servis par la route publique scopée au jeton ;
 *   - pas d'indexation par les moteurs de recherche.
 * Le wiki étant la base de connaissances INTERNE, la vue publique n'affiche ni
 * rubrique voisine, ni arborescence, ni recherche : une page, rien d'autre. */

export async function generateMetadata({
  params,
}: {
  params: Promise<{ jeton: string }>;
}): Promise<Metadata> {
  const { jeton } = await params;
  const page = await getPagePublique(jeton);
  return {
    title: page ? page.titre : "Page introuvable",
    robots: { index: false, follow: false },
  };
}

export default async function Page({ params }: { params: Promise<{ jeton: string }> }) {
  const { jeton } = await params;
  const page = await getPagePublique(jeton);
  if (!page) notFound();

  const contenu = reecrireMediasPublics(page.contenu, jeton);

  return (
    <div className="min-h-screen bg-page">
      {/* Liseré laiton de signature, comme les en-têtes de documents internes. */}
      <div className="rule-accent h-0.5" aria-hidden />
      <header className="border-b border-border-soft bg-surface">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3 md:px-6">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-dumortier.png" alt="Dumortier — Groupe Fareneït" className="h-8 w-auto" />
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-fg">{page.rubriqueNom}</div>
            <div className="text-xs text-muted">Page partagée en lecture seule</div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-6 md:px-6 md:py-10">
        <article className="border border-hairline bg-surface px-5 py-7 shadow-sm md:px-10 md:py-10">
          <h1 className="text-3xl font-bold tracking-tight text-fg md:text-4xl">{page.titre}</h1>
          {page.resume && <p className="mt-2 text-base text-muted">{page.resume}</p>}
          <p className="mb-6 mt-2 border-b border-border-soft pb-5 text-xs text-subtle">
            Mise à jour le{" "}
            {page.updatedAt.toLocaleDateString("fr-FR", {
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
          </p>
          <NoteLecture contenu={contenu} />
        </article>

        {/* L'échéance est annoncée au lecteur : le lien va cesser de marcher,
            autant qu'il le sache avant de le mettre en favori. */}
        {page.partageExpireLe && (
          <p
            className="mt-4 flex items-center justify-center gap-1.5 text-xs text-subtle"
            title={dateEcheance(page.partageExpireLe)}
          >
            <Clock className="h-3.5 w-3.5" />
            Lien temporaire — {libelleEcheance(page.partageExpireLe).toLowerCase()}
          </p>
        )}
      </main>

      <footer className="mx-auto max-w-3xl px-4 pb-8 text-center text-xs text-subtle md:px-6">
        Document partagé en lecture seule via DumTools — Dumortier · Groupe Fareneït.
      </footer>
    </div>
  );
}
