import { auth } from "@/auth";
import { getCataloguePointsAdmin, getModelesAdmin } from "@/tools/liste-points/queries";
import { ConfigPoints } from "@/tools/liste-points/config-points";
import { peutGererReferentiel } from "@/tools/magasin/model";
import { listerNomenclatures, listerRayon } from "@/tools/magasin/queries";

export const metadata = { title: "Points & modèles — Configuration" };

export default async function Page() {
  const session = await auth();
  // Le matériel qu'un point appelle se règle ICI aussi : le nom, le type et le
  // matériel sont trois faces du même objet, les séparer sur deux écrans oblige
  // à savoir lequel porte quoi.
  const [catalogue, modeles, nomenclatures, rayon] = await Promise.all([
    getCataloguePointsAdmin(),
    getModelesAdmin(),
    listerNomenclatures(),
    listerRayon(),
  ]);

  return (
    <ConfigPoints
      catalogue={catalogue}
      modeles={modeles}
      nomenclatures={nomenclatures}
      produits={rayon.map((l) => ({
        id: l.id,
        refInterne: l.refInterne,
        refFabricant: l.refFabricant,
        designation: l.designation,
        unite: l.unite,
        serialisable: l.serialisable,
        stock: l.stock,
        dernierPrixCents: l.dernierPrixCents,
      }))}
      peutGererMateriel={peutGererReferentiel(session?.user?.role)}
    />
  );
}
