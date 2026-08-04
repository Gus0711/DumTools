"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Check, Info, Loader2, Trash2, TriangleAlert } from "lucide-react";
import { Button, Combobox, type ComboOption } from "@/ui";
import { cn } from "@/lib/cn";
import type { BesoinArmoire, EtatAffaire } from "@/generated/prisma/enums";
import { CYCLE_AFFAIRE, etapeSuivante, etatAide, etatLabel } from "./etats";
import { BESOINS_ARMOIRE } from "./armoire";
import { changerBesoinArmoire, changerEtatAffaire, modifierAffaire } from "./actions";

/* =============================================================================
 * IDENTIFICATION DE L'AFFAIRE
 * Le nom en très grand, les références en dessous, le cycle en rail. Tout est
 * éditable sur place — pas de mode « modifier » : on écrit là où on lit, et le
 * bouton d'enregistrement n'apparaît que si quelque chose a bougé.
 * ========================================================================== */

/** Champ éditable « à plat » : ni boîte ni ombre, juste un filet sous la valeur. */
const CHAMP_PLAT = cn(
  "w-full rounded-none border-0 border-b border-transparent bg-transparent px-0 text-sm text-fg shadow-none",
  // Au doigt, un champ de 34px se rate : on lui donne de la hauteur au
  // téléphone, on la reprend à partir de sm où l'on est à la souris.
  "min-h-[2.4rem] py-1.5 sm:min-h-0 sm:py-0.5",
  "transition-[border-color] duration-150",
  "hover:border-border focus:border-brand focus:outline-none focus:ring-0",
  "placeholder:text-subtle",
);

export function AffaireFicheHeader({
  id,
  nom,
  etat,
  besoinArmoire,
  clientNom,
  numeroWhy,
  clients,
}: {
  id: string;
  nom: string;
  etat: EtatAffaire;
  besoinArmoire: BesoinArmoire | null;
  clientNom: string;
  numeroWhy: string | null;
  clients: string[];
}) {
  const router = useRouter();
  const [valNom, setValNom] = useState(nom);
  const [valClient, setValClient] = useState(clientNom);
  const [valWhy, setValWhy] = useState(numeroWhy ?? "");
  const [erreur, setErreur] = useState("");
  const [pending, start] = useTransition();

  const options = useMemo<ComboOption[]>(() => clients.map((c) => ({ value: c })), [clients]);
  const modifie =
    valNom.trim() !== nom || valClient.trim() !== clientNom || valWhy.trim() !== (numeroWhy ?? "");
  const valide = valNom.trim().length > 0 && valClient.trim().length > 0;

  function enregistrer() {
    setErreur("");
    start(async () => {
      try {
        await modifierAffaire(id, { nom: valNom, clientNom: valClient, numeroWhy: valWhy });
        router.refresh();
      } catch (e) {
        setErreur(e instanceof Error ? e.message : "Erreur");
      }
    });
  }

  function changerEtat(nouvel: EtatAffaire) {
    setErreur("");
    start(async () => {
      try {
        await changerEtatAffaire(id, nouvel);
        router.refresh();
      } catch (e) {
        setErreur(e instanceof Error ? e.message : "Erreur");
      }
    });
  }

  function changerArmoire(valeur: string) {
    setErreur("");
    start(async () => {
      try {
        await changerBesoinArmoire(id, valeur ? (valeur as BesoinArmoire) : null);
        router.refresh();
      } catch (e) {
        setErreur(e instanceof Error ? e.message : "Erreur");
      }
    });
  }

  return (
    <div className="anim-rise">
      <Link
        href="/affaires"
        className="group -my-1 mb-1.5 inline-flex min-h-[2.5rem] items-center gap-1.5 py-1 text-sm text-muted transition-colors hover:text-fg sm:my-0 sm:mb-2.5 sm:min-h-0 sm:py-0"
      >
        <ArrowLeft className="h-4 w-4 transition-transform duration-150 group-hover:-translate-x-0.5" />
        Affaires
      </Link>

      <div className="bloc">
        <span aria-hidden className="rule-signal anim-sweep absolute inset-x-0 top-0 z-10 h-[3px]" />

        {/* L'estampille « Affaire » a été retirée : la barre de chrome l'affiche
            déjà en permanence au-dessus. Le titre plafonne plus bas qu'avant —
            à 2,6rem il mangeait un tiers de l'écran avant la moindre donnée. */}
        <div className="flex flex-col gap-2 px-4 pb-3 pt-3.5 md:flex-row md:items-center md:justify-between md:gap-x-6 md:px-6 md:pb-3.5 md:pt-4">
          <div className="min-w-0 flex-1">
            {/* Le nom EST le titre : on l'édite là où on le lit. Le plancher de
                taille est bas pour que les noms longs tiennent au téléphone —
                un champ de saisie ne sait pas passer à la ligne. */}
            <input
              value={valNom}
              onChange={(e) => setValNom(e.target.value)}
              aria-label="Nom de l'affaire"
              className={cn(
                CHAMP_PLAT,
                "font-display text-[clamp(1.1rem,0.8rem+1.3vw,1.85rem)] font-bold leading-tight tracking-[-0.03em]",
              )}
            />
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {modifie && (
              <Button size="sm" onClick={enregistrer} disabled={pending || !valide}>
                {pending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Check className="h-4 w-4" />
                )}
                Enregistrer
              </Button>
            )}
            <BoutonEtapeSuivante etat={etat} pending={pending} onChanger={changerEtat} />
            <BoutonCorbeille etat={etat} pending={pending} onChanger={changerEtat} />
          </div>
        </div>

        {/* Rail du cycle — la barre de progression de l'affaire, pleine largeur. */}
        <CycleAffaire etat={etat} pending={pending} onChanger={changerEtat} />

        {/* Pavé de références — TROIS COLONNES ÉGALES. En flex, le champ Client
            portait `flex-1` et mangeait toute la largeur restante : les trois
            références n'avaient aucune raison d'être hiérarchisées ainsi. Une
            grille à parts égales les aligne, et les filets de séparation
            tombent à intervalle régulier. */}
        <div className="grid grid-cols-1 border-t border-hairline bg-surface-2 sm:grid-cols-3">
          <Champ label="Client">
            <Combobox
              value={valClient}
              onInput={setValClient}
              onPick={(o) => setValClient(o.value)}
              options={options}
              placeholder="Client…"
              inputClassName={CHAMP_PLAT}
            />
          </Champ>

          <Champ label="N° Why">
            <input
              value={valWhy}
              onChange={(e) => setValWhy(e.target.value)}
              placeholder="26DM0289/T"
              aria-label="Numéro Why"
              className={cn(CHAMP_PLAT, "ref")}
            />
          </Champ>

          <Champ label="Besoin armoire" pourId="besoin-armoire">
            <select
              id="besoin-armoire"
              value={besoinArmoire ?? ""}
              onChange={(e) => changerArmoire(e.target.value)}
              disabled={pending}
              className={cn(CHAMP_PLAT, "cursor-pointer")}
            >
              <option value="">Non défini</option>
              {BESOINS_ARMOIRE.map((b) => (
                <option key={b.value} value={b.value}>
                  {b.label}
                </option>
              ))}
            </select>
          </Champ>
        </div>

        {erreur && (
          <p className="flex items-center gap-1.5 border-t border-hairline bg-danger/8 px-4 py-2 text-sm text-danger md:px-6">
            <TriangleAlert className="h-4 w-4 shrink-0" /> {erreur}
          </p>
        )}
      </div>
    </div>
  );
}

function Champ({
  label,
  pourId,
  className,
  children,
}: {
  label: string;
  pourId?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        // min-w-0 : en grille, une colonne `1fr` vaut `min-width:auto` par
        // défaut — un nom de client à rallonge élargirait sa colonne et
        // casserait l'égalité des trois.
        "min-w-0 border-b border-hairline px-4 py-2 last:border-b-0",
        "sm:border-b-0 sm:border-r sm:last:border-r-0 md:px-6",
        className,
      )}
    >
      {pourId ? (
        <label className="stamp" htmlFor={pourId}>
          {label}
        </label>
      ) : (
        <span className="stamp">{label}</span>
      )}
      <div className="mt-0.5">{children}</div>
    </div>
  );
}

/**
 * Cycle de vie en rail : Devis → Commande → En cours → Livrée → Clôturée.
 * Chaque étape occupe la même largeur et se remplit quand elle est franchie —
 * on lit l'avancement d'un coup d'œil, sans compter les pastilles.
 *
 * DÉCOUVRABILITÉ (le point qui coinçait) : le rail ressemblait à une barre de
 * progression, donc personne ne devinait qu'il était cliquable, et les libellés
 * seuls ne disaient pas ce qu'on déclarait en cliquant. Trois ajouts :
 *   - une ligne sous le rail explique l'étape EN COURS en langage de chantier ;
 *   - les étapes non atteintes portent un liseré pointillé (« pas encore »),
 *     et le survol annonce l'action en toutes lettres ;
 *   - le geste normal (avancer d'un cran) a son propre bouton, plus haut —
 *     le rail ne sert plus qu'à corriger ou revenir en arrière.
 */
function CycleAffaire({
  etat,
  pending,
  onChanger,
}: {
  etat: EtatAffaire;
  pending: boolean;
  onChanger: (e: EtatAffaire) => void;
}) {
  const corbeille = etat === "CORBEILLE";
  const courant = CYCLE_AFFAIRE.findIndex((e) => e.value === etat);

  return (
    <>
      <div className="flex snap-x snap-mandatory overflow-x-auto border-t border-hairline [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {CYCLE_AFFAIRE.map((e, i) => {
          const estCourant = e.value === etat;
          const franchie = !corbeille && courant >= 0 && i < courant;
          return (
            <button
              key={e.value}
              type="button"
              onClick={() => !estCourant && onChanger(e.value)}
              disabled={pending || estCourant}
              aria-current={estCourant ? "step" : undefined}
              title={
                estCourant
                  ? `Étape actuelle : ${e.label} — ${e.aide}`
                  : `Basculer l'affaire en « ${e.label} » : ${e.aide}`
              }
              className={cn(
                "group relative min-w-[7.5rem] shrink-0 snap-start border-r border-hairline px-2 py-2.5 text-center last:border-r-0 sm:min-w-0 sm:flex-1 sm:py-2",
                "transition-colors duration-150",
                estCourant
                  ? "bg-brand text-brand-fg"
                  : franchie
                    ? "bg-brand/10 text-brand hover:bg-brand/15"
                    : "cursor-pointer text-subtle hover:bg-surface-2 hover:text-fg",
                pending && "opacity-60",
              )}
            >
              <span className="flex items-center justify-center gap-1.5 font-display text-[0.68rem] font-semibold uppercase tracking-[0.09em]">
                {franchie && <Check className="h-3.5 w-3.5" />}
                {e.label}
              </span>
              {estCourant && (
                <span aria-hidden className="absolute inset-x-0 bottom-0 h-[3px] bg-accent" />
              )}
              {/* Ce qui reste à parcourir est pointillé — même vocabulaire que
                  le synoptique d'avancement : pointillé = pas encore alimenté. */}
              {!estCourant && !franchie && !corbeille && (
                <span
                  aria-hidden
                  className="absolute inset-x-0 bottom-0 border-b border-dashed border-border"
                />
              )}
            </button>
          );
        })}
      </div>

      {/* Ce que l'étape courante VEUT DIRE. C'est la ligne qui manquait : sans
          elle, « Commande » ou « Livrée » ne se distinguent que pour ceux qui
          connaissent déjà le processus maison. */}
      <p className="border-t border-hairline bg-surface-2 px-4 py-1.5 text-xs text-muted md:px-6">
        <Info className="mr-1.5 inline h-3.5 w-3.5 -translate-y-px text-subtle" />
        <span className="font-medium text-fg">{etatLabel(etat)}</span> — {etatAide(etat)}
      </p>
    </>
  );
}

/**
 * Le geste normal, rendu évident : avancer d'un cran. Un bouton avec un verbe
 * et la destination, plutôt qu'un segment de rail à deviner. Disparaît quand
 * l'affaire est clôturée (plus de suite) ou à la corbeille (hors piste).
 */
function BoutonEtapeSuivante({
  etat,
  pending,
  onChanger,
}: {
  etat: EtatAffaire;
  pending: boolean;
  onChanger: (e: EtatAffaire) => void;
}) {
  const suivante = etapeSuivante(etat);
  if (!suivante) return null;

  return (
    <Button
      size="sm"
      variant="outline"
      onClick={() => onChanger(suivante.value)}
      disabled={pending}
      title={`Faire avancer l'affaire : ${etatAide(suivante.value)}`}
    >
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
      Passer en « {suivante.label} »
      <ArrowRight className="h-4 w-4" />
    </Button>
  );
}

/** La corbeille n'est pas une étape du cycle : c'est une sortie de piste. */
function BoutonCorbeille({
  etat,
  pending,
  onChanger,
}: {
  etat: EtatAffaire;
  pending: boolean;
  onChanger: (e: EtatAffaire) => void;
}) {
  const corbeille = etat === "CORBEILLE";
  return (
    <button
      type="button"
      onClick={() => onChanger(corbeille ? "EN_COURS" : "CORBEILLE")}
      disabled={pending}
      title={
        corbeille
          ? "Sortir de la corbeille (repasse en « En cours »)"
          : "Mettre l'affaire à la corbeille (perdue, doublon, erreur)"
      }
      className={cn(
        "inline-flex min-h-[2.25rem] shrink-0 items-center gap-1.5 border px-2.5 text-xs transition-colors duration-150 sm:min-h-0 sm:py-1.5",
        corbeille
          ? "border-danger bg-danger/12 font-semibold text-danger"
          : "border-transparent text-subtle hover:border-border hover:text-danger",
        pending && "opacity-60",
      )}
    >
      <Trash2 className="h-3.5 w-3.5" />
      Corbeille
    </button>
  );
}
