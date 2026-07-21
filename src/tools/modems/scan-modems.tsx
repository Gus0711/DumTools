"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  ClipboardCopy,
  Download,
  FilterX,
  Flashlight,
  Link2,
  Link2Off,
  Loader2,
  Plus,
  QrCode,
  RotateCw,
  ScanLine,
  Search,
  Trash2,
  TriangleAlert,
  X,
} from "lucide-react";
import { Button, Combobox, Input, type ComboOption } from "@/ui";
import {
  CHAMPS_MODEM,
  estModem,
  formatLabel,
  parseModemQr,
  resumeModem,
} from "./model";
import type { ModemScanRow } from "./queries";
import {
  assignerScans,
  enregistrerScanModem,
  majNoteScanModem,
  supprimerScans,
} from "./actions";

export interface AffaireOption {
  id: string;
  nom: string;
  numeroWhy: string | null;
  clientNom: string;
}

type Statut = "ok" | "en-cours" | "echec";
type Ligne = ModemScanRow & { statut: Statut };

/** Contrôles minimaux exposés par @zxing/browser (évite d'importer le type). */
type ScannerControls = { stop: () => void };

/* BarcodeDetector natif (non typé dans lib.dom) — typage minimal local. */
type CodeDetecte = { rawValue: string; format?: string };
interface DetecteurCodeBarres {
  detect(source: CanvasImageSource): Promise<CodeDetecte[]>;
}
type CtorDetecteur = (new (opts?: {
  formats?: string[];
}) => DetecteurCodeBarres) & {
  getSupportedFormats?: () => Promise<string[]>;
};
function getDetecteurNatif(): CtorDetecteur | null {
  if (typeof window === "undefined") return null;
  return (
    (window as unknown as { BarcodeDetector?: CtorDetecteur }).BarcodeDetector ??
    null
  );
}

function fmtDate(d: Date) {
  return new Date(d).toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function labelAffaire(a: { nom: string; numeroWhy: string | null }): string {
  return a.numeroWhy ? `${a.nom} · ${a.numeroWhy}` : a.nom;
}

/** Clé de type d'un scan (pour le filtre) : "modem" ou la symbologie. */
function typeKeyDe(l: Ligne): string {
  return estModem(l) ? "modem" : (l.format ?? "__saisi__");
}

/** Champ texte agrégé d'un scan, pour la recherche libre. */
function texteRecherche(l: Ligne): string {
  return [
    l.raw,
    l.ssid,
    l.serie,
    l.imei,
    l.mac,
    l.wifiPass,
    l.adminUser,
    l.adminPass,
    l.lot,
    l.groupe,
    l.chantierNom,
    l.chantierWhy,
    l.note,
    formatLabel(l.format, l),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

/* --------------------------------------------------------------------------
 * Export CSV (séparateur « ; » + BOM → ouverture directe Excel FR) et copie
 * TSV (collage direct dans un tableur).
 * ------------------------------------------------------------------------ */
const EN_TETES = [
  "Type",
  "Contenu",
  ...CHAMPS_MODEM.map((c) => c.libelle),
  "Groupe",
  "Affaire",
  "N° Why",
  "Note",
  "Scanné le",
  "Par",
];

function celluleValeurs(l: Ligne): string[] {
  return [
    formatLabel(l.format, l),
    l.raw,
    ...CHAMPS_MODEM.map((c) => l[c.cle] ?? ""),
    l.groupe ?? "",
    l.chantierNom ?? "",
    l.chantierWhy ?? "",
    l.note ?? "",
    fmtDate(l.createdAt),
    l.auteur ?? "",
  ];
}

function csvCell(v: string): string {
  return /[";\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

function telechargerCsv(rows: Ligne[]) {
  const contenu = [EN_TETES, ...rows.map(celluleValeurs)]
    .map((r) => r.map(csvCell).join(";"))
    .join("\r\n");
  const blob = new Blob(["﻿" + contenu], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `scans-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

const AUCUNE = "__none__";

export function ScanModems({
  scansInitiaux,
  affaires,
  moiNom,
}: {
  scansInitiaux: ModemScanRow[];
  affaires: AffaireOption[];
  moiNom: string | null;
}) {
  const [scans, setScans] = useState<Ligne[]>(
    scansInitiaux.map((s) => ({ ...s, statut: "ok" })),
  );
  const [scanning, setScanning] = useState(false);
  const [erreurCam, setErreurCam] = useState("");
  const [flash, setFlash] = useState<"ok" | "dup" | null>(null);
  const [dernier, setDernier] = useState<string>("");
  const [manuel, setManuel] = useState("");
  const [moteur, setMoteur] = useState<string>("");
  const [resolution, setResolution] = useState<string>("");
  const [torcheDispo, setTorcheDispo] = useState(false);
  const [torche, setTorche] = useState(false);
  const [copie, setCopie] = useState(false);

  // Contexte de rattachement des PROCHAINS scans (affaire + groupe).
  const [ctxAffaireText, setCtxAffaireText] = useState("");
  const [ctxAffaire, setCtxAffaire] = useState<AffaireOption | null>(null);
  const [ctxGroupe, setCtxGroupe] = useState("");

  // Destination du rattachement d'une SÉLECTION (barre d'actions groupées).
  const [assignAffaireText, setAssignAffaireText] = useState("");
  const [assignAffaire, setAssignAffaire] = useState<AffaireOption | null>(null);
  const [assignGroupe, setAssignGroupe] = useState("");

  const [filtre, setFiltre] = useState(""); // "" | AUCUNE | chantierId
  const [filtreGroupe, setFiltreGroupe] = useState(""); // "" | AUCUNE | groupe
  const [filtreType, setFiltreType] = useState(""); // "" | "modem" | format
  const [recherche, setRecherche] = useState("");
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [, start] = useTransition();

  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<ScannerControls | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const trackRef = useRef<MediaStreamTrack | null>(null);
  const boucleRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scanningRef = useRef(false);
  const scansRef = useRef<Ligne[]>(scans);
  const lastRef = useRef<{ raw: string; t: number } | null>(null);
  const audioRef = useRef<AudioContext | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ctxRef = useRef<{
    chantierId: string | null;
    chantierNom: string | null;
    chantierWhy: string | null;
    groupe: string;
  }>({ chantierId: null, chantierNom: null, chantierWhy: null, groupe: "" });

  const affaireOptions: ComboOption[] = useMemo(
    () => affaires.map((a) => ({ value: labelAffaire(a), tag: a.clientNom })),
    [affaires],
  );
  const affaireParLabel = useMemo(
    () => new Map(affaires.map((a) => [labelAffaire(a), a])),
    [affaires],
  );

  // Miroir ref de la liste (lecture synchrone depuis la boucle de scan).
  const poser = useCallback((next: Ligne[]) => {
    scansRef.current = next;
    setScans(next);
  }, []);

  const bip = useCallback((type: "ok" | "dup") => {
    try {
      const ctx =
        audioRef.current ??
        new (window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext })
            .webkitAudioContext)();
      audioRef.current = ctx;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = type === "ok" ? 880 : 300;
      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.18);
      osc.start();
      osc.stop(ctx.currentTime + 0.18);
    } catch {
      /* audio best-effort */
    }
    if (typeof navigator !== "undefined" && navigator.vibrate) {
      navigator.vibrate(type === "ok" ? 120 : [50, 40, 50]);
    }
  }, []);

  const montrerFlash = useCallback((type: "ok" | "dup") => {
    setFlash(type);
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlash(null), 550);
  }, []);

  const persister = useCallback(
    (
      tempId: string,
      raw: string,
      format: string | null,
      chantierId: string | null,
      groupe: string | null,
    ) => {
      start(async () => {
        const res = await enregistrerScanModem(raw, format, chantierId, groupe);
        const cur = scansRef.current;
        if ("error" in res) {
          poser(cur.map((l) => (l.id === tempId ? { ...l, statut: "echec" } : l)));
        } else {
          poser(
            cur.map((l) =>
              l.id === tempId ? { ...l, id: res.id, statut: "ok" } : l,
            ),
          );
        }
      });
    },
    [poser],
  );

  /** Traite une valeur décodée (caméra ou saisie manuelle). */
  const traiter = useCallback(
    (raw: string, format: string | null, opts?: { cooldown?: boolean }) => {
      const t = raw.trim();
      if (!t) return;
      const now = Date.now();
      // Anti-répétition : le scan continu re-décode le même code en boucle.
      if (
        opts?.cooldown !== false &&
        lastRef.current &&
        lastRef.current.raw === t &&
        now - lastRef.current.t < 3000
      ) {
        return;
      }
      lastRef.current = { raw: t, t: now };

      const info = parseModemQr(t);
      const modem = estModem(info);
      // Anti-doublon : modem → même série/IMEI ; code générique → même contenu.
      const existe = scansRef.current.some((s) =>
        modem
          ? (info.serie && s.serie === info.serie) ||
            (info.imei && s.imei === info.imei)
          : s.raw === t,
      );
      setDernier(modem ? resumeModem(info) : t);
      if (existe) {
        montrerFlash("dup");
        bip("dup");
        return;
      }

      const ctx = ctxRef.current;
      const groupe = ctx.groupe.trim() || null;
      const tempId = `temp-${now}-${Math.round(Math.random() * 1e6)}`;
      const ligne: Ligne = {
        id: tempId,
        raw: t,
        format,
        note: "",
        chantierId: ctx.chantierId,
        chantierNom: ctx.chantierNom,
        chantierWhy: ctx.chantierWhy,
        groupe,
        auteur: moiNom,
        createdAt: new Date(),
        statut: "en-cours",
        ...info,
      };
      poser([ligne, ...scansRef.current]);
      montrerFlash("ok");
      bip("ok");
      persister(tempId, t, format, ctx.chantierId, groupe);
    },
    [bip, montrerFlash, moiNom, persister, poser],
  );

  /** Boucle de détection via BarcodeDetector natif (throttlée). */
  const boucleNative = useCallback(
    (detecteur: DetecteurCodeBarres) => {
      const tick = async () => {
        if (!scanningRef.current) return;
        const v = videoRef.current;
        if (v && v.readyState >= 2) {
          try {
            const codes = await detecteur.detect(v);
            if (codes.length && codes[0].rawValue)
              traiter(codes[0].rawValue, codes[0].format ?? null);
          } catch {
            /* frame non décodable : on continue */
          }
        }
        if (scanningRef.current) boucleRef.current = setTimeout(tick, 120);
      };
      tick();
    },
    [traiter],
  );

  const demarrer = useCallback(async () => {
    setErreurCam("");
    try {
      // Haute résolution + caméra arrière : indispensable pour un code dense.
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      });
      streamRef.current = stream;
      const video = videoRef.current!;
      const track = stream.getVideoTracks()[0];
      trackRef.current = track;

      try {
        const caps = track.getCapabilities?.() as
          | (MediaTrackCapabilities & { focusMode?: string[]; torch?: boolean })
          | undefined;
        if (caps?.focusMode?.includes("continuous")) {
          await track.applyConstraints({
            advanced: [{ focusMode: "continuous" }],
          } as unknown as MediaTrackConstraints);
        }
        setTorcheDispo(Boolean(caps?.torch));
      } catch {
        /* capacités non exposées : on ignore */
      }

      scanningRef.current = true;
      const Detecteur = getDetecteurNatif();
      let natifOk = false;
      if (Detecteur) {
        try {
          const supportes = (await Detecteur.getSupportedFormats?.()) ?? [];
          const formats = supportes.filter((f) => f && f !== "unknown");
          if (formats.length) {
            const detecteur = new Detecteur({ formats });
            video.srcObject = stream;
            video.setAttribute("playsinline", "true");
            video.muted = true;
            await video.play().catch(() => {});
            setMoteur("BarcodeDetector (natif)");
            boucleNative(detecteur);
            natifOk = true;
          }
        } catch {
          natifOk = false;
        }
      }
      if (!natifOk) {
        const [{ BrowserMultiFormatReader }, { BarcodeFormat }] =
          await Promise.all([
            import("@zxing/browser"),
            import("@zxing/library"),
          ]);
        const reader = new BrowserMultiFormatReader(undefined, {
          delayBetweenScanAttempts: 100,
        });
        setMoteur("ZXing");
        controlsRef.current = await reader.decodeFromStream(
          stream,
          video,
          (result) => {
            if (result) {
              const fmt = BarcodeFormat[result.getBarcodeFormat()];
              traiter(result.getText(), fmt ? fmt.toLowerCase() : null);
            }
          },
        );
      }

      const s = track.getSettings();
      if (s.width && s.height) setResolution(`${s.width}×${s.height}`);
      setScanning(true);
    } catch {
      setErreurCam(
        "Caméra indisponible ou refusée. Autorise l'accès caméra dans le navigateur (site en HTTPS requis), puis réessaie. Sinon, colle le contenu du code ci-dessous.",
      );
    }
  }, [boucleNative, traiter]);

  const arreter = useCallback(() => {
    scanningRef.current = false;
    if (boucleRef.current) clearTimeout(boucleRef.current);
    controlsRef.current?.stop();
    controlsRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    trackRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setScanning(false);
    setTorche(false);
    setTorcheDispo(false);
  }, []);

  const basculerTorche = useCallback(async () => {
    const track = trackRef.current;
    if (!track) return;
    try {
      await track.applyConstraints({
        advanced: [{ torch: !torche }],
      } as unknown as MediaTrackConstraints);
      setTorche((v) => !v);
    } catch {
      /* torche non applicable */
    }
  }, [torche]);

  useEffect(() => {
    return () => {
      scanningRef.current = false;
      if (boucleRef.current) clearTimeout(boucleRef.current);
      controlsRef.current?.stop();
      streamRef.current?.getTracks().forEach((t) => t.stop());
      if (flashTimer.current) clearTimeout(flashTimer.current);
    };
  }, []);

  /* ---- contexte de rattachement ------------------------------------- */
  const choisirAffaireCtx = useCallback((opt: ComboOption, a?: AffaireOption) => {
    if (!a) return;
    setCtxAffaireText(opt.value);
    setCtxAffaire(a);
    ctxRef.current.chantierId = a.id;
    ctxRef.current.chantierNom = a.nom;
    ctxRef.current.chantierWhy = a.numeroWhy;
  }, []);

  const effacerCtx = useCallback(() => {
    setCtxAffaireText("");
    setCtxAffaire(null);
    setCtxGroupe("");
    ctxRef.current = {
      chantierId: null,
      chantierNom: null,
      chantierWhy: null,
      groupe: "",
    };
  }, []);

  const ctxLabel = ctxAffaire
    ? labelAffaire(ctxAffaire)
    : ctxGroupe.trim()
      ? `« ${ctxGroupe.trim()} »`
      : null;

  /* ---- recherche + filtres ------------------------------------------ */
  const filtrees = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    return scans.filter((s) => {
      if (filtre === AUCUNE && s.chantierId) return false;
      if (filtre && filtre !== AUCUNE && s.chantierId !== filtre) return false;
      if (filtreGroupe === AUCUNE && s.groupe) return false;
      if (filtreGroupe && filtreGroupe !== AUCUNE && s.groupe !== filtreGroupe)
        return false;
      if (filtreType && typeKeyDe(s) !== filtreType) return false;
      if (q && !texteRecherche(s).includes(q)) return false;
      return true;
    });
  }, [scans, filtre, filtreGroupe, filtreType, recherche]);

  const affairesPresentes = useMemo(() => {
    const m = new Map<string, { id: string; label: string }>();
    for (const s of scans) {
      if (s.chantierId && !m.has(s.chantierId)) {
        m.set(s.chantierId, {
          id: s.chantierId,
          label: labelAffaire({ nom: s.chantierNom ?? "?", numeroWhy: s.chantierWhy }),
        });
      }
    }
    return [...m.values()];
  }, [scans]);

  const groupesPresents = useMemo(() => {
    const s = new Set<string>();
    for (const x of scans) if (x.groupe) s.add(x.groupe);
    return [...s].sort((a, b) => a.localeCompare(b, "fr"));
  }, [scans]);

  const typesPresents = useMemo(() => {
    const m = new Map<string, string>();
    for (const x of scans) {
      const key = typeKeyDe(x);
      if (!m.has(key)) m.set(key, formatLabel(x.format, x));
    }
    return [...m.entries()].map(([key, label]) => ({ key, label }));
  }, [scans]);

  const filtresActifs =
    recherche.trim() !== "" ||
    filtre !== "" ||
    filtreGroupe !== "" ||
    filtreType !== "";

  const reinitialiserFiltres = useCallback(() => {
    setRecherche("");
    setFiltre("");
    setFiltreGroupe("");
    setFiltreType("");
  }, []);

  const toutVisibleSel =
    filtrees.length > 0 && filtrees.every((l) => sel.has(l.id));

  const toggle = useCallback((id: string) => {
    setSel((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleTout = useCallback(() => {
    setSel((prev) => {
      const tous = filtrees.every((l) => prev.has(l.id)) && filtrees.length > 0;
      const next = new Set(prev);
      for (const l of filtrees) {
        if (tous) next.delete(l.id);
        else next.add(l.id);
      }
      return next;
    });
  }, [filtrees]);

  const rattacherSelection = useCallback(() => {
    const ids = [...sel];
    if (!ids.length) return;
    const g = assignGroupe.trim();
    const patch: { chantierId?: string | null; groupe?: string | null } = {};
    if (assignAffaire) patch.chantierId = assignAffaire.id;
    if (g) patch.groupe = g;
    if (!("chantierId" in patch) && !("groupe" in patch)) return;
    poser(
      scansRef.current.map((l) =>
        sel.has(l.id)
          ? {
              ...l,
              ...(assignAffaire
                ? {
                    chantierId: assignAffaire.id,
                    chantierNom: assignAffaire.nom,
                    chantierWhy: assignAffaire.numeroWhy,
                  }
                : {}),
              ...(g ? { groupe: g } : {}),
            }
          : l,
      ),
    );
    start(() => assignerScans(ids, patch));
    setSel(new Set());
  }, [assignAffaire, assignGroupe, poser, sel]);

  const detacherSelection = useCallback(() => {
    const ids = [...sel];
    if (!ids.length) return;
    poser(
      scansRef.current.map((l) =>
        sel.has(l.id)
          ? { ...l, chantierId: null, chantierNom: null, chantierWhy: null, groupe: null }
          : l,
      ),
    );
    start(() => assignerScans(ids, { chantierId: null, groupe: null }));
    setSel(new Set());
  }, [poser, sel]);

  const supprimerSelection = useCallback(() => {
    const ids = [...sel];
    if (!ids.length) return;
    if (!window.confirm(`Supprimer ${ids.length} scan(s) ?`)) return;
    poser(scansRef.current.filter((l) => !sel.has(l.id)));
    const reels = ids.filter((id) => !id.startsWith("temp-"));
    if (reels.length) start(() => supprimerScans(reels));
    setSel(new Set());
  }, [poser, sel]);

  const supprimerUn = useCallback((id: string) => {
    poser(scansRef.current.filter((l) => l.id !== id));
    setSel((prev) => {
      if (!prev.has(id)) return prev;
      const n = new Set(prev);
      n.delete(id);
      return n;
    });
    if (!id.startsWith("temp-")) start(() => supprimerScans([id]));
  }, [poser]);

  const changerNote = useCallback(
    (id: string, note: string) => {
      poser(scansRef.current.map((l) => (l.id === id ? { ...l, note } : l)));
    },
    [poser],
  );

  const enregistrerNote = useCallback((id: string, note: string) => {
    if (id.startsWith("temp-")) return;
    start(() => majNoteScanModem(id, note));
  }, []);

  const copier = useCallback(() => {
    const tsv = [EN_TETES, ...filtrees.map(celluleValeurs)]
      .map((r) => r.join("\t"))
      .join("\n");
    navigator.clipboard?.writeText(tsv).then(
      () => {
        setCopie(true);
        setTimeout(() => setCopie(false), 1500);
      },
      () => {},
    );
  }, [filtrees]);

  const enCours = scans.some((s) => s.statut === "en-cours");

  return (
    <div className="space-y-6">
      {/* ---- Zone de scan ------------------------------------------------- */}
      <div className="rounded-xl border border-border bg-surface p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-fg">
            <ScanLine className="h-4 w-4 text-muted" />
            Scanner un code
          </h2>
          <div className="flex items-center gap-2">
            {scanning && torcheDispo && (
              <Button
                size="sm"
                variant={torche ? "primary" : "outline"}
                onClick={basculerTorche}
                title="Lampe torche"
              >
                <Flashlight className="h-4 w-4" />
              </Button>
            )}
            {scanning ? (
              <Button size="sm" variant="outline" onClick={arreter}>
                <X className="h-4 w-4" /> Arrêter
              </Button>
            ) : (
              <Button size="sm" onClick={demarrer}>
                <ScanLine className="h-4 w-4" /> Démarrer la caméra
              </Button>
            )}
          </div>
        </div>

        {/* Contexte : rattacher les prochains scans à une affaire / un groupe. */}
        <div className="mt-3 rounded-lg border border-border-soft bg-surface-2 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="flex items-center gap-1.5 text-xs font-medium text-muted">
              <Link2 className="h-3.5 w-3.5" /> Rattacher les prochains scans à :
            </span>
            <div className="min-w-52 flex-1">
              <Combobox
                value={ctxAffaireText}
                onInput={(v) => {
                  setCtxAffaireText(v);
                  setCtxAffaire(null);
                  ctxRef.current.chantierId = null;
                  ctxRef.current.chantierNom = null;
                  ctxRef.current.chantierWhy = null;
                }}
                onPick={(opt) =>
                  choisirAffaireCtx(opt, affaireParLabel.get(opt.value))
                }
                options={affaireOptions}
                placeholder="Affaire (nom ou n° Why)…"
              />
            </div>
            <Input
              value={ctxGroupe}
              onChange={(e) => {
                setCtxGroupe(e.target.value);
                ctxRef.current.groupe = e.target.value;
              }}
              placeholder="Groupe (optionnel)…"
              className="w-40"
            />
            {(ctxAffaire || ctxGroupe) && (
              <Button size="sm" variant="ghost" onClick={effacerCtx} title="Effacer le rattachement">
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
          {ctxLabel && (
            <p className="mt-1.5 text-xs text-muted">
              Les prochains scans seront rattachés à{" "}
              <span className="font-medium text-fg">
                {ctxAffaire ? ctxLabel : `groupe ${ctxLabel}`}
              </span>
              .
            </p>
          )}
        </div>

        {/* Cadre vidéo — visible seulement pendant le scan. */}
        <div className={scanning ? "mt-3" : "hidden"}>
          <div className="relative mx-auto aspect-square w-full max-w-md overflow-hidden rounded-lg border border-border bg-black">
            {/* eslint-disable-next-line jsx-a11y/media-has-caption -- flux caméra live, pas de piste */}
            <video
              ref={videoRef}
              className="h-full w-full object-cover"
              muted
              playsInline
            />
            <div
              aria-hidden
              className="pointer-events-none absolute inset-6 rounded-lg border-2 border-white/70"
            />
            <div
              aria-hidden
              className={`pointer-events-none absolute inset-0 transition-opacity duration-200 ${
                flash === "ok"
                  ? "bg-success/40 opacity-100"
                  : flash === "dup"
                    ? "bg-io-di/40 opacity-100"
                    : "opacity-0"
              }`}
            />
          </div>
          <p className="mt-2 text-center text-xs text-muted">
            <strong className="text-fg">Approche le code</strong> pour qu&apos;il
            remplisse le cadre, bien à plat et éclairé. Ajout automatique.
            {dernier && (
              <>
                {" "}
                Dernier : <span className="font-medium text-fg">{dernier}</span>
                {flash === "dup" && (
                  <span className="text-io-di"> — déjà scanné</span>
                )}
              </>
            )}
          </p>
          {(moteur || resolution) && (
            <p className="mt-0.5 text-center text-[11px] text-subtle">
              {moteur}
              {resolution ? ` · ${resolution}` : ""}
            </p>
          )}
        </div>

        {erreurCam && (
          <p className="mt-3 flex items-start gap-1.5 text-sm text-danger">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" /> {erreurCam}
          </p>
        )}

        {/* Saisie manuelle (secours / desktop) */}
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <div className="min-w-0 flex-1">
            <label className="text-xs text-muted">
              …ou coller le contenu d&apos;un code
            </label>
            <Input
              value={manuel}
              onChange={(e) => setManuel(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && manuel.trim()) {
                  traiter(manuel, null, { cooldown: false });
                  setManuel("");
                }
              }}
              placeholder="Contenu d'un code (QR, code-barres…)"
              className="mt-1"
            />
          </div>
          <Button
            variant="outline"
            onClick={() => {
              if (manuel.trim()) {
                traiter(manuel, null, { cooldown: false });
                setManuel("");
              }
            }}
            disabled={!manuel.trim()}
          >
            <Plus className="h-4 w-4" /> Ajouter
          </Button>
        </div>
      </div>

      {/* ---- Tableau ------------------------------------------------------ */}
      <div>
        <div className="mb-3 space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-fg">
              <QrCode className="h-4 w-4 text-muted" />
              Scans
              <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs tabular-nums text-muted">
                {filtrees.length}
              </span>
              {filtresActifs && (
                <span className="text-xs font-normal text-subtle">
                  sur {scans.length}
                </span>
              )}
              {enCours && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted" />}
            </h2>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={copier}
                disabled={filtrees.length === 0}
              >
                <ClipboardCopy className="h-4 w-4" /> {copie ? "Copié !" : "Copier"}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => telechargerCsv(filtrees)}
                disabled={filtrees.length === 0}
              >
                <Download className="h-4 w-4" /> Export CSV
              </Button>
            </div>
          </div>

          {/* Recherche + filtres */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-52 flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" />
              <input
                value={recherche}
                onChange={(e) => setRecherche(e.target.value)}
                placeholder="Rechercher (contenu, série, IMEI, MAC, note…)"
                className="h-9 w-full rounded-md border border-border bg-surface pl-8 pr-2.5 text-sm text-fg outline-none placeholder:text-subtle focus:border-brand"
              />
            </div>
            {affairesPresentes.length > 0 && (
              <select
                value={filtre}
                onChange={(e) => setFiltre(e.target.value)}
                className="h-9 rounded-md border border-border bg-surface px-2 text-sm text-fg outline-none focus:border-brand"
              >
                <option value="">Toutes les affaires</option>
                <option value={AUCUNE}>Sans affaire</option>
                {affairesPresentes.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.label}
                  </option>
                ))}
              </select>
            )}
            {groupesPresents.length > 0 && (
              <select
                value={filtreGroupe}
                onChange={(e) => setFiltreGroupe(e.target.value)}
                className="h-9 rounded-md border border-border bg-surface px-2 text-sm text-fg outline-none focus:border-brand"
              >
                <option value="">Tous les groupes</option>
                <option value={AUCUNE}>Sans groupe</option>
                {groupesPresents.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
            )}
            {typesPresents.length > 1 && (
              <select
                value={filtreType}
                onChange={(e) => setFiltreType(e.target.value)}
                className="h-9 rounded-md border border-border bg-surface px-2 text-sm text-fg outline-none focus:border-brand"
              >
                <option value="">Tous les types</option>
                {typesPresents.map((t) => (
                  <option key={t.key} value={t.key}>
                    {t.label}
                  </option>
                ))}
              </select>
            )}
            {filtresActifs && (
              <Button size="sm" variant="ghost" onClick={reinitialiserFiltres}>
                <FilterX className="h-4 w-4" /> Réinitialiser
              </Button>
            )}
          </div>
        </div>

        {/* Barre d'actions groupées (sélection multiple) */}
        {sel.size > 0 && (
          <div className="mb-3 space-y-2 rounded-lg border border-brand/30 bg-brand-soft px-3 py-2.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium text-fg">
                {sel.size} sélectionné{sel.size > 1 ? "s" : ""}
              </span>
              <span className="h-4 w-px bg-border" />
              <Button size="sm" variant="outline" onClick={detacherSelection}>
                <Link2Off className="h-4 w-4" /> Détacher
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => telechargerCsv(scans.filter((l) => sel.has(l.id)))}
              >
                <Download className="h-4 w-4" /> Exporter
              </Button>
              <Button size="sm" variant="danger" onClick={supprimerSelection}>
                <Trash2 className="h-4 w-4" /> Supprimer
              </Button>
              <button
                onClick={() => setSel(new Set())}
                className="ml-auto rounded p-1 text-muted hover:text-fg"
                title="Annuler la sélection"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            {/* Destination du rattachement de la sélection */}
            <div className="flex flex-wrap items-center gap-2 border-t border-brand/20 pt-2">
              <span className="text-xs font-medium text-muted">Rattacher à :</span>
              <div className="min-w-48 flex-1">
                <Combobox
                  value={assignAffaireText}
                  onInput={(v) => {
                    setAssignAffaireText(v);
                    setAssignAffaire(null);
                  }}
                  onPick={(opt) => {
                    const a = affaireParLabel.get(opt.value);
                    if (a) {
                      setAssignAffaireText(opt.value);
                      setAssignAffaire(a);
                    }
                  }}
                  options={affaireOptions}
                  placeholder="Affaire (nom ou n° Why)…"
                />
              </div>
              <Input
                value={assignGroupe}
                onChange={(e) => setAssignGroupe(e.target.value)}
                placeholder="Groupe (ex. sonde bureau1)…"
                className="w-48"
              />
              <Button
                size="sm"
                onClick={rattacherSelection}
                disabled={!assignAffaire && !assignGroupe.trim()}
              >
                <Link2 className="h-4 w-4" /> Rattacher
              </Button>
            </div>
          </div>
        )}

        {filtrees.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border bg-surface p-12 text-center text-muted">
            {scans.length === 0
              ? "Aucun scan. Lance la caméra et vise un QR ou un code-barres."
              : "Aucun scan ne correspond à la recherche ou aux filtres."}
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border bg-surface">
            <table className="table-cards w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-subtle">
                  <th className="px-3 py-2.5">
                    <input
                      type="checkbox"
                      checked={toutVisibleSel}
                      onChange={toggleTout}
                      aria-label="Tout sélectionner"
                      className="h-4 w-4 accent-brand"
                    />
                  </th>
                  <th className="px-3 py-2.5 font-medium">Type</th>
                  <th className="px-3 py-2.5 font-medium">Réseau / Contenu</th>
                  <th className="px-3 py-2.5 font-medium">N° série</th>
                  <th className="px-3 py-2.5 font-medium">IMEI</th>
                  <th className="px-3 py-2.5 font-medium">MAC</th>
                  <th className="px-3 py-2.5 font-medium">WiFi</th>
                  <th className="px-3 py-2.5 font-medium">Admin</th>
                  <th className="px-3 py-2.5 font-medium">Lot</th>
                  <th className="px-3 py-2.5 font-medium">Rattachement</th>
                  <th className="px-3 py-2.5 font-medium">Note</th>
                  <th className="px-3 py-2.5 font-medium whitespace-nowrap">Scanné</th>
                  <th className="px-3 py-2.5 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtrees.map((l) => (
                  <tr
                    key={l.id}
                    className={`border-b border-border-soft last:border-0 hover:bg-surface-2 ${
                      l.statut === "echec" ? "bg-danger/5" : ""
                    } ${sel.has(l.id) ? "bg-brand-soft/40" : ""}`}
                  >
                    <td data-label="" className="px-3 py-2.5">
                      <input
                        type="checkbox"
                        checked={sel.has(l.id)}
                        onChange={() => toggle(l.id)}
                        aria-label="Sélectionner"
                        className="h-4 w-4 accent-brand"
                      />
                    </td>
                    <td data-label="Type" className="px-3 py-2.5">
                      <span
                        className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium ${
                          estModem(l)
                            ? "bg-brand-soft text-brand"
                            : "bg-surface-2 text-muted"
                        }`}
                      >
                        {formatLabel(l.format, l)}
                      </span>
                    </td>
                    <td data-label="Réseau / Contenu" className="cell-card-title px-3 py-2.5 font-medium text-fg">
                      <span className="inline-flex items-center gap-1.5">
                        {l.statut === "en-cours" && (
                          <Loader2 className="h-3 w-3 shrink-0 animate-spin text-muted" />
                        )}
                        {estModem(l) ? (
                          (l.ssid ?? "—")
                        ) : (
                          <span
                            className="block max-w-[22rem] truncate font-mono text-xs font-normal text-muted"
                            title={l.raw}
                          >
                            {l.raw}
                          </span>
                        )}
                      </span>
                    </td>
                    <td data-label="N° série" className="px-3 py-2.5 tabular-nums text-muted">{l.serie ?? "—"}</td>
                    <td data-label="IMEI" className="px-3 py-2.5 tabular-nums text-muted">{l.imei ?? "—"}</td>
                    <td data-label="MAC" className="px-3 py-2.5 font-mono text-xs text-muted">{l.mac ?? "—"}</td>
                    <td data-label="WiFi" className="px-3 py-2.5 font-mono text-xs text-muted">{l.wifiPass ?? "—"}</td>
                    <td data-label="Admin" className="px-3 py-2.5 text-xs text-muted">
                      {l.adminUser || l.adminPass ? (
                        <span className="font-mono">
                          {l.adminUser ?? "?"} / {l.adminPass ?? "?"}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td data-label="Lot" className="px-3 py-2.5 text-muted">{l.lot ?? "—"}</td>
                    <td data-label="Rattachement" className="px-3 py-2.5">
                      {l.chantierNom ? (
                        <span className="inline-flex items-center rounded bg-surface-2 px-1.5 py-0.5 text-xs font-medium text-fg">
                          {l.chantierNom}
                          {l.chantierWhy ? ` · ${l.chantierWhy}` : ""}
                        </span>
                      ) : l.groupe ? null : (
                        <span className="text-subtle">—</span>
                      )}
                      {l.groupe && (
                        <div className="mt-0.5 text-xs text-subtle">{l.groupe}</div>
                      )}
                    </td>
                    <td data-label="Note" className="px-3 py-2.5">
                      <input
                        defaultValue={l.note}
                        onBlur={(e) => {
                          if (e.target.value !== l.note) {
                            changerNote(l.id, e.target.value);
                            enregistrerNote(l.id, e.target.value);
                          }
                        }}
                        placeholder="…"
                        className="w-full min-w-28 rounded border border-transparent bg-transparent px-1.5 py-1 text-sm text-fg outline-none hover:border-border focus:border-brand focus:bg-surface"
                      />
                    </td>
                    <td data-label="Scanné" className="px-3 py-2.5 whitespace-nowrap text-xs text-muted">
                      {fmtDate(l.createdAt)}
                      {l.auteur && <span className="block text-subtle">{l.auteur}</span>}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center justify-end gap-1">
                        {l.statut === "echec" && (
                          <button
                            onClick={() =>
                              persister(l.id, l.raw, l.format, l.chantierId, l.groupe)
                            }
                            className="rounded p-1.5 text-danger hover:bg-danger/10"
                            title="Réessayer l'enregistrement"
                          >
                            <RotateCw className="h-4 w-4" />
                          </button>
                        )}
                        <button
                          onClick={() => supprimerUn(l.id)}
                          className="rounded p-1.5 text-subtle hover:bg-danger/10 hover:text-danger"
                          title="Supprimer"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
