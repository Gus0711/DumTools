import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import {
  affairesPourSaisie,
  descriptifsRecents,
} from "@/tools/notes-de-frais/queries";
import { SaisieDepense } from "@/tools/notes-de-frais/saisie-depense";
import { gardeAvecProfil } from "../garde";

export const metadata: Metadata = { title: "Nouvelle dépense · Notes de frais" };

export default async function Page({
  params,
}: {
  params: Promise<{ qui: string }>;
}) {
  const { qui } = await params;
  const { userId, profil } = await gardeAvecProfil(qui);

  const [affaires, recents] = await Promise.all([
    affairesPourSaisie(),
    descriptifsRecents(userId),
  ]);

  return (
    <div className="mx-auto max-w-3xl px-6 py-8 md:px-10">
      <Link
        href={`/perso/${qui}/notes-de-frais`}
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted hover:text-fg"
      >
        <ArrowLeft className="h-4 w-4" /> Mes notes de frais
      </Link>

      <h1 className="mb-6 font-display text-2xl font-bold tracking-tight text-fg">
        Nouvelle dépense
      </h1>

      <SaisieDepense
        qui={qui}
        profil={profil}
        affaires={affaires}
        descriptifsRecents={recents}
      />
    </div>
  );
}
