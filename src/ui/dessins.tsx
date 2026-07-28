import { cn } from "@/lib/cn";

/* =============================================================================
 * LES DESSINS AU TRAIT
 * Ce qu'un écran montre quand il n'a rien à montrer, c'est là qu'un outil a une
 * gueule ou n'en a pas. Plutôt qu'une icône générique dans un carré pointillé,
 * on dessine une pièce du monde GTB, au trait fin, comme sur un plan : un
 * bornier vide, un automate sans modules, une armoire ouverte.
 *
 * Règles de la famille — s'y tenir pour que les six restent une série :
 *  · viewBox 0 0 120 84, trait de 1.25, jamais de remplissage ;
 *  · le trait courant est `text-border` ; UN SEUL détail en laiton par dessin
 *    (`text-accent`) — c'est lui qui attire l'œil, il n'y en a jamais deux ;
 *  · pointillés = ce qui manque, justement (l'emplacement libre, la pièce
 *    absente, la pochette vide). Le dessin dit l'attente, pas l'échec.
 * ========================================================================== */

export type NomDessin =
  | "bornier"
  | "automate"
  | "armoire"
  | "carnet"
  | "touret"
  | "pochette";

function Planche({
  children,
  className,
  petit = false,
}: {
  children: React.ReactNode;
  className?: string;
  petit?: boolean;
}) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 120 84"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.25}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn("text-subtle/70", petit ? "h-12 w-auto" : "h-20 w-auto", className)}
    >
      {children}
    </svg>
  );
}

/** Un bornier sur rail DIN, avec un emplacement encore libre. */
function Bornier() {
  return (
    <>
      {/* Le rail */}
      <path d="M8 62h104M8 62v9h104v-9" />
      {/* Trois bornes câblées */}
      {[20, 42, 64].map((x) => (
        <g key={x}>
          <rect x={x} y={28} width={18} height={34} />
          <circle cx={x + 9} cy={37} r={3.2} />
          <path d={`M${x + 5.8} 37h6.4`} />
          <path d={`M${x + 9} 14v14`} />
        </g>
      ))}
      {/* L'emplacement libre : c'est lui qu'on attend */}
      <rect x={86} y={28} width={18} height={34} strokeDasharray="3 3" />
      {/* Le fil qui n'est pas encore tiré */}
      <path d="M95 14v14" className="text-accent" strokeDasharray="3 3" />
    </>
  );
}

/** Un automate seul sur son rail : aucun module d'extension clipsé. */
function Automate() {
  return (
    <>
      <path d="M10 70h100" />
      <rect x={22} y={18} width={62} height={48} />
      {/* Bandeau de voyants — un seul allumé */}
      {[0, 1, 2, 3].map((i) => (
        <rect key={i} x={28 + i * 9} y={24} width={5} height={4} />
      ))}
      <rect x={64} y={24} width={5} height={4} className="text-accent" fill="currentColor" />
      {/* Afficheur */}
      <rect x={28} y={34} width={28} height={16} />
      {/* Bornes en pied */}
      {[0, 1, 2, 3, 4].map((i) => (
        <path key={i} d={`M${30 + i * 11} 66v4`} />
      ))}
      {/* L'extension qui n'est pas là */}
      <rect x={90} y={22} width={20} height={40} strokeDasharray="3 3" />
    </>
  );
}

/** Une armoire ouverte, rails nus. */
function Armoire() {
  return (
    <>
      <rect x={30} y={10} width={66} height={64} />
      {/* La porte, battante */}
      <path d="M30 10 12 18v56l18-8" />
      {/* La poignée : ce qu'on attrape */}
      <path d="M22 38v12" className="text-accent" strokeWidth={2} />
      {/* Deux rails vides */}
      <path d="M38 30h50M38 30v5h50v-5" />
      <path d="M38 52h50M38 52v5h50v-5" />
      {/* Une seule borne posée, en haut à gauche */}
      <rect x={42} y={20} width={10} height={10} strokeDasharray="3 3" />
    </>
  );
}

/** Un carnet fermé, signet en place. */
function Carnet() {
  return (
    <>
      <rect x={30} y={10} width={58} height={64} rx={2} />
      {/* La reliure spirale */}
      {[0, 1, 2, 3, 4].map((i) => (
        <circle key={i} cx={30} cy={20 + i * 12} r={3.4} />
      ))}
      {/* L'étiquette de couverture, vierge */}
      <rect x={44} y={30} width={32} height={18} strokeDasharray="3 3" />
      {/* Le signet */}
      <path d="M76 10v22l-4-4-4 4V10" className="text-accent" />
    </>
  );
}

/** Un touret de câble : ce qui n'a pas encore été déroulé. */
function Touret() {
  return (
    <>
      <ellipse cx={44} cy={44} rx={9} ry={26} />
      <ellipse cx={80} cy={44} rx={9} ry={26} />
      <path d="M44 18h36M44 70h36" />
      {/* Les spires */}
      <path d="M56 20v48M68 20v48" strokeDasharray="4 4" />
      <circle cx={44} cy={44} r={4} />
      {/* Le brin qu'on tire */}
      <path d="M86 32c10-6 16-4 22-12" className="text-accent" />
    </>
  );
}

/** Une pochette de dossier, rien dedans. */
function Pochette() {
  return (
    <>
      <path d="M16 24h32l7 9h49v41H16z" />
      {/* La feuille qu'on attend */}
      <rect x={42} y={44} width={44} height={22} strokeDasharray="3 3" />
      <path d="M50 52h20M50 58h28" strokeDasharray="3 3" />
      {/* L'onglet */}
      <path d="M16 33h32" className="text-accent" />
    </>
  );
}

const DESSINS: Record<NomDessin, () => React.JSX.Element> = {
  bornier: Bornier,
  automate: Automate,
  armoire: Armoire,
  carnet: Carnet,
  touret: Touret,
  pochette: Pochette,
};

export function Dessin({
  nom,
  petit = false,
  className,
}: {
  nom: NomDessin;
  /** Version réduite, pour une zone interne (colonne de kanban…). */
  petit?: boolean;
  className?: string;
}) {
  const Trace = DESSINS[nom];
  return (
    <Planche petit={petit} className={className}>
      <Trace />
    </Planche>
  );
}
