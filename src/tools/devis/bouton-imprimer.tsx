"use client";

import { Printer } from "lucide-react";

/** « Imprimer » sur l'aperçu interne. Un îlot client minuscule (un `onClick`),
 *  distinct de celui de la page publique : la barre du lecteur note en plus une
 *  consultation, ce qu'un aperçu interne ne doit surtout pas faire. */
export function BoutonImprimer() {
  return (
    <button type="button" className="principal" onClick={() => window.print()}>
      <Printer className="h-4 w-4" /> Imprimer / PDF
    </button>
  );
}
