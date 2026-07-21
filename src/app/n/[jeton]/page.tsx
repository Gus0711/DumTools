import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getNotePublique } from "@/tools/notes/queries";
import { reecrireMediasPublics } from "@/tools/notes/model";
import { NoteLecture } from "@/tools/notes/lecture";

/* Page PUBLIQUE d'une note partagée — la seule route applicative servie SANS
 * session (exclue du matcher de src/proxy.ts, et l'app est exposée sur
 * internet via le tunnel Cloudflare). Règles de sûreté :
 *   - chargement par JETON uniquement (jamais par id) ;
 *   - lecture seule ;
 *   - médias servis par la route publique scopée au jeton ;
 *   - pas d'indexation par les moteurs de recherche. */

export async function generateMetadata({
  params,
}: {
  params: Promise<{ jeton: string }>;
}): Promise<Metadata> {
  const { jeton } = await params;
  const note = await getNotePublique(jeton);
  return {
    title: note ? note.titre : "Note introuvable",
    robots: { index: false, follow: false },
  };
}

export default async function Page({ params }: { params: Promise<{ jeton: string }> }) {
  const { jeton } = await params;
  const note = await getNotePublique(jeton);
  if (!note) notFound();

  const contenu = reecrireMediasPublics(note.contenu, jeton);

  return (
    <div className="min-h-screen bg-page">
      {/* Liseré laiton de signature, comme les en-têtes de documents internes. */}
      <div className="rule-accent h-0.5" aria-hidden />
      <header className="border-b border-border-soft bg-surface">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3 md:px-6">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-dumortier.png" alt="Dumortier — Groupe Fareneït" className="h-8 w-auto" />
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-fg">{note.clientNom}</div>
            <div className="text-xs text-muted">Note partagée en lecture seule</div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-6 md:px-6 md:py-10">
        <article className="rounded-xl border border-border bg-surface px-5 py-7 shadow-sm md:px-10 md:py-10">
          <h1 className="text-3xl font-bold tracking-tight text-fg md:text-4xl">{note.titre}</h1>
          <p className="mb-6 mt-2 border-b border-border-soft pb-5 text-xs text-subtle">
            Mise à jour le{" "}
            {note.updatedAt.toLocaleDateString("fr-FR", {
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
          </p>
          <NoteLecture contenu={contenu} />
        </article>
      </main>

      <footer className="mx-auto max-w-3xl px-4 pb-8 text-center text-xs text-subtle md:px-6">
        Document partagé en lecture seule via DumTools — Dumortier · Groupe Fareneït.
      </footer>
    </div>
  );
}
