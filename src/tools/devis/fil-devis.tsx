"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Ban,
  CheckCheck,
  Clock,
  Eye,
  FileDown,
  FolderUp,
  GitBranch,
  Globe,
  Loader2,
  MessageSquare,
  Paperclip,
  Pencil,
  Pin,
  PinOff,
  Send,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { Button, Kbd } from "@/ui";
import { cn } from "@/lib/cn";
import {
  epinglerMessage,
  marquerFilLu,
  modifierMessage,
  posterMessage,
  supprimerMessage,
  verserPieceAuGed,
} from "./actions";
import {
  LONGUEUR_MAX_MESSAGE,
  TAILLE_MAX_MEDIA_DEVIS,
  estFait,
  formatTaille,
  urlMediaDevis,
  type EntreeFil,
  type FilDevis,
  type GenreEntreeFil,
  type PieceFilVue,
} from "./model";

/* =============================================================================
 * LE FIL DU DEVIS — la mémoire de ce qui s'est dit autour du chiffrage
 *
 * Cadrage : docs/DEVIS-FIL.md. Trois choses à savoir avant de lire :
 *
 *  1. DEUX NATURES, UNE COLONNE DE TEMPS. Les FAITS (créé, émis, publié, ouvert
 *     par le client, révision) ne sont écrits nulle part : ils se déduisent de
 *     ce que le modèle retenait déjà. Les MESSAGES, eux, s'écrivent. Le fil les
 *     mêle par ordre chronologique — c'est le seul ordre qui raconte quelque
 *     chose.
 *
 *  2. AUCUN `revalidatePath` CÔTÉ ACTION, donc CET ÉCRAN AFFICHE SON PROPRE
 *     ÉTAT (règle du §14.3 de DEVIS.md). Il garde la liste qu'il a reçue et y
 *     ajoute ce qu'il vient d'écrire ; le serveur ne reprend la main qu'au
 *     prochain chargement de page. Sans ça, poster un message rejouerait les
 *     trois pièges mesurés au §20 (réponse perdue une fois sur cinq).
 *
 *  3. CE FIL NE VIENT PAS TE CHERCHER. Il n'y a pas d'e-mail dans la
 *     plateforme — ni SMTP, ni service d'envoi. Il se CONSULTE quand on ouvre
 *     le devis. Dessiner une boîte de réception qui ne sonnera jamais aurait
 *     été la première erreur.
 * ========================================================================== */

/** Ce que chaque genre d'entrée montre : une icône, un mot, un ton. */
const FAITS: Record<
  Exclude<GenreEntreeFil, "message">,
  { icone: typeof Clock; libelle: string; ton?: string }
> = {
  cree: { icone: Sparkles, libelle: "Devis créé" },
  revision: { icone: GitBranch, libelle: "Révision créée" },
  emis: { icone: Send, libelle: "Émis au client" },
  publie: { icone: Globe, libelle: "Lien publié" },
  consultation: { icone: Eye, libelle: "Ouvert par le client" },
  accepte: { icone: CheckCheck, libelle: "Accepté par le client", ton: "text-success" },
  refuse: { icone: Ban, libelle: "Refusé", ton: "text-danger" },
  rouvert: { icone: Clock, libelle: "Remis en chiffrage" },
};

function heure(d: Date): string {
  return d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

function jour(d: Date): string {
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" });
}

export function FilDevisPanneau({
  devisId,
  fil,
  moiId,
  moiNom,
  aUneAffaire,
}: {
  devisId: string;
  fil: FilDevis;
  moiId: string;
  /** Pour peindre le message qu'on vient d'écrire à SON nom : l'action ne
   *  renvoie que l'id, et « Quelqu'un » le temps d'un rechargement se lit
   *  comme un bug. */
  moiNom: string;
  /** Sans affaire, il n'y a nulle part où verser une pièce : le bouton
   *  n'existe pas (docs/DEVIS-FIL.md §8.1). */
  aUneAffaire: boolean;
}) {
  /* L'état vient du serveur au chargement, puis c'est l'écran qui le tient. */
  const [entrees, setEntrees] = useState<EntreeFil[]>(fil.entrees);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);
  const bas = useRef<HTMLDivElement | null>(null);

  /* L'onglet est ouvert : c'est MAINTENANT qu'on a lu. Ouvrir un devis pour
     corriger un prix ne vaut pas une lecture — d'où l'effet ici, dans le
     panneau, et non dans la page. */
  useEffect(() => {
    marquerFilLu(devisId).catch(() => {});
  }, [devisId]);

  /* On arrive en bas du fil : le plus récent est ce qu'on vient lire. */
  useEffect(() => {
    bas.current?.scrollIntoView({ block: "end" });
  }, []);

  const epingles = useMemo(() => entrees.filter((e) => e.epingle), [entrees]);

  async function agir<T>(fn: () => Promise<T>): Promise<T | null> {
    setErreur(null);
    setEnCours(true);
    try {
      return await fn();
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Opération impossible");
      return null;
    } finally {
      setEnCours(false);
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {epingles.length > 0 && (
        <div className="shrink-0 border-b border-hairline bg-accent-soft/50 px-3 py-2">
          <p className="stamp mb-1">Épinglé</p>
          {epingles.map((e) => (
            <p key={e.id} className="line-clamp-2 text-xs leading-snug text-fg">
              {e.corps}
            </p>
          ))}
        </div>
      )}

      {/* LA seule zone qui défile dans ce panneau — le composeur reste en bas. */}
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-3">
        {entrees.length === 0 ? (
          <p className="py-6 text-center text-xs leading-relaxed text-subtle">
            Rien encore. Ce fil garde ce qui entoure le chiffrage — ce que le client
            demande, un délai d&apos;approvisionnement, le bon de commande signé.
          </p>
        ) : (
          <Journal
            entrees={entrees}
            moiId={moiId}
            enCours={enCours}
            aUneAffaire={aUneAffaire}
            onModifier={(id, corps) =>
              agir(async () => {
                await modifierMessage(id, corps);
                setEntrees((xs) =>
                  xs.map((x) =>
                    x.id === id ? { ...x, corps, modifieLe: new Date() } : x,
                  ),
                );
              })
            }
            onSupprimer={(id) =>
              agir(async () => {
                await supprimerMessage(id);
                setEntrees((xs) => xs.filter((x) => x.id !== id));
              })
            }
            onEpingler={(id, v) =>
              agir(async () => {
                await epinglerMessage(id, v);
                setEntrees((xs) => xs.map((x) => (x.id === id ? { ...x, epingle: v } : x)));
              })
            }
            onVerser={(pieceId) =>
              agir(async () => {
                const r = await verserPieceAuGed(pieceId);
                if ("doublon" in r) {
                  const quoi = window.confirm(
                    `« ${r.nom} » existe déjà dans cette catégorie.\n\nOK = écraser (nouvelle version), Annuler = renommer.`,
                  );
                  await verserPieceAuGed(pieceId, {
                    mode: quoi ? "ecraser" : "renommer",
                  });
                }
                setEntrees((xs) =>
                  xs.map((x) => ({
                    ...x,
                    pieces: x.pieces.map((p) =>
                      p.id === pieceId ? { ...p, verseeLe: new Date() } : p,
                    ),
                  })),
                );
              })
            }
          />
        )}
        <div ref={bas} />
      </div>

      {erreur && (
        <p className="shrink-0 border-t border-danger/40 bg-danger/10 px-3 py-1.5 text-xs text-danger">
          {erreur}
        </p>
      )}

      <Composeur
        devisId={devisId}
        moiId={moiId}
        moiNom={moiNom}
        enCours={enCours}
        onErreur={setErreur}
        onPoste={(entree) => setEntrees((xs) => [...xs, entree])}
      />
    </div>
  );
}

/* -----------------------------------------------------------------------------
 * LE JOURNAL — les entrées, groupées par jour
 * -------------------------------------------------------------------------- */

function Journal({
  entrees,
  moiId,
  enCours,
  aUneAffaire,
  onModifier,
  onSupprimer,
  onEpingler,
  onVerser,
}: {
  entrees: EntreeFil[];
  moiId: string;
  enCours: boolean;
  aUneAffaire: boolean;
  onModifier: (id: string, corps: string) => void;
  onSupprimer: (id: string) => void;
  onEpingler: (id: string, v: boolean) => void;
  onVerser: (pieceId: string) => void;
}) {
  /* Le séparateur de jour vaut mieux que la date sur chaque ligne : dans une
     colonne de 300 px, « 10 août 2026 » répété douze fois mange le texte.
     Le découpage se fait AVANT le rendu — une variable qu'on réassigne dans un
     `map()` de JSX est un état caché, et le lint a raison de le refuser. */
  const avecJour = entrees.map((e, i) => ({
    entree: e,
    jour: i === 0 || jour(e.quand) !== jour(entrees[i - 1].quand) ? jour(e.quand) : null,
  }));

  return (
    <div className="space-y-2">
      {avecJour.map(({ entree: e, jour: separateur }) => {
        const nouveauJour = separateur !== null;
        return (
          <div key={e.id}>
            {nouveauJour && (
              <p className="stamp my-2 flex items-center gap-2">
                <span aria-hidden className="h-px flex-1 bg-hairline" />
                {separateur}
                <span aria-hidden className="h-px flex-1 bg-hairline" />
              </p>
            )}
            {estFait(e.genre) ? (
              <Fait entree={e} />
            ) : (
              <Message
                entree={e}
                mien={e.auteurId === moiId}
                enCours={enCours}
                aUneAffaire={aUneAffaire}
                onModifier={onModifier}
                onSupprimer={onSupprimer}
                onEpingler={onEpingler}
                onVerser={onVerser}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Un fait : une ligne, discrète. Il ne se modifie pas — il s'est produit. */
function Fait({ entree }: { entree: EntreeFil }) {
  const def = FAITS[entree.genre as Exclude<GenreEntreeFil, "message">];
  if (!def) return null;
  const Icone = def.icone;
  return (
    <p className="flex items-baseline gap-2 py-0.5 text-xs text-subtle">
      <Icone className={cn("mt-0.5 h-3.5 w-3.5 shrink-0", def.ton ?? "text-subtle")} />
      <span className={cn("min-w-0 flex-1", def.ton)}>
        {def.libelle}
        {entree.detail && <span className="text-subtle"> · {entree.detail}</span>}
        {entree.auteur && <span className="text-subtle"> · {entree.auteur}</span>}
      </span>
      {entree.revision !== null && <span className="ref shrink-0">v{entree.revision}</span>}
      <span className="ref shrink-0 tabular-nums">{heure(entree.quand)}</span>
    </p>
  );
}

/* -----------------------------------------------------------------------------
 * UN MESSAGE
 * -------------------------------------------------------------------------- */

function Message({
  entree,
  mien,
  enCours,
  aUneAffaire,
  onModifier,
  onSupprimer,
  onEpingler,
  onVerser,
}: {
  entree: EntreeFil;
  mien: boolean;
  enCours: boolean;
  aUneAffaire: boolean;
  onModifier: (id: string, corps: string) => void;
  onSupprimer: (id: string) => void;
  onEpingler: (id: string, v: boolean) => void;
  onVerser: (pieceId: string) => void;
}) {
  const [edition, setEdition] = useState<string | null>(null);
  const [confirme, setConfirme] = useState(false);

  return (
    <div className="group/msg border border-hairline bg-surface px-2.5 py-2">
      <div className="flex items-baseline gap-2">
        <span className="min-w-0 truncate text-xs font-semibold text-fg">
          {entree.auteur ?? "Quelqu'un"}
        </span>
        <span className="ref shrink-0 text-[0.65rem] text-subtle">{heure(entree.quand)}</span>
        {entree.modifieLe && (
          <span className="shrink-0 text-[0.65rem] text-subtle" title="Modifié depuis">
            modifié
          </span>
        )}
        {entree.revision !== null ? (
          <span className="ref shrink-0 text-[0.65rem] text-subtle">v{entree.revision}</span>
        ) : (
          <span
            className="shrink-0 text-[0.65rem] text-subtle"
            title="La version d'où ce message a été écrit a été supprimée — la conversation, elle, reste"
          >
            version supprimée
          </span>
        )}

        <span className="actions-rangee ml-auto flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover/msg:opacity-100 focus-within:opacity-100">
          <button
            type="button"
            disabled={enCours}
            title={entree.epingle ? "Détacher" : "Épingler en tête du fil"}
            onClick={() => onEpingler(entree.id, !entree.epingle)}
            className={cn(
              "p-0.5 transition-colors hover:text-accent",
              entree.epingle ? "text-accent" : "text-subtle",
            )}
          >
            {entree.epingle ? <PinOff className="h-3 w-3" /> : <Pin className="h-3 w-3" />}
          </button>
          {mien && (
            <button
              type="button"
              disabled={enCours}
              title="Modifier"
              onClick={() => setEdition(entree.corps)}
              className="p-0.5 text-subtle transition-colors hover:text-fg"
            >
              <Pencil className="h-3 w-3" />
            </button>
          )}
          <button
            type="button"
            disabled={enCours}
            title="Supprimer"
            onClick={() => setConfirme(true)}
            className="p-0.5 text-subtle transition-colors hover:text-danger"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </span>
      </div>

      {confirme ? (
        <div className="mt-1.5 border border-danger/40 bg-danger/10 p-2 text-xs">
          <p className="mb-1.5 text-fg">Supprimer ce message ? Ses pièces partent avec.</p>
          <div className="flex gap-1.5">
            <Button variant="danger" size="sm" disabled={enCours} onClick={() => onSupprimer(entree.id)}>
              Supprimer
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setConfirme(false)}>
              Annuler
            </Button>
          </div>
        </div>
      ) : edition !== null ? (
        <div className="mt-1.5">
          <textarea
            autoFocus
            rows={3}
            value={edition}
            maxLength={LONGUEUR_MAX_MESSAGE}
            onChange={(ev) => setEdition(ev.target.value)}
            onKeyDown={(ev) => {
              if (ev.key === "Escape") setEdition(null);
              if (ev.key === "Enter" && !ev.shiftKey) {
                ev.preventDefault();
                if (edition.trim()) onModifier(entree.id, edition.trim());
                setEdition(null);
              }
            }}
            className="w-full resize-y rounded-md border border-border bg-surface px-2 py-1.5 text-sm leading-snug text-fg outline-none focus:border-brand/50"
          />
          <div className="mt-1 flex gap-1.5">
            <Button
              size="sm"
              disabled={enCours || !edition.trim()}
              onClick={() => {
                onModifier(entree.id, edition.trim());
                setEdition(null);
              }}
            >
              Enregistrer
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEdition(null)}>
              Annuler
            </Button>
          </div>
        </div>
      ) : (
        entree.corps && (
          <p className="mt-0.5 whitespace-pre-wrap break-words text-sm leading-snug text-fg">
            {entree.corps}
          </p>
        )
      )}

      {entree.pieces.length > 0 && (
        <div className="mt-1.5 space-y-1">
          {entree.pieces.map((p) => (
            <Piece
              key={p.id}
              piece={p}
              enCours={enCours}
              aUneAffaire={aUneAffaire}
              onVerser={onVerser}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/** Une pièce jointe — vignette pour une image, ligne de fichier sinon. */
function Piece({
  piece,
  enCours,
  aUneAffaire,
  onVerser,
}: {
  piece: PieceFilVue;
  enCours: boolean;
  aUneAffaire: boolean;
  onVerser: (id: string) => void;
}) {
  const url = urlMediaDevis(piece.id);
  const image = piece.mimeType.startsWith("image/");

  return (
    <div className="border border-hairline bg-surface-2">
      {image && (
        <a href={url} target="_blank" rel="noreferrer" className="block">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={url}
            alt={piece.nom}
            className="max-h-40 w-full object-contain"
            loading="lazy"
          />
        </a>
      )}
      <div className="flex items-center gap-1.5 px-2 py-1">
        <Paperclip className="h-3 w-3 shrink-0 text-subtle" />
        <span className="min-w-0 flex-1 truncate text-[0.7rem] text-muted" title={piece.nom}>
          {piece.nom}
        </span>
        <span className="ref shrink-0 text-[0.65rem] text-subtle">
          {formatTaille(piece.taille)}
        </span>
        <a
          href={`${url}?dl=1`}
          title="Télécharger"
          className="press shrink-0 p-0.5 text-subtle transition-colors hover:text-brand"
        >
          <FileDown className="h-3 w-3" />
        </a>
        {/* Le versement COPIE, il ne déplace pas : la pièce reste dans le fil.
            Sans affaire il n'y a nulle part où verser — pas de bouton mort qui
            explique son échec après le clic. */}
        {piece.verseeLe ? (
          <span
            className="shrink-0 text-[0.65rem] text-success"
            title={`Versée dans la GED de l'affaire le ${jour(piece.verseeLe)} — en attente de kDrive`}
          >
            versée
          </span>
        ) : aUneAffaire ? (
          <button
            type="button"
            disabled={enCours}
            title="Verser dans les Documents de l'affaire (catégorie Vente)"
            onClick={() => onVerser(piece.id)}
            className="press shrink-0 p-0.5 text-subtle transition-colors hover:text-brand"
          >
            <FolderUp className="h-3 w-3" />
          </button>
        ) : null}
      </div>
    </div>
  );
}

/* -----------------------------------------------------------------------------
 * LE COMPOSEUR — collé en bas
 * -------------------------------------------------------------------------- */

function Composeur({
  devisId,
  moiId,
  moiNom,
  enCours,
  onErreur,
  onPoste,
}: {
  devisId: string;
  moiId: string;
  moiNom: string;
  enCours: boolean;
  onErreur: (m: string | null) => void;
  onPoste: (e: EntreeFil) => void;
}) {
  const [corps, setCorps] = useState("");
  const [jointes, setJointes] = useState<PieceFilVue[]>([]);
  const [envoi, setEnvoi] = useState(false);
  const [depot, setDepot] = useState(false);
  const champ = useRef<HTMLTextAreaElement | null>(null);
  const fichier = useRef<HTMLInputElement | null>(null);

  /** Le téléversement précède le message : la route média crée la pièce
   *  rattachée au DEVIS, `posterMessage` la raccroche ensuite. */
  async function televerser(fichiers: File[]) {
    const retenus = fichiers.filter((f) => f.size <= TAILLE_MAX_MEDIA_DEVIS);
    if (retenus.length < fichiers.length) {
      onErreur(`Pièce trop lourde (max ${formatTaille(TAILLE_MAX_MEDIA_DEVIS)})`);
    }
    if (retenus.length === 0) return;
    setDepot(true);
    try {
      for (const f of retenus) {
        /* ⚠️ L'ID EST TIRÉ ICI et voyage avec l'envoi : la route média est
           IDEMPOTENTE PAR UUID — c'est le client qui le fournit, et re-tenter
           un téléversement interrompu ne duplique donc jamais. Elle répond
           `{ ok: true }`, pas l'id : le connaître d'avance est justement ce qui
           permet de le réutiliser. (Même geste que `texte-riche-impl`.) */
        const mediaId = crypto.randomUUID();
        const form = new FormData();
        form.set("mediaId", mediaId);
        form.set("devisId", devisId);
        form.set("file", f, f.name);
        const res = await fetch("/api/devis/media", { method: "POST", body: form });
        if (!res.ok) {
          const corps = (await res.json().catch(() => null)) as { error?: string } | null;
          throw new Error(corps?.error ?? "Téléversement impossible");
        }
        setJointes((xs) => [
          ...xs,
          {
            id: mediaId,
            nom: f.name,
            mimeType: f.type || "application/octet-stream",
            taille: f.size,
            verseeLe: null,
          },
        ]);
      }
      onErreur(null);
    } catch (e) {
      onErreur(e instanceof Error ? e.message : "Téléversement impossible");
    } finally {
      setDepot(false);
    }
  }

  async function envoyer() {
    const t = corps.trim();
    if (!t && jointes.length === 0) return;
    setEnvoi(true);
    try {
      const { id } = await posterMessage(devisId, {
        corps: t,
        pieces: jointes.map((p) => p.id),
      });
      // On peint le message localement : aucune action du fil n'invalide
      // l'écran, c'est donc à lui d'afficher ce qu'il vient d'écrire.
      onPoste({
        id,
        genre: "message",
        quand: new Date(),
        corps: t,
        auteur: moiNom,
        auteurId: moiId,
        epingle: false,
        modifieLe: null,
        revision: null,
        detail: null,
        pieces: jointes,
      });
      setCorps("");
      setJointes([]);
      onErreur(null);
    } catch (e) {
      onErreur(e instanceof Error ? e.message : "Envoi impossible");
    } finally {
      setEnvoi(false);
    }
  }

  const occupe = enCours || envoi || depot;

  return (
    <div
      className="shrink-0 border-t border-hairline bg-surface-2 px-3 py-2"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        const fs = Array.from(e.dataTransfer.files);
        if (fs.length > 0) televerser(fs);
      }}
    >
      {jointes.length > 0 && (
        <div className="mb-1.5 flex flex-wrap gap-1">
          {jointes.map((p) => (
            <span
              key={p.id}
              className="inline-flex max-w-full items-center gap-1 border border-border bg-surface px-1.5 py-0.5 text-[0.7rem] text-muted"
            >
              <Paperclip className="h-3 w-3 shrink-0" />
              <span className="min-w-0 truncate">{p.nom}</span>
              <button
                type="button"
                title="Retirer"
                onClick={() => setJointes((xs) => xs.filter((x) => x.id !== p.id))}
                className="shrink-0 text-subtle hover:text-danger"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      <textarea
        ref={champ}
        rows={2}
        value={corps}
        disabled={occupe}
        maxLength={LONGUEUR_MAX_MESSAGE}
        placeholder="Ce que le client a dit, un délai, une décision…"
        onChange={(e) => setCorps(e.target.value)}
        onPaste={(e) => {
          // Coller une capture d'écran est le geste le plus courant : on ne
          // demande pas d'ouvrir un sélecteur de fichier pour ça.
          const fs = Array.from(e.clipboardData.files);
          if (fs.length > 0) {
            e.preventDefault();
            televerser(fs);
          }
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            envoyer();
          }
        }}
        className="w-full resize-y rounded-md border border-border bg-surface px-2.5 py-1.5 text-sm leading-snug text-fg outline-none focus:border-brand/50"
      />

      <div className="mt-1.5 flex items-center gap-2">
        <input
          ref={fichier}
          type="file"
          multiple
          hidden
          onChange={(e) => {
            const fs = Array.from(e.target.files ?? []);
            if (fs.length > 0) televerser(fs);
            e.target.value = "";
          }}
        />
        <button
          type="button"
          disabled={occupe}
          onClick={() => fichier.current?.click()}
          title="Joindre un fichier — on peut aussi coller une image ou en déposer une ici"
          className="press p-1 text-subtle transition-colors hover:text-brand"
        >
          {depot ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Paperclip className="h-4 w-4" />
          )}
        </button>
        <span className="min-w-0 flex-1 truncate text-[0.65rem] text-subtle">
          <Kbd>Entrée</Kbd> envoie · <Kbd>Maj+Entrée</Kbd> saute une ligne
        </span>
        <Button
          size="sm"
          disabled={occupe || (!corps.trim() && jointes.length === 0)}
          onClick={envoyer}
        >
          <MessageSquare className="h-3.5 w-3.5" /> Envoyer
        </Button>
      </div>
    </div>
  );
}
