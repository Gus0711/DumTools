"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Check,
  Copy,
  Ban,
  ExternalLink,
  FileDown,
  Globe,
  Clock,
  RotateCcw,
} from "lucide-react";
import { Button, Label } from "@/ui";
import { cn } from "@/lib/cn";
import { libelleEcheance, partageActif } from "@/lib/partage/model";
import {
  majEnteteDevis,
  majLot,
  prolongerPartageDevis,
  publierDevis,
  reprendreIdentiteClient,
  revoquerPartageDevis,
} from "./actions";
import {
  BASE_URL_DEVIS_PUBLIC,
  DUREE_PARTAGE_DEVIS_DEFAUT,
  dureesPartageDevis,
  paveReprenable,
  type DevisComplet,
  type LotDevisVue,
} from "./model";

/* -----------------------------------------------------------------------------
 * LA PUBLICATION — le lien qu'on envoie au client
 *
 * Un onglet du panneau, pas un volet flottant : trois choses s'y règlent d'un
 * même geste (à qui, ce qu'on montre, et le lien), et les cacher derrière un
 * bouton « partager » aurait rendu invisibles les deux premières.
 *
 * ⚠️ Le lien montre le devis À SA SOURCE : modifier un devis publié change ce
 * que le client voit. C'est le choix qui a été fait, et ce bloc le DIT — plutôt
 * que de le laisser découvrir au téléphone. La révision reste l'outil de la vraie
 * renégociation.
 *
 * Aucun `useTransition` ici : les écritures passent par `agir` de l'éditeur
 * (voir son commentaire — une écriture dans une transition se perd une fois sur
 * cinq, mesuré).
 * -------------------------------------------------------------------------- */

export function BlocPublication({
  entete,
  lots,
  paveClient,
  enCours,
  agir,
  onVoirLot,
}: {
  entete: DevisComplet["entete"];
  /** Les blocs, pour la récapitulation « ce que le client voit de chacun ». */
  lots: LotDevisVue[];
  /** Ce que la fiche client proposerait aujourd'hui (docs/DEVIS.md §24). */
  paveClient: string;
  enCours: boolean;
  agir: (fn: () => Promise<unknown>) => void;
  /** Sauter au bloc dans le tableau — la récapitulation sert à VÉRIFIER, on
   *  corrige là où on travaille. */
  onVoirLot: (lotId: string) => void;
}) {
  const [dureeId, setDureeId] = useState(DUREE_PARTAGE_DEVIS_DEFAUT);
  const [copie, setCopie] = useState(false);
  const [confirmeRevocation, setConfirmeRevocation] = useState(false);
  const [destinataire, setDestinataire] = useState(entete.destinataire);

  /* Le pavé s'écarte-t-il de ce que la fiche client donnerait ? C'est ce qui
     décide si « Reprendre du client » a quelque chose à faire. On compare la
     saisie EN COURS, pas ce qui est en base : le bouton doit s'allumer dès la
     première frappe qui éloigne, pas au blur. */
  const ecarteDuClient = !!paveClient && !paveReprenable(destinataire, paveClient);

  const durees = dureesPartageDevis(entete.validiteJours);
  const actif = partageActif(entete);
  const echu = !!entete.jetonPartage && !actif;
  const url = entete.jetonPartage
    ? `${typeof window === "undefined" ? "" : window.location.origin}${BASE_URL_DEVIS_PUBLIC}${entete.jetonPartage}`
    : "";

  // Le devis a-t-il bougé depuis sa publication ? La question n'a de sens que
  // pour un lien en service — c'est alors le client qui lit les modifications.
  const modifieDepuis =
    actif && entete.publieLe && entete.updatedAt.getTime() - entete.publieLe.getTime() > 60_000;

  async function copier() {
    try {
      await navigator.clipboard.writeText(url);
      setCopie(true);
      setTimeout(() => setCopie(false), 1800);
    } catch {
      /* presse-papier indisponible : le champ reste sélectionnable à la main */
    }
  }

  const etatPastille = (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-xs font-medium",
        actif ? "text-success" : echu ? "text-warning" : "text-subtle",
      )}
    >
      <span
        className={cn(
          "h-1.5 w-1.5 rounded-full",
          actif ? "bg-success" : echu ? "bg-warning" : "bg-border",
        )}
      />
      {actif ? "En ligne" : echu ? "Expiré" : "Non publié"}
    </span>
  );

  const corps = (
    <>
      {/* --- À qui ---------------------------------------------------------- */}
      <div className="border-b border-hairline px-4 py-3">
        <Label htmlFor="destinataire">Destinataire</Label>
        {/* 6 lignes, pas 4 : depuis que la fiche client pré-remplit ce pavé, il
            en fait couramment cinq (société, service, adresse, CP ville, « à
            l'attention de »). À 4, la dernière ligne — celle qui nomme la
            personne — était HORS DU CHAMP, et il fallait faire défiler pour
            voir ce qui allait s'imprimer. Vu en regardant, pas en testant. */}
        <textarea
          id="destinataire"
          rows={6}
          value={destinataire}
          disabled={enCours}
          onChange={(e) => setDestinataire(e.target.value)}
          onBlur={() => {
            if (destinataire !== entete.destinataire) {
              agir(() => majEnteteDevis(entete.id, { destinataire }));
            }
          }}
          placeholder={`${entete.clientNom || "Nom du client"}\nÀ l'attention de…\nAdresse\nCode postal Ville`}
          className="mt-1 w-full resize-y rounded-md border border-border bg-surface px-2.5 py-1.5 text-sm leading-snug text-fg outline-none focus:border-brand/50"
        />

        {/* Le référentiel PROPOSE, il n'impose pas : un pavé retapé à la main
            (un service de facturation, une TSA) ne se fait jamais écraser tout
            seul. D'où ce bouton, et lui seul, pour reprendre la fiche client.
            (docs/DEVIS.md §24) */}
        <div className="mt-1.5 flex items-start justify-between gap-2">
          <p className="min-w-0 flex-1 text-xs leading-snug text-subtle">
            {ecarteDuClient
              ? "Ce pavé s'écarte de la fiche client."
              : "Tel qu'il s'imprime, une ligne par ligne. Vide : le seul nom du client."}
          </p>
          {paveClient ? (
            <button
              type="button"
              disabled={enCours || !ecarteDuClient}
              onClick={() =>
                agir(async () => {
                  const r = await reprendreIdentiteClient(entete.id);
                  if (r.ok) setDestinataire(paveClient);
                  return r;
                })
              }
              title={
                ecarteDuClient
                  ? "Réécrire le pavé depuis la fiche du client"
                  : "Le pavé est déjà celui de la fiche client"
              }
              className="inline-flex shrink-0 items-center gap-1.5 text-xs font-medium text-brand transition-colors hover:underline disabled:cursor-default disabled:text-subtle disabled:no-underline"
            >
              <RotateCcw className="h-3.5 w-3.5" /> Reprendre du client
            </button>
          ) : (
            entete.clientId && (
              <Link
                href={`/clients/${entete.clientId}`}
                className="inline-flex shrink-0 items-center gap-1.5 text-xs font-medium text-brand hover:underline"
                title="La fiche de ce client ne porte ni adresse ni contact"
              >
                <RotateCcw className="h-3.5 w-3.5" /> Renseigner la fiche client
              </Link>
            )
          )}
        </div>
      </div>

      {/* --- Ce qu'on montre ------------------------------------------------ */}
      <div className="border-b border-hairline px-4 py-3">
        <Label>Sur le document</Label>
        <div className="mt-1 space-y-1.5">
          <Interrupteur
            libelle="Prix unitaires par ligne"
            aide="Décoché : les lignes restent listées, seul le sous-total du lot porte un prix."
            valeur={entete.montrerPrixUnitaires}
            disabled={enCours}
            onChange={(v) => agir(() => majEnteteDevis(entete.id, { montrerPrixUnitaires: v }))}
          />
          <Interrupteur
            libelle="Sous-totaux par lot"
            aide="Sans objet sur un devis d'un seul lot : il répéterait le total HT."
            valeur={entete.montrerSousTotauxLots}
            disabled={enCours}
            onChange={(v) => agir(() => majEnteteDevis(entete.id, { montrerSousTotauxLots: v }))}
          />
          <Interrupteur
            libelle="Options en fin de document"
            aide="Chiffrées à part, jamais additionnées au total."
            valeur={entete.montrerOptions}
            disabled={enCours}
            onChange={(v) => agir(() => majEnteteDevis(entete.id, { montrerOptions: v }))}
          />
          <Interrupteur
            libelle="Documentation technique"
            aide="Les fiches des produits chiffrés, en LIENS en fin de document — rien n'est joint. Un bloc forfaitaire n'en annexe aucune."
            valeur={entete.montrerDocumentations}
            disabled={enCours}
            onChange={(v) => agir(() => majEnteteDevis(entete.id, { montrerDocumentations: v }))}
          />
        </div>

        {/* LA DERNIÈRE RELECTURE AVANT D'ENVOYER. Le rendu se décide sur le bloc,
            dans le tableau, là où on travaille — mais un bloc resté détaillé par
            oubli ne se remarque qu'après le mail. Ici on les voit tous d'un coup.
            Ce n'est pas un second réglage : c'est le MÊME champ, écrit depuis
            deux écrans. */}
        {lots.length > 0 && (
          <div className="mt-3 border-t border-hairline pt-3">
            <Label>Ce que le client voit de chaque bloc</Label>
            <ul className="mt-1.5 space-y-1.5">
              {lots.map((l) => {
                const forfait = l.rendu === "CONDENSE";
                return (
                  <li key={l.id} className="text-sm">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => onVoirLot(l.id)}
                        title="Aller à ce bloc dans le chiffrage"
                        className="min-w-0 flex-1 truncate text-left font-medium text-fg transition-colors hover:text-brand"
                      >
                        {l.titre || "Bloc sans nom"}
                      </button>
                      <span className="flex shrink-0 items-center gap-1">
                        {(["DETAILLE", "CONDENSE"] as const).map((r) => (
                          <button
                            key={r}
                            type="button"
                            disabled={enCours}
                            aria-pressed={l.rendu === r}
                            onClick={() => agir(() => majLot(l.id, { rendu: r }))}
                            className={cn(
                              "px-1.5 py-0.5 text-[0.68rem] font-semibold uppercase tracking-wide transition-colors",
                              l.rendu === r
                                ? "bg-brand/12 text-brand"
                                : "text-subtle hover:text-fg",
                            )}
                          >
                            {r === "CONDENSE" ? "forfait" : "détaillé"}
                          </button>
                        ))}
                      </span>
                    </div>
                    {forfait && (
                      <p className="mt-0.5 truncate pl-0.5 text-xs text-subtle">
                        →{" "}
                        {l.libelleClient.trim().split("\n")[0] || (
                          <i>sa phrase n&apos;est pas écrite — le titre du bloc servira</i>
                        )}
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>


      {/* --- Le lien -------------------------------------------------------- */}
      <div className="px-4 py-3">
        {!entete.jetonPartage ? (
          <>
            <Label htmlFor="duree-partage">Durée du lien</Label>
            <div className="mt-1 flex gap-2">
              <select
                id="duree-partage"
                value={dureeId}
                onChange={(e) => setDureeId(e.target.value)}
                className="h-[var(--control-h)] min-w-0 flex-1 rounded-md border border-border bg-surface px-2 text-sm text-fg outline-none"
              >
                {durees.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.libelle}
                  </option>
                ))}
              </select>
              <Button
                variant="primary"
                disabled={enCours}
                onClick={() => agir(() => publierDevis(entete.id, dureeId))}
              >
                <Globe className="h-4 w-4" /> Publier
              </Button>
            </div>
            <p className="mt-1.5 text-xs text-subtle">
              Publier pose un lien à envoyer au client et passe le devis en « Émis ».
            </p>
          </>
        ) : (
          <>
            <div className="flex gap-1.5">
              <input
                readOnly
                value={url}
                onFocus={(e) => e.currentTarget.select()}
                className="min-w-0 flex-1 rounded-md border border-border bg-surface-2 px-2 py-1.5 font-mono text-xs text-muted outline-none"
                aria-label="Lien du devis"
              />
              <button
                type="button"
                onClick={copier}
                title="Copier le lien"
                className="press shrink-0 rounded-md border border-border px-2 text-muted transition-colors hover:border-brand/50 hover:text-brand"
              >
                {copie ? (
                  <Check className="h-4 w-4 text-success" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </button>
              <a
                href={url}
                target="_blank"
                rel="noreferrer"
                title="Ouvrir le lien"
                className="press shrink-0 rounded-md border border-border px-2 py-1.5 text-muted transition-colors hover:border-brand/50 hover:text-brand"
              >
                <ExternalLink className="h-4 w-4" />
              </a>
            </div>

            <p className="mt-2 flex items-center gap-1.5 text-xs text-muted">
              <Clock className="h-3.5 w-3.5 shrink-0 text-subtle" />
              {libelleEcheance(entete.partageExpireLe)}
            </p>

            {/* Le PDF passe par le lien public : c'est la MÊME page, imprimée par
                un navigateur côté serveur. Pas de second document à tenir. */}
            <a
              href={`/api/public/devis/${entete.jetonPartage}/pdf`}
              className="press mt-2 inline-flex h-[var(--control-h)] w-full items-center justify-center gap-2 rounded-md border border-border bg-surface px-4 text-sm font-medium text-fg transition-[background-color,border-color] duration-150 hover:border-brand/45 hover:bg-surface-2"
            >
              <FileDown className="h-4 w-4" /> Télécharger le PDF
            </a>

            {modifieDepuis && (
              <p className="mt-2 border border-warning/40 bg-warning/10 px-2.5 py-2 text-xs text-fg">
                Ce devis a été modifié depuis sa publication. Le lien montre l&apos;état actuel —
                donc le client voit ces modifications. Pour garder une trace de ce qui avait été
                envoyé, faire une <strong>nouvelle révision</strong> plutôt que corriger celle-ci.
              </p>
            )}

            <div className="mt-2 flex flex-wrap items-center gap-2">
              <select
                value={dureeId}
                onChange={(e) => setDureeId(e.target.value)}
                aria-label="Nouvelle durée"
                className="h-8 min-w-0 flex-1 rounded-md border border-border bg-surface px-2 text-xs text-fg outline-none"
              >
                {durees.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.libelle}
                  </option>
                ))}
              </select>
              <Button
                size="sm"
                variant="outline"
                disabled={enCours}
                onClick={() => agir(() => prolongerPartageDevis(entete.id, dureeId))}
                title="Repousser l'échéance sans changer le lien déjà envoyé"
              >
                Prolonger
              </Button>
            </div>

            {/* La révocation est la seule action irréversible du bloc : le lien
                distribué meurt pour tout le monde, et republier en donnera un
                autre. D'où les deux temps. */}
            {confirmeRevocation ? (
              <div className="mt-2 border border-danger/40 bg-danger/10 p-2.5 text-sm">
                <p className="mb-2 text-fg">
                  Couper le lien ? Le client ne pourra plus ouvrir le devis, et republier
                  donnera une autre adresse.
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="danger"
                    size="sm"
                    disabled={enCours}
                    onClick={() => {
                      setConfirmeRevocation(false);
                      agir(() => revoquerPartageDevis(entete.id));
                    }}
                  >
                    Couper le lien
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setConfirmeRevocation(false)}>
                    Annuler
                  </Button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmeRevocation(true)}
                className="mt-2 inline-flex items-center gap-1.5 text-xs text-muted transition-colors hover:text-danger"
              >
                <Ban className="h-3.5 w-3.5" /> Couper le lien
              </button>
            )}
          </>
        )}

        {/* --- Le journal ---------------------------------------------------- */}
        <p className="mt-3 border-t border-hairline pt-2 text-xs">
          {entete.nbConsultations === 0 ? (
            <span className="text-subtle">
              {entete.jetonPartage
                ? "Jamais ouvert par le client."
                : "Aucune consultation — le devis n'est pas publié."}
            </span>
          ) : (
            <span className="text-muted">
              Ouvert <strong className="text-fg">{entete.nbConsultations} fois</strong>
              {entete.derniereConsultation && (
                <>
                  {" "}
                  — dernière le{" "}
                  <strong className="text-fg">
                    {entete.derniereConsultation.toLocaleDateString("fr-FR", {
                      day: "2-digit",
                      month: "2-digit",
                    })}{" "}
                    à{" "}
                    {entete.derniereConsultation.toLocaleTimeString("fr-FR", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </strong>
                </>
              )}
            </span>
          )}
        </p>
      </div>
    </>
  );

  /* Pas de cadre ni d'entête de bloc : c'est le panneau à onglets qui les
     porte. Un `.bloc` dans un `.bloc` ferait deux filets pour une seule idée.
     L'aperçu client n'est pas ici non plus — la barre de devis le propose. */
  return (
    <div>
      <div className="flex items-center justify-between gap-2 border-b border-hairline px-4 py-2">
        <span className="stamp">Ce que le client voit</span>
        {etatPastille}
      </div>
      {corps}
    </div>
  );
}

function Interrupteur({
  libelle,
  aide,
  valeur,
  disabled,
  onChange,
}: {
  libelle: string;
  aide: string;
  valeur: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-2 text-sm text-fg" title={aide}>
      <input
        type="checkbox"
        checked={valeur}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--brand)]"
      />
      <span className="min-w-0">{libelle}</span>
    </label>
  );
}
