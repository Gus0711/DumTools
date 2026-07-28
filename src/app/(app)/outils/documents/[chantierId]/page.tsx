import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import {Briefcase} from "lucide-react";
import { getAffaire } from "@/lib/chantiers/queries";
import { EtatBadge } from "@/lib/chantiers/etat-badge";
import { listerDocuments } from "@/tools/documents/queries";
import { Depot } from "@/tools/documents/depot";
import { DocumentsListe } from "@/tools/documents/documents-liste";
import { MiroirKdrive } from "@/tools/documents/miroir-kdrive";
import { Cartouche } from "@/ui";

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
    <div className="mx-auto max-w-[1700px] px-4 py-5 md:px-7 md:py-7">
      {/* Retour à l'affaire : c'est d'elle qu'on vient (les documents sont
          toujours rattachés à une affaire). */}
      <Cartouche
        estampille="Documents"
        retour={{ href: `/affaires/${chantierId}`, label: affaire.nom }}
        titre={affaire.nom}
        sousTitre={affaire.clientNom}
        statut={<EtatBadge etat={affaire.etat} />}
        champs={[
          { label: "N° Why", valeur: affaire.numeroWhy, ref: true },
          { label: "Fichiers", valeur: docs.length, fort: true },
        ]}
        className="mb-6"
      />

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
