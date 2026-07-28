import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import {ListChecks, Pencil} from "lucide-react";
import { auth } from "@/auth";
import { getTool } from "@/tools/registry";
import {
  getFormulaire,
  listerReponsesMatrice,
} from "@/tools/formulaires/queries";
import { IndexReponses } from "@/tools/formulaires/index-reponses";
import { Cartouche } from "@/ui";

export const metadata: Metadata = { title: "Réponses · ToolGus" };

export default async function Page({
  params,
}: {
  params: Promise<{ qui: string; id: string }>;
}) {
  const { qui, id } = await params;
  const tool = getTool("formulaires");
  if (!tool || tool.proprietaire !== qui) notFound();

  const formulaire = await getFormulaire(id);
  if (!formulaire) notFound();

  const session = await auth();
  const isAdmin = session?.user?.role === "ADMIN";
  const membreId = isAdmin ? undefined : session?.user?.id;
  // Un membre ne peut voir les réponses que d'un formulaire publié.
  if (!isAdmin && !formulaire.publie) notFound();

  const reponses = await listerReponsesMatrice(
    id,
    membreId ? { membreId } : undefined,
  );

  return (
    <div className="mx-auto max-w-[1700px] px-4 py-5 md:px-7 md:py-7">
      <Cartouche
        estampille={isAdmin ? "Formulaire · Réponses" : "Mes réponses"}
        retour={{ href: `/perso/${qui}/formulaires`, label: "Mes formulaires" }}
        titre={isAdmin ? formulaire.nom : `Mes réponses — ${formulaire.nom}`}
        description={
          isAdmin
            ? `${reponses.length} réponse${reponses.length > 1 ? "s" : ""} collectée${reponses.length > 1 ? "s" : ""}.`
            : `${reponses.length} réponse${reponses.length > 1 ? "s" : ""} à ton nom.`
        }
        champs={[{ label: "Réponses", valeur: reponses.length, fort: true }]}
        actions={
          <>
          {isAdmin && (
            <Link
              href={`/perso/${qui}/formulaires/${id}/edit`}
              className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border bg-surface px-3 text-sm font-medium text-fg hover:bg-surface-2"
            >
              <Pencil className="h-3.5 w-3.5" /> Éditer
            </Link>
          )}
          <Link
            href={`/perso/${qui}/formulaires/${id}/terrain`}
            className="inline-flex h-9 items-center gap-1.5 rounded-md bg-brand px-3 text-sm font-medium text-brand-fg shadow-sm hover:bg-brand-strong"
          >
            <ListChecks className="h-3.5 w-3.5" /> Remplir
          </Link>
          </>
        }
        className="mb-6"
      />

      <IndexReponses
        qui={qui}
        formulaireId={id}
        formulaireNom={formulaire.nom}
        schema={formulaire.schema}
        reponsesInitiales={reponses}
        estAdmin={isAdmin}
      />
    </div>
  );
}
