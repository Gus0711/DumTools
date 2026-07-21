"use client";

// Fiche RÉPONSE — refonte « document ». En haut : un bandeau d'en-tête thémé
// (logo Dumortier, formulaire, titre, méta) pour la lecture à l'écran. En
// dessous : la « feuille » claire où chaque champ est un BLOC indivisible
// (`data-bloc`) — c'est ce que capture le moteur PDF (pdf-reponse.ts), qui
// rajoute par-dessus un en-tête + un pied vectoriels. La feuille est en couleurs
// claires explicites (indépendantes du thème) → PDF propre en mode sombre.

/* eslint-disable @next/next/no-img-element */
import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Briefcase,
  Calendar,
  Download,
  Loader2,
  MapPin,
  Navigation,
  Paperclip,
  Trash2,
  UserRound,
} from "lucide-react";
import { Button } from "@/ui";
import { genererReponsePdf } from "./pdf-reponse";
import type { MetaReponse } from "./pdf-reponse";
import { supprimerReponse } from "./actions";
import {
  champVisible,
  estPresentation,
  lienGoogleMaps,
  lienWaze,
} from "./model";
import type {
  ChampDef,
  MediaMeta,
  PositionGps,
  RefValue,
  ValeurChamp,
} from "./model";
import type { ReponseDetail } from "./queries";

const dateFr = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "long",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});
const dateSeule = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "long",
  year: "numeric",
});

// Surface « papier » : couleurs explicites (le PDF ne doit pas hériter du thème).
const ENCRE = "#111827";
const GRIS = "#6b7280";
const TRAIT = "#e5e7eb";

export function ReponseVue({
  qui,
  reponse,
  estAdmin,
}: {
  qui: string;
  reponse: ReponseDetail;
  /** ADMIN : peut supprimer. Membre : consultation seule (réponse figée). */
  estAdmin: boolean;
}) {
  const router = useRouter();
  const ficheRef = useRef<HTMLDivElement | null>(null);
  const [pdf, setPdf] = useState(false);
  const [confirm, setConfirm] = useState(false);

  const { schemaSnapshot, valeurs } = reponse.data;
  const lienReponses = `/perso/${qui}/formulaires/${reponse.formulaireId}/reponses`;

  const visibles = useMemo(
    () => schemaSnapshot.filter((c) => champVisible(c, valeurs)),
    [schemaSnapshot, valeurs],
  );

  // Affaire liée (premier champ « référence » renseigné) — pour la méta + le PDF.
  const affaire = useMemo(() => {
    for (const c of schemaSnapshot) {
      if (c.type === "reference") {
        const v = valeurs[c.id];
        if (v && typeof v === "object" && "label" in v) return (v as RefValue).label;
      }
    }
    return null;
  }, [schemaSnapshot, valeurs]);

  const nbPieces = reponse.data.medias.length;

  async function telechargerPdf() {
    if (!ficheRef.current) return;
    setPdf(true);
    try {
      const meta: MetaReponse = {
        formulaireNom: reponse.formulaireNom,
        titre: reponse.titre,
        auteur: reponse.auteur,
        dateStr: dateFr.format(new Date(reponse.createdAt)),
        affaire,
      };
      const blob = await genererReponsePdf(ficheRef.current, meta);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${(reponse.titre || reponse.formulaireNom).slice(0, 60)}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setPdf(false);
    }
  }

  async function supprimer() {
    setConfirm(false);
    await supprimerReponse(reponse.id);
    router.push(lienReponses);
    router.refresh();
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 md:px-8">
      {/* ---- barre d'actions ---- */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Link
          href={lienReponses}
          className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-fg"
        >
          <ArrowLeft className="h-4 w-4" /> Réponses
        </Link>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={telechargerPdf} disabled={pdf}>
            {pdf ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            PDF
          </Button>
          {estAdmin &&
            (confirm ? (
              <span className="flex items-center gap-1 text-xs">
                <button
                  onClick={supprimer}
                  className="rounded px-2 py-1 font-medium text-danger hover:bg-danger/10"
                >
                  Supprimer
                </button>
                <button
                  onClick={() => setConfirm(false)}
                  className="rounded px-2 py-1 text-muted hover:bg-surface-2"
                >
                  Annuler
                </button>
              </span>
            ) : (
              <button
                onClick={() => setConfirm(true)}
                title="Supprimer la réponse"
                className="rounded-md p-2 text-subtle hover:bg-danger/10 hover:text-danger"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            ))}
        </div>
      </div>

      {/* ---- en-tête de document (thémé, non capturé) ---- */}
      <div className="mb-4 flex items-start gap-4 rounded-xl border border-border bg-surface p-5 shadow-sm">
        <span className="hidden shrink-0 items-center rounded-lg bg-white p-1.5 shadow-sm ring-1 ring-black/5 sm:flex">
          <img
            src="/logo-dumortier.png"
            alt="Dumortier Groupe Fareneït"
            className="h-9 w-auto"
          />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-subtle">
            {reponse.formulaireNom}
          </p>
          <h1 className="mt-0.5 font-display text-xl font-bold tracking-tight text-fg">
            {reponse.titre || "Réponse sans titre"}
          </h1>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {reponse.auteur && <Chip icon={UserRound}>{reponse.auteur}</Chip>}
            <Chip icon={Calendar}>{dateFr.format(new Date(reponse.createdAt))}</Chip>
            {affaire && <Chip icon={Briefcase}>{affaire}</Chip>}
            {nbPieces > 0 && (
              <Chip icon={Paperclip}>
                {nbPieces} pièce{nbPieces > 1 ? "s" : ""}
              </Chip>
            )}
          </div>
        </div>
      </div>

      {/* ---- la « feuille » : blocs capturés un par un pour le PDF ---- */}
      <div
        ref={ficheRef}
        style={{ background: "#ffffff", color: ENCRE }}
        className="rounded-xl border border-border p-6 shadow-sm md:p-8"
      >
        {visibles.length === 0 ? (
          <p style={{ color: GRIS }} className="text-sm">
            (Aucun champ dans cette réponse.)
          </p>
        ) : (
          <div className="space-y-1">
            {visibles.map((champ) => {
              const v = valeurs[champ.id] ?? null;
              // Rend le bloc GPS cliquable dans le PDF (annotation de lien).
              const gpsUrl =
                champ.type === "gps" && v && typeof v === "object" && "lat" in v
                  ? lienGoogleMaps((v as PositionGps).lat, (v as PositionGps).lng)
                  : undefined;
              return (
                <div
                  key={champ.id}
                  data-bloc
                  data-gps-url={gpsUrl}
                  style={{ color: ENCRE, borderBottom: `1px solid ${TRAIT}` }}
                  className="py-3.5"
                >
                  {estPresentation(champ.type) ? (
                    <PresentationVue champ={champ} />
                  ) : (
                    <>
                      <div
                        className="mb-1 text-xs font-semibold uppercase tracking-wide"
                        style={{ color: GRIS }}
                      >
                        {champ.libelle || "Sans libellé"}
                      </div>
                      <div style={{ color: ENCRE }}>
                        <Valeur
                          champ={champ}
                          valeur={v}
                          medias={reponse.data.medias}
                        />
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function Chip({
  icon: Icon,
  children,
}: {
  icon: typeof Calendar;
  children: React.ReactNode;
}) {
  return (
    <span className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-border bg-surface-2 px-2.5 py-1 text-xs text-muted">
      <Icon className="h-3.5 w-3.5 shrink-0 text-subtle" />
      <span className="truncate">{children}</span>
    </span>
  );
}

function Valeur({
  champ,
  valeur,
  medias,
}: {
  champ: ChampDef;
  valeur: ValeurChamp;
  medias: MediaMeta[];
}) {
  const vide = <span style={{ color: "#9ca3af" }}>—</span>;

  switch (champ.type) {
    case "texte":
      return typeof valeur === "string" && valeur.trim() ? (
        <span className="text-sm">{valeur}</span>
      ) : (
        vide
      );

    case "texteLong":
      return typeof valeur === "string" && valeur.trim() ? (
        <p className="whitespace-pre-wrap text-sm leading-relaxed">{valeur}</p>
      ) : (
        vide
      );

    case "nombre":
      return valeur == null || valeur === "" ? (
        vide
      ) : (
        <span className="text-sm tabular-nums">{String(valeur)}</span>
      );

    case "case":
      return <span className="text-sm">{valeur === true ? "Oui" : "Non"}</span>;

    case "date":
      return typeof valeur === "string" && valeur ? (
        <span className="text-sm">
          {dateSeule.format(new Date(`${valeur}T12:00:00`))}
        </span>
      ) : (
        vide
      );

    case "choix": {
      const arr = Array.isArray(valeur)
        ? (valeur as string[])
        : typeof valeur === "string" && valeur
          ? [valeur]
          : [];
      if (arr.length === 0) return vide;
      return (
        <div className="flex flex-wrap gap-1.5">
          {arr.map((v, i) => (
            <span
              key={i}
              className="rounded-full px-2.5 py-0.5 text-xs"
              style={{ border: `1px solid ${TRAIT}`, color: ENCRE }}
            >
              {v}
            </span>
          ))}
        </div>
      );
    }

    case "gps": {
      const p = valeur as PositionGps | null;
      if (!p) return vide;
      const lienPill = {
        border: `1px solid ${TRAIT}`,
        color: ENCRE,
      } as const;
      return (
        <div className="space-y-1.5">
          <span className="text-sm tabular-nums">
            {p.lat.toFixed(5)}, {p.lng.toFixed(5)}
            {p.acc != null && (
              <span style={{ color: GRIS }}> · ±{Math.round(p.acc)} m</span>
            )}
          </span>
          <div className="flex flex-wrap gap-2">
            <a
              href={lienGoogleMaps(p.lat, p.lng)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium"
              style={lienPill}
            >
              <MapPin className="h-3.5 w-3.5" /> Google Maps
            </a>
            <a
              href={lienWaze(p.lat, p.lng)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium"
              style={lienPill}
            >
              <Navigation className="h-3.5 w-3.5" /> Waze
            </a>
          </div>
        </div>
      );
    }

    case "photo": {
      const ids = Array.isArray(valeur) ? (valeur as string[]) : [];
      if (ids.length === 0) return vide;
      return (
        <div className="flex flex-wrap gap-2">
          {ids.map((id) => (
            <img
              key={id}
              src={`/api/formulaires/media/${id}`}
              alt="Photo"
              className="h-32 w-32 rounded-md object-cover"
              style={{ border: `1px solid ${TRAIT}` }}
            />
          ))}
        </div>
      );
    }

    case "signature": {
      const id = Array.isArray(valeur) ? (valeur as string[])[0] : undefined;
      if (!id) return vide;
      return (
        <img
          src={`/api/formulaires/media/${id}`}
          alt="Signature"
          className="h-24 w-auto rounded-md"
          style={{ border: `1px solid ${TRAIT}` }}
        />
      );
    }

    case "dateHeure":
      return typeof valeur === "string" && valeur ? (
        <span className="text-sm">{dateFr.format(new Date(valeur))}</span>
      ) : (
        vide
      );

    case "slider":
    case "compteur":
      return typeof valeur === "number" ? (
        <span className="text-sm font-medium tabular-nums">{valeur}</span>
      ) : (
        vide
      );

    case "liste":
      return typeof valeur === "string" && valeur ? (
        <span className="text-sm">{valeur}</span>
      ) : (
        vide
      );

    case "pieceJointe": {
      const ids = Array.isArray(valeur) ? (valeur as string[]) : [];
      if (ids.length === 0) return vide;
      return (
        <ul className="space-y-1">
          {ids.map((id) => {
            const nom = medias.find((m) => m.id === id)?.nom;
            return (
              <li key={id}>
                <a
                  href={`/api/formulaires/media/${id}`}
                  download={nom}
                  className="text-sm underline"
                  style={{ color: ENCRE }}
                >
                  {nom ?? "Fichier joint"}
                </a>
              </li>
            );
          })}
        </ul>
      );
    }

    case "codeBarre":
      return typeof valeur === "string" && valeur ? (
        <span className="font-mono text-sm">{valeur}</span>
      ) : (
        vide
      );

    case "audio": {
      const id = Array.isArray(valeur) ? (valeur as string[])[0] : undefined;
      return id ? (
        <a
          href={`/api/formulaires/media/${id}`}
          className="text-sm underline"
          style={{ color: ENCRE }}
        >
          Écouter la note vocale
        </a>
      ) : (
        vide
      );
    }

    case "dessin":
    case "schema": {
      const id = Array.isArray(valeur) ? (valeur as string[])[0] : undefined;
      return id ? (
        <img
          src={`/api/formulaires/media/${id}`}
          alt=""
          className="max-h-64 rounded-md"
          style={{ border: `1px solid ${TRAIT}` }}
        />
      ) : (
        vide
      );
    }

    case "reference": {
      const r =
        valeur && typeof valeur === "object" && "label" in valeur
          ? (valeur as RefValue)
          : null;
      return r?.label ? <span className="text-sm">{r.label}</span> : vide;
    }

    case "calcul":
      return valeur == null || valeur === "" ? (
        vide
      ) : (
        <span
          className="text-sm font-semibold tabular-nums"
          style={{ color: "#b45309" }}
        >
          {String(valeur)}
        </span>
      );

    default:
      return vide;
  }
}

function PresentationVue({ champ }: { champ: ChampDef }) {
  switch (champ.type) {
    case "separateur":
      return champ.libelle ? (
        <div className="flex items-center gap-3">
          <span
            className="text-xs font-bold uppercase tracking-wide"
            style={{ color: ENCRE }}
          >
            {champ.libelle}
          </span>
          <span className="h-px flex-1" style={{ background: TRAIT }} />
        </div>
      ) : (
        <hr style={{ borderColor: TRAIT }} />
      );

    case "texteFixe":
      return (
        <p className="whitespace-pre-wrap text-sm" style={{ color: GRIS }}>
          {champ.contenuFixe}
        </p>
      );

    case "imageFixe":
      return champ.imageData ? (
        <img
          src={champ.imageData}
          alt=""
          className="max-h-56 rounded-md"
          style={{ border: `1px solid ${TRAIT}` }}
        />
      ) : null;

    default:
      return null;
  }
}
