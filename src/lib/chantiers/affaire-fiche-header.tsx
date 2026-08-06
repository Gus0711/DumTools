"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Info,
  KeyRound,
  Loader2,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { Button, Combobox, type ComboOption } from "@/ui";
import { cn } from "@/lib/cn";
import type { BesoinArmoire, EtatAffaire } from "@/generated/prisma/enums";
import { CYCLE_AFFAIRE, etapeSuivante, etatAide, etatLabel } from "./etats";
import { BESOINS_ARMOIRE } from "./armoire";
import {
  changerBesoinArmoire,
  changerEtatAffaire,
  changerSuiviPar,
  libererNumeroWhy,
  modifierAffaire,
  supprimerAffaire,
} from "./actions";

/* =============================================================================
 * IDENTIFICATION DE L'AFFAIRE
 * Le nom en très grand, les références en dessous, le cycle en rail. Tout est
 * éditable sur place — pas de mode « modifier » : on écrit là où on lit, et le
 * bouton d'enregistrement n'apparaît que si quelque chose a bougé.
 * ========================================================================== */

/**
 * Une valeur qu'on choisit dans un MENU : affichée immédiatement, corrigée si
 * le serveur finit par dire autre chose.
 *
 * Sans ça, un `<select>` piloté par la prop serveur reste sur son ancienne
 * valeur — grisé — pendant tout l'aller-retour : action, puis re-rendu complet
 * de la fiche (frise, projets, matériel, notes, fichiers, scans). Le choix est
 * pourtant déjà fait et déjà valide côté client ; le faire attendre ne protège
 * de rien, ça donne juste l'impression que « ça tourne ».
 *
 * Le réalignement se fait PENDANT LE RENDU (pas dans un effet) : c'est le
 * patron recommandé par React pour un état dérivé d'une prop, et l'effet
 * équivalent est refusé par le lint du projet.
 */
function useChoixServeur(valeurServeur: string) {
  const [vue, setVue] = useState(valeurServeur);
  const [derniereProp, setDerniereProp] = useState(valeurServeur);
  if (derniereProp !== valeurServeur) {
    setDerniereProp(valeurServeur);
    setVue(valeurServeur);
  }
  return [vue, setVue] as const;
}

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
  suiviParId,
  suiviParNom,
  utilisateurs,
}: {
  id: string;
  nom: string;
  etat: EtatAffaire;
  besoinArmoire: BesoinArmoire | null;
  clientNom: string;
  numeroWhy: string | null;
  clients: string[];
  /** Qui suit l'affaire chez nous. Null = personne d'attitré. */
  suiviParId: string | null;
  suiviParNom: string | null;
  /** Comptes actifs, pour le menu « Suivi par ». */
  utilisateurs: { id: string; nom: string }[];
}) {
  const router = useRouter();
  const [valNom, setValNom] = useState(nom);
  const [valClient, setValClient] = useState(clientNom);
  const [valWhy, setValWhy] = useState(numeroWhy ?? "");
  // Les deux menus s'affichent tout de suite (voir useChoixServeur).
  const [valArmoire, setValArmoire] = useChoixServeur(besoinArmoire ?? "");
  const [valSuivi, setValSuivi] = useChoixServeur(suiviParId ?? "");
  const [erreur, setErreur] = useState("");
  // Suppression en deux temps : le premier clic arme, le second exécute.
  const [confirmeSuppr, setConfirmeSuppr] = useState(false);
  const [pending, start] = useTransition();

  const options = useMemo<ComboOption[]>(() => clients.map((c) => ({ value: c })), [clients]);
  const modifie =
    valNom.trim() !== nom || valClient.trim() !== clientNom || valWhy.trim() !== (numeroWhy ?? "");
  const valide = valNom.trim().length > 0 && valClient.trim().length > 0;

  function enregistrer() {
    setErreur("");
    start(async () => {
      try {
        // Le refus attendu (n° Why déjà pris) est RETOURNÉ : une erreur lancée
        // arriverait ici sans son message, effacé par Next en production.
        const r = await modifierAffaire(id, {
          nom: valNom,
          clientNom: valClient,
          numeroWhy: valWhy,
        });
        if (r?.erreur) {
          setErreur(r.erreur);
          return;
        }
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

  /** Deux gestes de nettoyage, réservés à la corbeille (voir actions.ts). Ils
   *  RETOURNENT leur refus : un message lancé serait effacé en production. */
  function nettoyer(action: () => Promise<{ erreur: string } | void>, apres?: () => void) {
    setErreur("");
    start(async () => {
      try {
        const r = await action();
        if (r?.erreur) {
          setErreur(r.erreur);
          return;
        }
        apres?.();
        router.refresh();
      } catch (e) {
        setErreur(e instanceof Error ? e.message : "Erreur");
      }
    });
  }

  /* ---- Rafraîchir, ou pas -------------------------------------------------
     `router.refresh()` re-rend la fiche ENTIÈRE (frise, projets, matériel,
     notes, fichiers, scans) et invalide le cache de routeur, ce qui relance au
     passage le préchargement de tous les liens visibles. C'est cher. On ne le
     paie donc que si un AUTRE morceau de l'écran dépend de la valeur :
       · besoin armoire → oui : il alimente le jalon « Armoire » de la frise et
         le bandeau « schéma d'armoire manquant » ;
       · suivi par      → non : rien d'autre sur la fiche ne l'affiche. La liste
         des affaires, elle, est réévaluée à la navigation (l'action appelle
         déjà `revalidatePath("/affaires")`).
     Vérifié : sans refresh, la frise ne bouge pas — la réponse de l'action ne
     suffit pas à réactualiser l'arbre ici. */

  function changerArmoire(valeur: string) {
    const avant = valArmoire;
    setValArmoire(valeur); // affiché tout de suite
    setErreur("");
    start(async () => {
      try {
        await changerBesoinArmoire(id, valeur ? (valeur as BesoinArmoire) : null);
        router.refresh(); // la frise et l'alerte en dépendent
      } catch (e) {
        setValArmoire(avant); // refusé : on rend la main à la vérité du serveur
        setErreur(e instanceof Error ? e.message : "Erreur");
      }
    });
  }

  function changerSuivi(valeur: string) {
    const avant = valSuivi;
    setValSuivi(valeur);
    setErreur("");
    start(async () => {
      try {
        // Refus attendu (compte désactivé) : RETOURNÉ, pas lancé.
        const r = await changerSuiviPar(id, valeur || null);
        if (r?.erreur) {
          setValSuivi(avant);
          setErreur(r.erreur);
        }
      } catch (e) {
        setValSuivi(avant);
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

        {/* --- Nettoyage, uniquement depuis la corbeille -------------------- *
            Une affaire mise de côté retient son n° Why, qui est unique : le
            numéro reste pris alors que l'affaire n'apparaît plus au tableau de
            bord. Les deux issues sont ici, et nulle part ailleurs. */}
        {etat === "CORBEILLE" && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-hairline bg-surface-2 px-4 py-2.5">
            <span className="stamp">Nettoyage</span>
            {numeroWhy && (
              <button
                type="button"
                disabled={pending}
                onClick={() => nettoyer(() => libererNumeroWhy(id))}
                title="Rend le n° Why réutilisable par une autre affaire. Rien n'est supprimé."
                className="press inline-flex min-h-[2.25rem] items-center gap-1.5 text-sm font-semibold text-brand transition-colors hover:text-brand-strong disabled:opacity-50 sm:min-h-0"
              >
                <KeyRound className="h-3.5 w-3.5" />
                Libérer le n° Why
              </button>
            )}
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                confirmeSuppr
                  ? nettoyer(() => supprimerAffaire(id), () => router.push("/affaires"))
                  : setConfirmeSuppr(true)
              }
              title="Supprime l'affaire. Refusé tant qu'elle porte quelque chose."
              className={cn(
                "press inline-flex min-h-[2.25rem] items-center gap-1.5 text-sm font-semibold transition-colors disabled:opacity-50 sm:min-h-0",
                confirmeSuppr ? "text-danger" : "text-muted hover:text-danger",
              )}
            >
              <Trash2 className="h-3.5 w-3.5" />
              {confirmeSuppr ? "Confirmer la suppression définitive" : "Supprimer définitivement"}
            </button>
            {confirmeSuppr && (
              <button
                type="button"
                onClick={() => setConfirmeSuppr(false)}
                className="text-sm text-muted transition-colors hover:text-fg"
              >
                Annuler
              </button>
            )}
            <span className="ml-auto hidden text-xs text-subtle sm:block">
              La suppression n&apos;est possible que si l&apos;affaire ne porte plus rien.
            </span>
          </div>
        )}

        {/* Rail du cycle — la barre de progression de l'affaire, pleine largeur. */}
        <CycleAffaire etat={etat} pending={pending} onChanger={changerEtat} />

        {/* Pavé de références — COLONNES ÉGALES. En flex, le champ Client
            portait `flex-1` et mangeait toute la largeur restante : les
            références n'avaient aucune raison d'être hiérarchisées ainsi. Une
            grille à parts égales les aligne, et les filets de séparation
            tombent à intervalle régulier. À quatre champs, on passe par deux
            colonnes avant d'aller à quatre : « Besoin armoire » et « Suivi par »
            ne tiennent pas côte à côte sur une tablette. */}
        <div className="grid grid-cols-1 border-t border-hairline bg-surface-2 sm:grid-cols-2 lg:grid-cols-4">
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

          {/* Plus de `disabled={pending}` : un menu qu'on vient d'ouvrir et de
              choisir n'a aucune raison de se verrouiller le temps du réseau.
              L'enregistrement se signale par le point laiton du libellé. */}
          <Champ label="Besoin armoire" pourId="besoin-armoire" enCours={pending}>
            <select
              id="besoin-armoire"
              value={valArmoire}
              onChange={(e) => changerArmoire(e.target.value)}
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

          {/* « Suivi par » : qui s'en occupe CHEZ NOUS. C'est un repère, pas un
              droit d'accès — l'affaire reste ouverte à tout le monde. Le menu
              s'applique au changement, comme le besoin armoire : pas de bouton
              « enregistrer » pour une valeur qu'on choisit dans une liste. */}
          <Champ label="Suivi par" pourId="suivi-par" enCours={pending}>
            <select
              id="suivi-par"
              value={valSuivi}
              onChange={(e) => changerSuivi(e.target.value)}
              className={cn(CHAMP_PLAT, "cursor-pointer", !valSuivi && "text-subtle")}
            >
              <option value="">Personne</option>
              {/* Le titulaire n'est plus dans les actifs (compte désactivé) :
                  on l'ajoute quand même, sinon le menu afficherait « Personne »
                  alors que la base dit le contraire. */}
              {suiviParId && !utilisateurs.some((u) => u.id === suiviParId) && (
                <option value={suiviParId}>{suiviParNom ?? "Compte désactivé"} (inactif)</option>
              )}
              {utilisateurs.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.nom}
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
  enCours = false,
  className,
  children,
}: {
  label: string;
  pourId?: string;
  /** Une écriture est en vol : un point laiton à côté du libellé. Discret par
   *  choix — le champ affiche déjà la bonne valeur, il ne se passe rien que
   *  l'utilisateur doive attendre. */
  enCours?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        // min-w-0 : en grille, une colonne `1fr` vaut `min-width:auto` par
        // défaut — un nom de client à rallonge élargirait sa colonne et
        // casserait l'égalité des colonnes.
        "min-w-0 border-b border-hairline px-4 py-2 last:border-b-0",
        "sm:border-b-0 sm:border-r sm:last:border-r-0 md:px-6",
        className,
      )}
    >
      <span className="flex items-center gap-1.5">
        {pourId ? (
          <label className="stamp" htmlFor={pourId}>
            {label}
          </label>
        ) : (
          <span className="stamp">{label}</span>
        )}
        {enCours && (
          <span
            aria-hidden
            title="Enregistrement…"
            className="signal-accent led led-cur shrink-0"
          />
        )}
      </span>
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
