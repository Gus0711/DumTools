import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import {
  affairesPourSaisie,
  depense as chargerDepense,
  descriptifsRecents,
} from "@/tools/notes-de-frais/queries";
import { SaisieDepense } from "@/tools/notes-de-frais/saisie-depense";
import { gardeAvecProfil } from "../../garde";
import { TitreEcran } from "@/components/app-shell/contexte-ecran";

export const metadata: Metadata = { title: "Modifier une dépense · Notes de frais" };

export default async function Page({
  params,
}: {
  params: Promise<{ qui: string; id: string }>;
}) {
  const { qui, id } = await params;
  const { userId, profil } = await gardeAvecProfil(qui);

  // `chargerDepense` filtre sur le propriétaire : une dépense d'autrui est
  // indiscernable d'une dépense inexistante.
  const [d, affaires, recents] = await Promise.all([
    chargerDepense(userId, id),
    affairesPourSaisie(),
    descriptifsRecents(userId),
  ]);
  if (!d) notFound();

  return (
    <div className="mx-auto max-w-3xl px-6 py-8 md:px-10">
      <TitreEcran estampille="Notes de frais" titre={"Modifier une dépense"} />
      <Link
        href={`/perso/${qui}/notes-de-frais`}
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted hover:text-fg"
      >
        <ArrowLeft className="h-4 w-4" /> Mes notes de frais
      </Link>

      <h1 className="mb-6 font-display text-2xl font-bold tracking-tight text-fg">
        Modifier la dépense
      </h1>

      <SaisieDepense
        qui={qui}
        profil={profil}
        affaires={affaires}
        depense={d}
        descriptifsRecents={recents}
      />
    </div>
  );
}
