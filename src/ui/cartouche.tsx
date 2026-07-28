import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/cn";
import { TitreEcran } from "@/components/app-shell/contexte-ecran";

/* =============================================================================
 * LE CARTOUCHE — bloc d'identification en tête de page.
 *
 * Sur un schéma électrique, le cartouche est le pavé du plan qui dit qui, pour
 * qui, quel numéro d'affaire, quel folio, quel indice. On le lit AVANT le plan.
 * C'est l'objet que nos collègues déchiffrent tous les jours — on en fait
 * l'en-tête de chaque écran plutôt qu'un titre + paragraphe.
 *
 * Il est aussi le point d'entrée du contexte : il dépose l'estampille et le
 * titre dans la barre de chrome, en haut, pour qu'on sache toujours où on est
 * même après avoir fait défiler la page.
 * ========================================================================== */

export type ChampCartouche = {
  /** Libellé estampillé, en petites capitales (ex. « N° Why »). */
  label: string;
  /** Valeur affichée. `null`/`undefined` → tiret cadratin. */
  valeur?: React.ReactNode;
  /** Référence technique (n° Why, borne, folio…) : rendue en mono. */
  ref?: boolean;
  /** Compteur mis en avant : gros chiffre aligné. */
  fort?: boolean;
};

export function Cartouche({
  estampille,
  titre,
  titreTexte,
  sousTitre,
  description,
  statut,
  actions,
  champs,
  retour,
  enfants,
  className,
}: {
  /** Type d'écran, en petites capitales : « Affaire », « Référentiel client »… */
  estampille?: string;
  titre: React.ReactNode;
  /** Titre en texte brut pour la barre de chrome, quand `titre` est du JSX. */
  titreTexte?: string;
  /** Ligne d'attache sous le titre : le client, la rubrique parente… */
  sousTitre?: React.ReactNode;
  /** Une phrase, pas un paragraphe : ce que l'écran permet de faire. */
  description?: React.ReactNode;
  /** Badge d'état, aligné à droite de l'estampille. */
  statut?: React.ReactNode;
  /** Actions principales de l'écran (bouton de création…). */
  actions?: React.ReactNode;
  /** Bande de champs de référence, façon pavé de cartouche. */
  champs?: ChampCartouche[];
  /** Lien de retour, posé au-dessus du cadre. */
  retour?: { href: string; label: string };
  /** Contenu libre inséré dans le cadre, sous le titre (barre de filtres…). */
  enfants?: React.ReactNode;
  className?: string;
}) {
  const champsUtiles = champs?.filter(Boolean) ?? [];
  const pourChrome = titreTexte ?? (typeof titre === "string" ? titre : undefined);

  return (
    <div className={cn("anim-rise", className)}>
      {/* Le même titre alimente la barre de chrome : une seule source. */}
      {pourChrome && <TitreEcran estampille={estampille} titre={pourChrome} />}

      {retour && (
        <Link
          href={retour.href}
          className="group -my-1 mb-1.5 inline-flex min-h-[2.5rem] items-center gap-1.5 py-1 text-sm text-muted transition-colors hover:text-fg sm:my-0 sm:mb-2.5 sm:min-h-0 sm:py-0"
        >
          <ArrowLeft className="h-4 w-4 transition-transform duration-150 group-hover:-translate-x-0.5" />
          {retour.label}
        </Link>
      )}

      <div className="bloc">
        {/* Filet des 5 signaux E/S : la langue couleur de la maison, réduite à
            un trait. Il se met « sous tension » de gauche à droite à l'ouverture. */}
        <span aria-hidden className="rule-signal anim-sweep absolute inset-x-0 top-0 z-10 h-[3px]" />

        <div className="px-4 pb-4 pt-5 md:px-6">
          {/* Ligne d'estampille : « AFFAIRE ───────────────  ● En cours » */}
          {(estampille || statut) && (
            <div className="mb-2 flex items-center gap-3">
              {estampille && <span className="stamp shrink-0">{estampille}</span>}
              <span aria-hidden className="h-px flex-1 bg-hairline" />
              {statut}
            </div>
          )}

          <div className="flex flex-col gap-3 md:flex-row md:flex-wrap md:items-start md:justify-between md:gap-x-8">
            <div className="min-w-0 flex-1">
              <h1 className="font-display text-[clamp(1.5rem,1rem+2vw,2.6rem)] font-bold leading-tight tracking-[-0.035em] text-fg">
                {titre}
              </h1>
              {sousTitre && (
                <p className="mt-1 text-sm font-medium text-brand">{sousTitre}</p>
              )}
              {description && (
                <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">
                  {description}
                </p>
              )}
            </div>

            {actions && (
              <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
            )}
          </div>

          {enfants && <div className="mt-4">{enfants}</div>}
        </div>

        {champsUtiles.length > 0 && (
          <dl className="cartouche-champs">
            {champsUtiles.map((c) => (
              <div key={c.label} className="min-w-0">
                <dt className="stamp">{c.label}</dt>
                <dd
                  className={cn(
                    "mt-0.5 truncate text-fg",
                    c.ref && "ref",
                    c.fort
                      ? "font-display text-xl font-bold tabular-nums"
                      : "text-sm",
                  )}
                >
                  {c.valeur ?? <span className="text-subtle">—</span>}
                </dd>
              </div>
            ))}
          </dl>
        )}
      </div>
    </div>
  );
}
