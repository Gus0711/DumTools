"use client";

import { useEffect, useRef } from "react";
import "./document-devis.css";

/* La barre du lecteur — le SEUL îlot client de la page publique d'un devis.
 *
 * Elle fait deux choses, et rien d'autre :
 *   1. « Imprimer / Enregistrer en PDF » — `window.print()`, donc un bouton ;
 *   2. elle signale l'ouverture du document (journal de consultation).
 *
 * Pourquoi la consultation est notée ICI, côté navigateur, et pas pendant le
 * rendu de la page : un aspirateur de liens ne fait pas tourner de JavaScript.
 * L'aperçu de messagerie du client, l'antivirus de sa boîte mail et le
 * pré-chargement de son navigateur ouvriraient tous la page — et la seule
 * question qu'on se pose (« l'a-t-il regardé ? ») recevrait toujours oui.
 */

export function BarreLecteur({ jeton, numero }: { jeton: string; numero: string }) {
  const signale = useRef(false);

  useEffect(() => {
    // Le mode strict de React monte deux fois en développement : sans ce garde,
    // chaque ouverture compterait double.
    if (signale.current) return;
    signale.current = true;
    // `keepalive` : la balise survit à une navigation immédiate (le client qui
    // clique « télécharger » dans la seconde).
    void fetch(`/api/public/devis/${jeton}/vu`, { method: "POST", keepalive: true }).catch(
      () => {},
    );
  }, [jeton]);

  return (
    <div className="devis-lecteur">
      <span className="titre">Devis {numero}</span>
      <button type="button" onClick={() => window.print()}>
        Imprimer
      </button>
      {/* Un lien, pas un bouton : le téléchargement n'a besoin d'aucun script. */}
      <a className="principal" href={`/api/public/devis/${jeton}/pdf`}>
        Télécharger le PDF
      </a>
    </div>
  );
}
