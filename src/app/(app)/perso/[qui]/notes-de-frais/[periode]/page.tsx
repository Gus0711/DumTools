import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { periodeValide, titrePeriode } from "@/tools/notes-de-frais/model";
import {
  depensesDuMois,
  depensesEnAttente,
  etatDuMois,
} from "@/tools/notes-de-frais/queries";
import { NoteMois } from "@/tools/notes-de-frais/note-mois";
import { gardeAvecProfil } from "../garde";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ periode: string }>;
}): Promise<Metadata> {
  const { periode } = await params;
  return {
    title: periodeValide(periode)
      ? `${titrePeriode(periode)} · Notes de frais`
      : "Notes de frais",
  };
}

export default async function Page({
  params,
}: {
  params: Promise<{ qui: string; periode: string }>;
}) {
  const { qui, periode } = await params;
  if (!periodeValide(periode)) notFound();
  const { userId, profil } = await gardeAvecProfil(qui);

  const [depenses, etat, enAttente] = await Promise.all([
    depensesDuMois(userId, periode),
    etatDuMois(userId, periode),
    depensesEnAttente(userId),
  ]);

  return (
    <div className="mx-auto max-w-5xl px-6 py-8 md:px-10">
      <Link
        href={`/perso/${qui}/notes-de-frais`}
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted hover:text-fg"
      >
        <ArrowLeft className="h-4 w-4" /> Mes notes de frais
      </Link>

      <NoteMois
        qui={qui}
        periode={periode}
        profil={profil}
        depenses={depenses}
        transmiseLeInitial={etat.transmiseLe?.toISOString() ?? null}
        nbEnAttente={enAttente.length}
      />
    </div>
  );
}
