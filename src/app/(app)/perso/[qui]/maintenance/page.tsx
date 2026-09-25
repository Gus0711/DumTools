import type { Metadata } from "next";
import Link from "next/link";
import { LifeBuoy, MapPinned, Plus } from "lucide-react";
import { Cartouche } from "@/ui";
import { listerContrats } from "@/tools/maintenance/queries";
import { statsContrats } from "@/tools/maintenance/model";
import { IndexMaintenance } from "@/tools/maintenance/index-maintenance";
import { garde } from "./garde";

export const metadata: Metadata = { title: "Maintenance · ToolGus" };

export default async function Page({
  params,
}: {
  params: Promise<{ qui: string }>;
}) {
  const { qui } = await params;
  await garde(qui);

  const contrats = await listerContrats();

  return (
    <div className="signal-com mx-auto max-w-[1700px] px-4 py-5 md:px-7 md:py-7">
      <Cartouche
        estampille="ToolGus · Espace perso"
        retour={{ href: `/perso/${qui}`, label: "ToolGus" }}
        titre={
          <span className="flex items-center gap-2.5">
            <LifeBuoy className="text-signal h-6 w-6" />
            Maintenance
          </span>
        }
        titreTexte="Maintenance"
        description="Les contrats : quels sites, quelles heures incluses, ce qui a été consommé depuis la date anniversaire — et ce qui dépasse, donc se refacture."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={`/perso/${qui}/maintenance/sites`}
              className="press inline-flex h-[var(--control-h)] items-center gap-2 rounded-md border border-border bg-surface px-4 text-sm font-medium text-fg transition-[background-color,border-color] duration-150 hover:border-brand/45 hover:bg-surface-2"
            >
              <MapPinned className="h-4 w-4" /> Sites
            </Link>
            <Link
              href={`/perso/${qui}/maintenance/nouveau`}
              className="press inline-flex h-[var(--control-h)] items-center gap-2 rounded-md bg-brand px-4 text-sm font-medium text-brand-fg transition-colors duration-150 hover:bg-brand-strong"
            >
              <Plus className="h-4 w-4" /> Nouveau contrat
            </Link>
          </div>
        }
        className="mb-6"
      />

      <IndexMaintenance
        qui={qui}
        contrats={contrats}
        stats={statsContrats(contrats)}
      />
    </div>
  );
}
