import type { Metadata } from "next";
import Link from "next/link";
import { ClipboardList, FileText, FileUp, PackageSearch, ScanLine, Tags, Truck } from "lucide-react";
import { auth } from "@/auth";
import { Cartouche } from "@/ui";
import { listerAffaires } from "@/lib/chantiers/queries";
import { Rayon } from "@/tools/magasin/rayon";
import { peutGererReferentiel, peutVoirPrix } from "@/tools/magasin/model";
import {
  listerCategories,
  listerDepots,
  listerFabricants,
  listerFournisseurs,
  listerRayon,
  statsMagasin,
} from "@/tools/magasin/queries";

export const metadata: Metadata = { title: "Magasin" };

const lienSecondaire =
  "press inline-flex items-center gap-2 rounded-md border border-border bg-surface px-3.5 py-2 text-sm font-medium text-fg transition-colors hover:bg-surface-2";

export default async function Page() {
  const session = await auth();
  const role = session?.user?.role;

  const [lignes, depots, affaires, fournisseurs, fabricants, categories] = await Promise.all([
    listerRayon({ avecArchives: true }),
    listerDepots(),
    listerAffaires(),
    listerFournisseurs(),
    listerFabricants(),
    listerCategories(),
  ]);
  // Les archivés sont chargés pour pouvoir les retrouver d'un clic, mais ils ne
  // comptent NI dans le nombre de références, NI dans la valeur du stock, NI
  // dans les alertes de seuil : ce sont des produits qu'on n'achète plus.
  const stats = await statsMagasin(lignes.filter((l) => l.actif));

  return (
    <div className="mx-auto max-w-[1700px] px-4 py-5 md:px-7 md:py-7">
      <Cartouche
        estampille="Magasin"
        titre="Le rayon"
        description="Ce qu'on a, ce qui est réservé, ce qui est sorti. Le stock n'est jamais saisi : il est la somme des mouvements — réceptions, sorties, retours, écarts d'inventaire."
        actions={
          <>
            <Link href="/outils/magasin/scan" className={lienSecondaire}>
              <ScanLine className="h-4 w-4" />
              Scanner
            </Link>
            <Link href="/outils/magasin/inventaires" className={lienSecondaire}>
              <ClipboardList className="h-4 w-4" />
              Inventaires
            </Link>
            {/* Ouvert à tous, comme la fiche matériel d'une affaire : préparer
                une commande n'est pas un geste d'Achats, c'est le chargé
                d'affaire qui sait ce qu'il lance. Les prix, eux, restent gardés. */}
            <Link href="/outils/magasin/besoins" className={lienSecondaire}>
              <PackageSearch className="h-4 w-4" />
              Besoin consolidé
            </Link>
            {/* En lecture pour TOUT LE MONDE : c'est le technicien en armoire
                qui cherche une notice, pas l'acheteur. */}
            <Link href="/outils/magasin/documentation" className={lienSecondaire}>
              <FileText className="h-4 w-4" />
              Documentation
            </Link>
            {peutGererReferentiel(role) && (
              <>
                {/* La nomenclature n'était liée de NULLE PART : l'écran existait,
                    on ne pouvait y arriver qu'en tapant l'URL. C'est pourtant
                    lui qui décide de tout le chiffrage dérivé des affaires. */}
                <Link href="/outils/magasin/nomenclature" className={lienSecondaire}>
                  <Tags className="h-4 w-4" />
                  Nomenclature
                </Link>
                <Link href="/outils/magasin/fournisseurs" className={lienSecondaire}>
                  <Truck className="h-4 w-4" />
                  Référentiels
                </Link>
                <Link href="/outils/magasin/import" className={lienSecondaire}>
                  <FileUp className="h-4 w-4" />
                  Importer
                </Link>
              </>
            )}
          </>
        }
        className="mb-6"
      />

      <Rayon
        lignes={lignes}
        stats={stats}
        depots={depots}
        affaires={affaires
          .filter((a) => a.etat !== "CORBEILLE")
          .map((a) => ({
            id: a.id,
            nom: a.nom,
            clientNom: a.clientNom,
            numeroWhy: a.numeroWhy,
          }))}
        fournisseurs={fournisseurs}
        fabricants={fabricants}
        categories={categories}
        peutPrix={peutVoirPrix(role)}
        peutGerer={peutGererReferentiel(role)}
      />
    </div>
  );
}
