import {
  getCataloguePointsAdmin,
  getModelesAdmin,
} from "@/tools/liste-points/queries";
import { ConfigPoints } from "@/tools/liste-points/config-points";

export const metadata = { title: "Points & modèles — Configuration" };

export default async function Page() {
  const [catalogue, modeles] = await Promise.all([
    getCataloguePointsAdmin(),
    getModelesAdmin(),
  ]);
  return <ConfigPoints catalogue={catalogue} modeles={modeles} />;
}
