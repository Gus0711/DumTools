import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Briefcase, Hash } from "lucide-react";
import { getAffaire } from "@/lib/chantiers/queries";
import { EtatBadge } from "@/lib/chantiers/etat-badge";
import { listerDocuments } from "@/tools/documents/queries";
import { Depot } from "@/tools/documents/depot";
import { DocumentsListe } from "@/tools/documents/documents-liste";
import { MiroirKdrive } from "@/tools/documents/miroir-kdrive";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ chantierId: string }>;
}): Promise<Metadata> {
  const { chantierId } = await params;
  const affaire = await getAffaire(chantierId);
  return { title: affaire ? `Documents · ${affaire.nom}` : "Documents" };
}

export default async function Page({
  params,
}: {
  params: Promise<{ chantierId: string }>;
}) {
  const { chantierId } = await params;
  const affaire = await getAffaire(chantierId);
  if (!affaire) notFound();

  const docs = await listerDocuments(chantierId);

  return (
    <div className="mx-auto max-w-4xl px-6 py-8 md:px-10">
      {/* Retour à l'affaire : c'est d'elle qu'on vient (les documents sont
          toujours rattachés à une affaire). */}
      <Link
        href={`/affaires/${chantierId}`}
        className="group mb-4 inline-flex min-w-0 items-center gap-1.5 text-sm text-muted hover:text-fg"
      >
        <ArrowLeft className="h-4 w-4 shrink-0 transition-transform group-hover:-translate-x-0.5" />
        <Briefcase className="h-3.5 w-3.5 shrink-0" />
        <span className="min-w-0 truncate">{affaire.nom}</span>
      </Link>

      <header className="mb-6">
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-fg">
          <Briefcase className="h-6 w-6 text-subtle" />
          {affaire.nom}
        </h1>
        <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-muted">
          <span>{affaire.clientNom}</span>
          {affaire.numeroWhy && (
            <span className="inline-flex items-center gap-1 rounded bg-surface-2 px-1.5 py-0.5 text-xs font-medium text-fg">
              <Hash className="h-3 w-3 text-subtle" />
              {affaire.numeroWhy}
            </span>
          )}
          <EtatBadge etat={affaire.etat} />
        </div>
      </header>

      <section className="mb-8">
        <Depot chantierId={chantierId} />
      </section>

      <section>
        <DocumentsListe chantierId={chantierId} docs={docs} />
        <Suspense
          fallback={
            <p className="mt-10 text-sm text-muted">Lecture du dossier kDrive…</p>
          }
        >
          <MiroirKdrive chantierId={chantierId} />
        </Suspense>
      </section>
    </div>
  );
}
