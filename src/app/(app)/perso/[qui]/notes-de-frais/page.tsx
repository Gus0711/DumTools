import type { Metadata } from "next";
import {Receipt} from "lucide-react";
import { periodeDe, totalCents } from "@/tools/notes-de-frais/model";
import {
  depensesDuMois,
  depensesEnAttente,
  historique,
} from "@/tools/notes-de-frais/queries";
import { AccueilNdf } from "@/tools/notes-de-frais/accueil-ndf";
import { garde } from "./garde";
import { Cartouche } from "@/ui";

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
    <div className="mx-auto max-w-3xl px-4 py-5 md:px-7 md:py-7">
      <Cartouche
        estampille="ToolGus · Espace perso"
        retour={{ href: `/perso/${qui}`, label: "ToolGus" }}
        titre={
          <span className="flex items-center gap-2.5">
            <Receipt className="h-6 w-6 text-accent" />
            Notes de frais
          </span>
        }
        titreTexte="Notes de frais"
        description="Photographie ton ticket au moment de payer. À la fin du mois, ta note est déjà écrite — il ne reste qu’à télécharger l’Excel et le PDF des justificatifs."
        className="mb-6"
      />

      {!profil ? (
        <div className="border border-dashed border-border bg-surface p-10 text-center">
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
