import { getMaterielAdmin } from "@/tools/affectation-es/catalogue-queries";
import { ConfigMateriel } from "@/tools/affectation-es/config-materiel";

export const metadata = { title: "Base matériel — Configuration" };

export default async function Page() {
  const materiel = await getMaterielAdmin();
  return <ConfigMateriel initial={materiel} />;
}
