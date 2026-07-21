import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ScanLine } from "lucide-react";
import { auth } from "@/auth";
import { getTool } from "@/tools/registry";
import { listerAffaires } from "@/lib/chantiers/queries";
import { listerScansModem } from "@/tools/modems/queries";
import { ScanModems } from "@/tools/modems/scan-modems";

export const metadata: Metadata = { title: "Scanner · ToolGus" };

export default async function Page({
  params,
}: {
  params: Promise<{ qui: string }>;
}) {
  const { qui } = await params;
  // Garde : la page n'existe que pour le propriétaire déclaré de l'outil.
  const tool = getTool("scan-modems");
  if (!tool || tool.proprietaire !== qui) notFound();

  const [scans, affairesToutes, session] = await Promise.all([
    listerScansModem(),
    listerAffaires(),
    auth(),
  ]);
  const affaires = affairesToutes
    .filter((a) => a.etat !== "CORBEILLE")
    .map((a) => ({
      id: a.id,
      nom: a.nom,
      numeroWhy: a.numeroWhy,
      clientNom: a.clientNom,
    }));

  return (
    <div className="mx-auto max-w-6xl px-6 py-8 md:px-10">
      <Link
        href={`/perso/${qui}`}
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted hover:text-fg"
      >
        <ArrowLeft className="h-4 w-4" /> ToolGus
      </Link>

      <header className="mb-6">
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-fg">
          <ScanLine className="h-6 w-6 text-subtle" />
          Scanner
        </h1>
        <p className="mt-1 text-muted">
          Vise n&apos;importe quel code (QR, code-barres) : il tombe dans le
          tableau, partagé et exportable. Si c&apos;est un modem Teltonika, ses
          infos matériel (série, IMEI, MAC, identifiants) sont extraites en plus.
        </p>
      </header>

      <ScanModems
        scansInitiaux={scans}
        affaires={affaires}
        moiNom={session?.user?.name ?? null}
      />
    </div>
  );
}
