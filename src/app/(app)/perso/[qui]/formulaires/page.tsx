import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {ClipboardList} from "lucide-react";
import { auth } from "@/auth";
import { getTool } from "@/tools/registry";
import { listerFormulaires } from "@/tools/formulaires/queries";
import { IndexFormulaires } from "@/tools/formulaires/index-formulaires";
import { Cartouche } from "@/ui";

export const metadata: Metadata = { title: "Formulaires · ToolGus" };

export default async function Page({
  params,
}: {
  params: Promise<{ qui: string }>;
}) {
  const { qui } = await params;
  // Garde : la page n'existe que pour le propriétaire déclaré de l'outil.
  const tool = getTool("formulaires");
  if (!tool || tool.proprietaire !== qui) notFound();

  // Rôle : les admins construisent/éditent ; les membres remplissent les
  // formulaires publiés et consultent leurs propres réponses.
  const session = await auth();
  const isAdmin = session?.user?.role === "ADMIN";
  const membreId = isAdmin ? undefined : session?.user?.id;
  const formulaires = await listerFormulaires(
    qui,
    membreId ? { membreId } : undefined,
  );

  return (
    <div className="mx-auto max-w-[1700px] px-4 py-5 md:px-7 md:py-7">
      <Cartouche
        estampille="ToolGus · Espace perso"
        retour={{ href: `/perso/${qui}`, label: "ToolGus" }}
        titre={
          <span className="flex items-center gap-2.5">
            <ClipboardList className="h-6 w-6 text-accent" />
            Formulaires
          </span>
        }
        titreTexte="Formulaires"
        description={
          isAdmin
            ? "Construis tes propres formulaires : dépose tes champs, publie, puis remplis-les sur le terrain — hors-ligne, avec photos, signature, scan et calculs. Les réponses reviennent ici."
            : "Remplis les formulaires mis à disposition — hors-ligne, avec photos, signature et scan — et retrouve tes réponses à tout moment."
        }
        champs={[{ label: "Formulaires", valeur: formulaires.length, fort: true }]}
        className="mb-6"
      />

      <IndexFormulaires
        qui={qui}
        formulairesInitiaux={formulaires}
        estAdmin={isAdmin}
      />
    </div>
  );
}
