import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ScanLine } from "lucide-react";
import { auth } from "@/auth";
import { Cartouche } from "@/ui";
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
    <div className="mx-auto max-w-[1700px] px-4 py-5 md:px-7 md:py-7">
      <Cartouche
        estampille="ToolGus · Espace perso"
        retour={{ href: `/perso/${qui}`, label: "ToolGus" }}
        titre={
          <span className="flex items-center gap-2.5">
            <ScanLine className="h-6 w-6 text-accent" />
            Scanner
          </span>
        }
        titreTexte="Scanner"
        description="Visez n’importe quel code (QR, code-barres) : il tombe dans le tableau, partagé et exportable. Si c’est un modem Teltonika, ses infos matériel (série, IMEI, MAC, identifiants) sont extraites en plus."
        champs={[{ label: "Scans enregistrés", valeur: scans.length, fort: true }]}
        className="mb-6"
      />

      <ScanModems
        scansInitiaux={scans}
        affaires={affaires}
        moiNom={session?.user?.name ?? null}
      />
    </div>
  );
}
