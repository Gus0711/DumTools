import { cn } from "@/lib/cn";
import type { EtatJalon, Jalon } from "./jalons";

/* =============================================================================
 * LE SYNOPTIQUE D'AVANCEMENT
 * Le cycle d'une affaire (docs/ROADMAP.md §3) lu comme un schéma de principe :
 * 7 voyants reliés par une piste. La piste est alimentée tant que le courant
 * passe, pointillée au-delà — on voit jusqu'où l'affaire est allée sans avoir
 * à compter les cases.
 *
 * L'état vient des artefacts réellement produits (voir jalons.ts) : rien n'est
 * cliquable ni cochable, c'est un miroir. Et la couleur ne dit rien toute
 * seule : chaque voyant porte son libellé, son détail en clair, et son état
 * pour les lecteurs d'écran.
 * ========================================================================== */

const TON: Record<EtatJalon, { led: string; libelle: string; etatLu: string }> = {
  fait: { led: "led-on", libelle: "text-fg", etatLu: "terminé" },
  encours: { led: "led-cur", libelle: "text-fg", etatLu: "en cours" },
  attente: { led: "", libelle: "text-muted", etatLu: "en attente" },
  sansobjet: { led: "led-na", libelle: "text-subtle", etatLu: "sans objet" },
};

/** Un jalon « sous tension » : le courant y est passé, ou y passe. */
function alimente(j: Jalon) {
  return j.etat === "fait" || j.etat === "encours";
}

export function FriseCycle({ jalons }: { jalons: Jalon[] }) {
  // Jusqu'où le courant va : le dernier jalon alimenté. Au-delà, la piste reste
  // pointillée même si un jalon isolé plus loin est déjà fait — c'est une
  // progression qu'on lit, pas une somme de cases.
  const dernierAlimente = jalons.reduce((n, j, i) => (alimente(j) ? i : n), -1);
  const faits = jalons.filter((j) => j.etat === "fait").length;

  return (
    <section
      aria-label="Avancement technique de l'affaire"
      // Le synoptique parle des E/S : il porte le bleu du signal AI.
      className="signal-ai bloc overflow-hidden"
    >
      <div className="bloc-entete flex-wrap items-baseline gap-x-2">
        <h2 className="font-display text-sm font-semibold text-fg">Avancement</h2>
        <p className="text-xs text-subtle">
          déduit de ce qui a réellement été produit — rien à cocher
        </p>
        <p className="ref ml-auto text-signal">
          {faits}/{jalons.length}
        </p>
      </div>

      <div className="relative">
        {/* La lueur qui parcourt la frise à l'ouverture : la mise sous tension.
            Une seule passe — c'est le seul endroit de l'appli où on se le
            permet, et c'est pour ça qu'on la remarque. */}
        <span aria-hidden className="syn-courant" />

        <ol className="synoptique [--syn-n:7]">
          {jalons.map((j, i) => {
            const ton = TON[j.etat];
            return (
              <li key={j.cle} className={cn("syn-etape", i < dernierAlimente && "syn-vive")}>
                <span aria-hidden className={cn("led mt-1 sm:mt-0", ton.led)} />
                <span className="min-w-0">
                  <span className={cn("block truncate text-sm font-medium", ton.libelle)}>
                    {j.libelle}
                    <span className="sr-only"> — {ton.etatLu}</span>
                  </span>
                  <span className="block text-xs leading-snug text-subtle">{j.detail}</span>
                </span>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}
