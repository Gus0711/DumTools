import { redirect } from "next/navigation";

/**
 * L'index « Documents » n'existe plus : ce n'était qu'une liste d'affaires,
 * doublon strict de /affaires. Les documents se déposent depuis la fiche de
 * l'affaire (section « Fichiers kDrive ») ou sur /outils/documents/[affaire].
 * On garde une redirection plutôt qu'un 404 pour les liens déjà partagés.
 */
export default function Page() {
  redirect("/affaires");
}
