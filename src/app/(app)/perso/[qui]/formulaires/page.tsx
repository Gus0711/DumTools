import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ClipboardList } from "lucide-react";
import { auth } from "@/auth";
import { getTool } from "@/tools/registry";
import { listerFormulaires } from "@/tools/formulaires/queries";
import { IndexFormulaires } from "@/tools/formulaires/index-formulaires";

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
    <div className="mx-auto max-w-5xl px-6 py-8 md:px-10">
      <Link
        href={`/perso/${qui}`}
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted hover:text-fg"
      >
        <ArrowLeft className="h-4 w-4" /> ToolGus
      </Link>

      <header className="mb-6">
        <h1 className="flex items-center gap-2.5 font-display text-2xl font-bold tracking-tight text-fg">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-brand-soft text-brand">
            <ClipboardList className="h-5 w-5" />
          </span>
          Formulaires
        </h1>
        <p className="mt-2 max-w-2xl text-muted">
          {isAdmin
            ? "Construis tes propres formulaires (façon Kizeo) : dépose tes champs, publie, puis remplis-les sur le terrain — hors-ligne, avec photos, signature, scan et calculs. Les réponses reviennent ici."
            : "Remplis les formulaires mis à disposition — hors-ligne, avec photos, signature et scan — et retrouve tes réponses à tout moment."}
        </p>
      </header>

      <IndexFormulaires
        qui={qui}
        formulairesInitiaux={formulaires}
        estAdmin={isAdmin}
      />
    </div>
  );
}
