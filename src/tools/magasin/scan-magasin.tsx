"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Camera,
  Check,
  Flashlight,
  Loader2,
  Minus,
  Plus,
  ScanLine,
  Search,
  TriangleAlert,
  X,
} from "lucide-react";
import { Badge, Button, Input, Label } from "@/ui";
import { cn } from "@/lib/cn";
import { useLecteurCode } from "@/lib/scan/lecteur";
import { apprendreCode, chercherParCode, enregistrerLotScan } from "./actions";
import { MOUVEMENT_LABEL, type DepotVue } from "./model";
import type { AffaireChoix, ProduitChoix } from "./saisie-mouvement";

/* =============================================================================
 * LA SESSION DE SCAN
 *
 * Le geste qui décide si le magasin reste vrai. Donc : on choisit le contexte
 * UNE fois (réception + n° d'achat, ou sortie + affaire), puis on enchaîne les
 * codes sans rien retoucher. Un article déjà scanné s'incrémente au lieu de
 * créer une deuxième ligne.
 *
 * Le code inconnu n'est pas une erreur, c'est une étape : on l'associe à un
 * produit, il est APPRIS, et la fois suivante il est reconnu instantanément.
 * Sans cet apprentissage, un magasin scanné meurt en trois semaines.
 * ========================================================================== */

type Mode = "RECEPTION" | "SORTIE";

interface LigneSession {
  produitId: string;
  refInterne: string;
  designation: string;
  unite: string;
  quantite: number;
  stockAvant: number;
}

export function ScanMagasin({
  produits,
  depots,
  affaires,
}: {
  produits: ProduitChoix[];
  depots: DepotVue[];
  affaires: AffaireChoix[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const depotsUtiles = depots.filter((d) => d.actif);
  const [mode, setMode] = useState<Mode>("RECEPTION");
  const [depotId, setDepotId] = useState(
    depotsUtiles.find((d) => !d.dortoir)?.id ?? depotsUtiles[0]?.id ?? "",
  );
  const [chantierId, setChantierId] = useState("");
  const [numeroAchat, setNumeroAchat] = useState("");

  const [lignes, setLignes] = useState<LigneSession[]>([]);
  const [inconnu, setInconnu] = useState<{ code: string; format: string | null } | null>(null);
  const [recherche, setRecherche] = useState("");
  const [manuel, setManuel] = useState("");
  const [flash, setFlash] = useState<"ok" | "inconnu" | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [fini, setFini] = useState<number | null>(null);

  // Un code reste plusieurs secondes devant l'objectif : sans garde-fou, on
  // l'ajouterait trente fois par seconde.
  const dernierRef = useRef<{ code: string; t: number } | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inconnuRef = useRef(false);

  function montrerFlash(etat: "ok" | "inconnu") {
    setFlash(etat);
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlash(null), 420);
  }

  function ajouter(p: {
    id: string;
    refInterne: string;
    designation: string;
    unite: string;
    stock: number;
  }) {
    setLignes((courant) => {
        const existante = courant.find((l) => l.produitId === p.id);
      if (existante) {
        return courant.map((l) => (l.produitId === p.id ? { ...l, quantite: l.quantite + 1 } : l));
      }
      return [
        {
          produitId: p.id,
          refInterne: p.refInterne,
          designation: p.designation,
          unite: p.unite,
          quantite: 1,
          stockAvant: p.stock,
        },
        ...courant,
      ];
    });
    montrerFlash("ok");
  }

  // Pas de useCallback : le lecteur garde le callback dans une ref, il n'a donc
  // pas besoin d'une identité stable — et le compilateur React s'en charge.
  const traiterCode = (valeur: string, format: string | null) => {
    const code = valeur.trim();
    if (!code) return;
    // Tant qu'un code inconnu attend son association, on ignore la caméra :
    // sinon la question est balayée par le code suivant.
    if (inconnuRef.current) return;

    const maintenant = Date.now();
    const dernier = dernierRef.current;
    if (dernier && dernier.code === code && maintenant - dernier.t < 1800) return;
    dernierRef.current = { code, t: maintenant };

    startTransition(async () => {
      const produit = await chercherParCode(code);
      if (produit) {
        ajouter(produit);
      } else {
        inconnuRef.current = true;
        setInconnu({ code, format });
        setRecherche("");
        montrerFlash("inconnu");
      }
    });
  };

  const {
    videoRef,
    scanning,
    erreur: erreurCamera,
    moteur,
    resolution,
    torche,
    torcheDispo,
    demarrer,
    arreter,
    basculerTorche,
  } = useLecteurCode(traiterCode);

  useEffect(() => {
    return () => {
      if (flashTimer.current) clearTimeout(flashTimer.current);
    };
  }, []);

  function associer(produitId: string) {
    if (!inconnu) return;
    const produit = produits.find((p) => p.id === produitId);
    if (!produit) return;
    startTransition(async () => {
      try {
        await apprendreCode({ code: inconnu.code, produitId, format: inconnu.format });
        ajouter(produit);
        setInconnu(null);
        inconnuRef.current = false;
      } catch (e) {
        setErreur(e instanceof Error ? e.message : "Erreur inattendue");
      }
    });
  }

  function abandonnerInconnu() {
    setInconnu(null);
    inconnuRef.current = false;
  }

  function valider() {
    setErreur(null);
    startTransition(async () => {
      try {
        const { nb } = await enregistrerLotScan({
          type: mode,
          depotId,
          chantierId: mode === "SORTIE" ? chantierId || null : null,
          numeroAchat: mode === "RECEPTION" ? numeroAchat : null,
          lignes: lignes.map((l) => ({ produitId: l.produitId, quantite: l.quantite })),
        });
        setFini(nb);
        setLignes([]);
        router.refresh();
      } catch (e) {
        setErreur(e instanceof Error ? e.message : "Erreur inattendue");
      }
    });
  }

  const resultatsRecherche = (() => {
    const f = recherche.trim().toLowerCase();
    if (!f) return produits.slice(0, 8);
    return produits
      .filter(
        (p) =>
          p.refInterne.toLowerCase().includes(f) ||
          (p.refFabricant ?? "").toLowerCase().includes(f) ||
          p.designation.toLowerCase().includes(f),
      )
      .slice(0, 8);
  })();

  const total = lignes.reduce((s, l) => s + l.quantite, 0);

  return (
    <>
      {/* Le contexte, choisi UNE fois --------------------------------------- */}
      <div className="bloc mb-4 px-4 py-4">
        <div className="flex flex-wrap gap-1.5">
          {(["RECEPTION", "SORTIE"] as Mode[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={cn(
                "press rounded-md border px-4 py-2 text-sm font-semibold transition-colors",
                m === mode
                  ? "border-brand bg-brand text-brand-fg"
                  : "border-border bg-surface text-muted hover:bg-surface-2",
              )}
            >
              {MOUVEMENT_LABEL[m]}
            </button>
          ))}
        </div>

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div>
            <Label>{mode === "RECEPTION" ? "Ranger dans" : "Prendre dans"}</Label>
            <select
              value={depotId}
              onChange={(e) => setDepotId(e.target.value)}
              className="mt-1 h-[var(--control-h)] w-full rounded-md border border-border bg-surface px-2.5 text-sm text-fg"
            >
              {depotsUtiles.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.nom}
                </option>
              ))}
            </select>
          </div>

          {mode === "RECEPTION" ? (
            <div>
              <Label>N° de commande d&apos;achat</Label>
              <Input
                value={numeroAchat}
                onChange={(e) => setNumeroAchat(e.target.value)}
                placeholder="Référence WhySoft (facultatif)"
                className="mt-1"
              />
            </div>
          ) : (
            <div>
              <Label>Pour l&apos;affaire</Label>
              <select
                value={chantierId}
                onChange={(e) => setChantierId(e.target.value)}
                className="mt-1 h-[var(--control-h)] w-full rounded-md border border-border bg-surface px-2.5 text-sm text-fg"
              >
                <option value="">— Aucune —</option>
                {affaires.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.nom} — {a.clientNom}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      {/* Le viseur ----------------------------------------------------------- */}
      <div className="bloc mb-4 px-4 py-4">
        <div className="flex flex-wrap items-center gap-2">
          {scanning ? (
            <Button variant="outline" onClick={arreter}>
              <X className="h-4 w-4" /> Arrêter la caméra
            </Button>
          ) : (
            <Button onClick={demarrer}>
              <Camera className="h-4 w-4" /> Scanner
            </Button>
          )}
          {scanning && torcheDispo && (
            <Button
              variant={torche ? "primary" : "outline"}
              size="icon"
              onClick={basculerTorche}
              title="Lampe torche"
            >
              <Flashlight className="h-4 w-4" />
            </Button>
          )}
          {pending && <Loader2 className="h-4 w-4 animate-spin text-muted" />}
        </div>

        <div className={cn("relative mt-3", scanning ? "" : "hidden")}>
          <video
            ref={videoRef}
            className="w-full max-w-xl rounded-md border border-border bg-black"
            playsInline
            muted
          />
          <span
            aria-hidden
            className={cn(
              "pointer-events-none absolute inset-0 rounded-md border-4 transition-colors duration-150",
              flash === "ok"
                ? "border-success"
                : flash === "inconnu"
                  ? "border-warning"
                  : "border-transparent",
            )}
          />
        </div>
        {(moteur || resolution) && scanning && (
          <p className="mt-1.5 text-xs text-subtle">
            {moteur}
            {resolution ? ` · ${resolution}` : ""}
          </p>
        )}
        {erreurCamera && (
          <div className="mt-3 flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-warning">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
            {erreurCamera}
          </div>
        )}

        {/* Repli clavier : une caméra qui refuse ne doit jamais bloquer. */}
        <div className="mt-3 flex gap-2">
          <Input
            value={manuel}
            onChange={(e) => setManuel(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && manuel.trim()) {
                traiterCode(manuel.trim(), null);
                setManuel("");
              }
            }}
            placeholder="…ou tapez / collez un code, puis Entrée"
            className="font-mono"
          />
          <Button
            variant="outline"
            onClick={() => {
              if (manuel.trim()) {
                traiterCode(manuel.trim(), null);
                setManuel("");
              }
            }}
          >
            <ScanLine className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Code inconnu → apprentissage ---------------------------------------- */}
      {inconnu && (
        <div className="bloc mb-4 border-warning/50 px-4 py-4">
          <div className="flex items-baseline gap-2">
            <Badge tone="warning">Code inconnu</Badge>
            <span className="ref">{inconnu.code}</span>
          </div>
          <p className="mt-2 text-sm text-muted">
            À quel produit correspond-il ? Une fois associé, il sera reconnu pour toujours.
          </p>
          <div className="relative mt-2">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" />
            <Input
              autoFocus
              value={recherche}
              onChange={(e) => setRecherche(e.target.value)}
              placeholder="Chercher le produit…"
              className="pl-8"
            />
          </div>
          <ul className="mt-2 max-h-52 overflow-y-auto border border-hairline">
            {resultatsRecherche.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => associer(p.id)}
                  className="flex w-full items-baseline gap-2 border-b border-hairline px-3 py-2 text-left text-sm transition-colors last:border-0 hover:bg-surface-2"
                >
                  <span className="ref shrink-0">{p.refInterne}</span>
                  <span className="min-w-0 flex-1 truncate text-fg">{p.designation}</span>
                </button>
              </li>
            ))}
          </ul>
          <div className="mt-2 flex justify-end">
            <Button size="sm" variant="ghost" onClick={abandonnerInconnu}>
              Ignorer ce code
            </Button>
          </div>
        </div>
      )}

      {erreur && (
        <div className="mb-4 rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
          {erreur}
        </div>
      )}

      {fini !== null && lignes.length === 0 && (
        <div className="mb-4 flex items-center gap-2 rounded-md border border-success/40 bg-success/10 px-3 py-2 text-sm text-success">
          <Check className="h-4 w-4" />
          {fini} ligne{fini > 1 ? "s" : ""} enregistrée{fini > 1 ? "s" : ""}. La session est vide,
          on peut enchaîner.
        </div>
      )}

      {/* La session en cours -------------------------------------------------- */}
      <div className="data-card overflow-x-auto">
        <table className="data-table table-cards">
          <thead>
            <tr>
              <th>Produit</th>
              <th className="text-right">Stock avant</th>
              <th className="text-right">Quantité</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {lignes.length === 0 && (
              <tr>
                <td colSpan={4} className="py-6 text-center text-sm text-subtle">
                  Rien de scanné pour l&apos;instant.
                </td>
              </tr>
            )}
            {lignes.map((l) => (
              <tr key={l.produitId}>
                <td className="cell-title cell-card-title cell-wrap">
                  <span className="ref">{l.refInterne}</span> — {l.designation}
                </td>
                <td data-label="Stock avant" className="text-right tabular-nums text-muted">
                  {l.stockAvant}
                </td>
                <td data-label="Quantité" className="text-right">
                  <div className="inline-flex items-center gap-1.5">
                    <Button
                      size="icon"
                      variant="outline"
                      aria-label="Diminuer"
                      onClick={() =>
                        setLignes((c) =>
                          c.map((x) =>
                            x.produitId === l.produitId
                              ? { ...x, quantite: Math.max(1, x.quantite - 1) }
                              : x,
                          ),
                        )
                      }
                    >
                      <Minus className="h-4 w-4" />
                    </Button>
                    <span className="w-8 text-center font-display text-lg font-bold tabular-nums">
                      {l.quantite}
                    </span>
                    <Button
                      size="icon"
                      variant="outline"
                      aria-label="Augmenter"
                      onClick={() =>
                        setLignes((c) =>
                          c.map((x) =>
                            x.produitId === l.produitId ? { ...x, quantite: x.quantite + 1 } : x,
                          ),
                        )
                      }
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                </td>
                <td className="text-right">
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label="Retirer de la session"
                    onClick={() =>
                      setLignes((c) => c.filter((x) => x.produitId !== l.produitId))
                    }
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Barre d'action collée : le pouce n'a pas à remonter. */}
      {lignes.length > 0 && (
        <div className="bg-surface sticky bottom-0 z-30 -mx-4 mt-4 flex items-center gap-3 border-t border-border px-4 py-3 md:-mx-7 md:px-7">
          <span className="text-sm text-muted">
            <strong className="text-fg">{lignes.length}</strong> référence
            {lignes.length > 1 ? "s" : ""} · <strong className="text-fg">{total}</strong> article
            {total > 1 ? "s" : ""}
          </span>
          <Button variant="ghost" onClick={() => setLignes([])} disabled={pending}>
            Vider
          </Button>
          <Button className="ml-auto" onClick={valider} disabled={pending || !depotId}>
            {pending && <Loader2 className="h-4 w-4 animate-spin" />}
            Valider la {mode === "RECEPTION" ? "réception" : "sortie"}
          </Button>
        </div>
      )}
    </>
  );
}
