import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { listerUtilisateurs } from "@/lib/users/queries";
import { ConfigUtilisateurs } from "@/lib/users/config-utilisateurs";

export const metadata = { title: "Utilisateurs — Configuration" };

export default async function Page() {
  const session = await auth();
  // Écran réservé aux administrateurs (le contrôle global n'exige qu'une session).
  if (session?.user?.role !== "ADMIN") redirect("/");

  const utilisateurs = await listerUtilisateurs();
  return (
    <ConfigUtilisateurs utilisateurs={utilisateurs} moiId={session.user.id} />
  );
}
