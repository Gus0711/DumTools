import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Receipt } from "lucide-react";
import { periodeDe, totalCents } from "@/tools/notes-de-frais/model";
import {
  depensesDuMois,
  depensesEnAttente,
  historique,
} from "@/tools/notes-de-frais/queries";
import { AccueilNdf } from "@/tools/notes-de-frais/accueil-ndf";
import { garde } from "./garde";

export const metadata: Metadata = { title: "Notes de frais · ToolGus" };

export default async function Page({
  params,
}: {
  params: Promise<{ qui: string }>;
}) {
  const { qui } = await params;
  const { userId, profil } = await garde(qui);

  const periode = periodeDe(new Date());
  const [duMois, enAttente, mois] = await Promise.all([
    depensesDuMois(userId, periode),
    depensesEnAttente(userId),
    historique(userId, 12),
  ]);

  return (
    <div className="mx-auto max-w-3xl px-6 py-8 md:px-10">
      <Link
        href={`/perso/${qui}`}
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted hover:text-fg"
      >
        <ArrowLeft className="h-4 w-4" /> ToolGus
      </Link>

      <header className="mb-6">
        <h1 className="flex items-center gap-2.5 font-display text-2xl font-bold tracking-tight text-fg">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-brand-soft text-brand">
            <Receipt className="h-5 w-5" />
          </span>
          Notes de frais
        </h1>
        <p className="mt-2 text-muted">
          Photographie ton ticket au moment de payer. À la fin du mois, ta note
          est déjà écrite — il ne reste qu&apos;à télécharger l&apos;Excel et le
          PDF des justificatifs.
        </p>
      </header>

      {!profil ? (
        <div className="rounded-xl border border-dashed border-border bg-surface p-10 text-center">
          <p className="font-medium text-fg">
            Aucun profil de note de frais n&apos;est associé à ton compte.
          </p>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted">
            C&apos;est un réglage d&apos;administrateur : il détermine les
            rubriques que tu vois à la saisie et le modèle Excel produit
            (technicien, ou direction / responsable d&apos;affaires). Demande à
            un admin de te l&apos;attribuer dans la gestion des utilisateurs.
          </p>
        </div>
      ) : (
        <AccueilNdf
          qui={qui}
          periodeCourante={periode}
          totalMoisCents={totalCents(duMois)}
          nbMoisEnCours={duMois.length}
          enAttente={enAttente}
          historique={mois}
        />
      )}
    </div>
  );
}
