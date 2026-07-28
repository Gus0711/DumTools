import Link from "next/link";
import { cn } from "@/lib/cn";
import { Compteur } from "./compteur";

/* =============================================================================
 * LE CHIFFRE
 * Une donnée qu'on lit depuis l'autre bout de l'atelier : gros, aligné, avec
 * son libellé estampillé au-dessus (un chiffre nu ne veut rien dire) et, quand
 * il y a lieu, une précision en dessous. Cliquable quand il mène quelque part —
 * un compteur qui ne va nulle part est un chiffre mort.
 * ========================================================================== */

type Ton = "neutre" | "accent" | "success" | "danger";

const TON: Record<Ton, string> = {
  neutre: "text-fg",
  accent: "text-accent-strong",
  success: "text-success",
  danger: "text-danger",
};

export function Chiffre({
  label,
  valeur,
  detail,
  ton = "neutre",
  href,
  petit = false,
  className,
}: {
  label: string;
  valeur: React.ReactNode;
  detail?: React.ReactNode;
  ton?: Ton;
  href?: string;
  /** Version resserrée, pour une rangée de plus de quatre chiffres. */
  petit?: boolean;
  className?: string;
}) {
  const contenu = (
    <>
      <span className="stamp block">{label}</span>
      <span className={cn("chiffre mt-2 block", petit && "chiffre-sm", TON[ton])}>
        {/* Un compteur se cale comme une aiguille. Les valeurs déjà composées
            (« 12/40 », « il y a 3 j ») restent telles quelles : elles ne se
            comptent pas. */}
        {typeof valeur === "number" ? <Compteur valeur={valeur} /> : valeur}
      </span>
      {detail && <span className="mt-1.5 block text-xs text-muted">{detail}</span>}
    </>
  );

  const classes = cn(
    "bloc flex flex-col items-start px-4 py-3.5",
    href && "transition-colors duration-150 hover:bg-surface-2",
    className,
  );

  return href ? (
    <Link href={href} className={cn(classes, "group")}>
      {contenu}
    </Link>
  ) : (
    <div className={classes}>{contenu}</div>
  );
}

/** Rangée de chiffres bord à bord — les blocs partagent leurs filets. */
export function RangeeChiffres({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("planche grid-cols-2 md:grid-cols-4", className)}>{children}</div>
  );
}
