"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import {
  AlertTriangle,
  Camera,
  Check,
  FileText,
  Loader2,
  Trash2,
} from "lucide-react";
import { Button, Combobox, Input, Label } from "@/ui";
import type { ComboOption } from "@/ui";
import { cn } from "@/lib/cn";
import { compresserPhoto } from "@/tools/visites/capture";
import {
  CATEGORIES_PAR_PROFIL,
  demandeInvites,
  EXEMPLE_CATEGORIE,
  formatEuros,
  LIBELLE_CATEGORIE,
  parseMontant,
  type CategorieFrais,
  type DepenseVue,
  type ProfilNdf,
} from "./model";
import { enregistrerDepense, supprimerJustificatif } from "./actions";

/**
 * Saisie d'une dépense — pensée pour être faite DEBOUT, au comptoir, juste
 * après avoir payé. D'où l'ordre des champs : la photo d'abord (le geste qu'on
 * risque d'oublier une fois reparti), puis le montant, puis la rubrique. Le
 * reste est facultatif et se remplit à froid.
 *
 * Ordre d'enregistrement NON NÉGOCIABLE : la dépense d'abord, ses photos
 * ensuite — la route média refuse un justificatif dont la dépense n'existe pas
 * encore (409), exprès pour qu'un renvoi puisse aboutir.
 */

interface PhotoLocale {
  id: string;
  blob: Blob;
  mimeType: string;
  nom: string;
  url: string;
}

export function SaisieDepense({
  qui,
  profil,
  affaires,
  depense,
  descriptifsRecents,
}: {
  qui: string;
  profil: ProfilNdf;
  affaires: { numeroWhy: string; nom: string; clientNom: string }[];
  /** Renseignée = modification d'une dépense existante. */
  depense?: DepenseVue;
  descriptifsRecents: string[];
}) {
  const router = useRouter();
  const inputFichier = useRef<HTMLInputElement>(null);

  const [id] = useState(() => depense?.id ?? crypto.randomUUID());
  const [photos, setPhotos] = useState<PhotoLocale[]>([]);
  const [dejaLa, setDejaLa] = useState(depense?.justificatifs ?? []);
  const [montant, setMontant] = useState(
    depense ? (depense.montantCents / 100).toFixed(2).replace(".", ",") : "",
  );
  const [categorie, setCategorie] = useState<CategorieFrais | null>(
    depense?.categorie ?? null,
  );
  const [date, setDate] = useState(
    depense?.date ?? new Date().toISOString().slice(0, 10),
  );
  const [descriptif, setDescriptif] = useState(depense?.descriptif ?? "");
  const [affaire, setAffaire] = useState(depense?.numeroAffaire ?? "");
  const [nbInvites, setNbInvites] = useState(
    depense?.nbInvites != null ? String(depense.nbInvites) : "",
  );
  const [invites, setInvites] = useState(depense?.invites ?? "");
  const [tva, setTva] = useState(
    depense?.tvaCents != null
      ? (depense.tvaCents / 100).toFixed(2).replace(".", ",")
      : "",
  );

  const [enCours, setEnCours] = useState(false);
  const [etape, setEtape] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);

  const categories = CATEGORIES_PAR_PROFIL[profil];
  const montantCents = parseMontant(montant);
  const complet = montantCents != null && categorie != null;
  const nbJustificatifs = photos.length + dejaLa.length;

  const optionsAffaire: ComboOption[] = affaires.map((a) => ({
    value: a.numeroWhy,
    label: `${a.numeroWhy} — ${a.nom}`,
    tag: a.clientNom,
  }));

  async function ajouterFichiers(liste: FileList | null) {
    if (!liste?.length) return;
    const ajouts: PhotoLocale[] = [];
    for (const f of Array.from(liste)) {
      if (f.type === "application/pdf") {
        // Un PDF fait foi tel quel : ni recompression, ni ré-imagement.
        ajouts.push({
          id: crypto.randomUUID(),
          blob: f,
          mimeType: "application/pdf",
          nom: f.name,
          url: "",
        });
        continue;
      }
      const { blob, mimeType } = await compresserPhoto(f);
      ajouts.push({
        id: crypto.randomUUID(),
        blob,
        mimeType,
        nom: f.name,
        url: URL.createObjectURL(blob),
      });
    }
    setPhotos((p) => [...p, ...ajouts]);
  }

  function retirerPhoto(pid: string) {
    setPhotos((p) => {
      const cible = p.find((x) => x.id === pid);
      if (cible?.url) URL.revokeObjectURL(cible.url);
      return p.filter((x) => x.id !== pid);
    });
  }

  async function retirerExistant(jid: string) {
    setDejaLa((l) => l.filter((j) => j.id !== jid));
    await supprimerJustificatif(jid);
  }

  async function soumettre() {
    if (!complet || enCours) return;
    setEnCours(true);
    setErreur(null);
    try {
      setEtape("Enregistrement…");
      const res = await enregistrerDepense({
        id,
        date,
        categorie: categorie!,
        montantCents: montantCents!,
        tvaCents: parseMontant(tva),
        descriptif,
        numeroAffaire: affaire,
        nbInvites: nbInvites ? Number(nbInvites) : null,
        invites,
      });
      if (!res.ok) {
        setErreur(res.error);
        return;
      }

      for (const [i, p] of photos.entries()) {
        setEtape(`Envoi du justificatif ${i + 1}/${photos.length}…`);
        const fd = new FormData();
        fd.set("id", p.id);
        fd.set("depenseId", id);
        fd.set("mimeType", p.mimeType);
        fd.set("nomOrigine", p.nom);
        fd.set("file", p.blob);
        const r = await fetch("/api/ndf/media", { method: "POST", body: fd });
        if (!r.ok) {
          const j = await r.json().catch(() => ({}));
          setErreur(
            `Dépense enregistrée, mais l'envoi d'un justificatif a échoué : ${j.error ?? r.status}. Tu peux le rajouter depuis la liste.`,
          );
          router.refresh();
          return;
        }
      }

      router.push(`/perso/${qui}/notes-de-frais`);
      router.refresh();
    } finally {
      setEnCours(false);
      setEtape("");
    }
  }

  return (
    <div className="pb-28">
      {/* ---------------------------------------------------------- photos */}
      <section className="mb-6">
        <Label>Justificatif</Label>
        <p className="mb-2 text-sm text-muted">
          Sans photo, la dépense est bien enregistrée mais elle n&apos;entrera
          pas dans la note du mois tant que le justificatif manque.
        </p>

        <input
          ref={inputFichier}
          type="file"
          accept="image/*,application/pdf"
          capture="environment"
          multiple
          className="hidden"
          onChange={(e) => {
            void ajouterFichiers(e.target.files);
            e.target.value = "";
          }}
        />

        <button
          type="button"
          onClick={() => inputFichier.current?.click()}
          className={cn(
            "flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-8 transition",
            nbJustificatifs === 0
              ? "border-accent/50 bg-accent-soft text-accent-fg hover:border-accent"
              : "border-border bg-surface-2 text-muted hover:border-brand",
          )}
        >
          <Camera className="h-8 w-8" />
          <span className="font-medium">
            {nbJustificatifs === 0
              ? "Photographier le ticket"
              : "Ajouter une autre photo"}
          </span>
          <span className="text-xs opacity-80">
            Photo, ou PDF de facture depuis un ordinateur
          </span>
        </button>

        {(photos.length > 0 || dejaLa.length > 0) && (
          <ul className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
            {dejaLa.map((j) => (
              <li key={j.id} className="group relative">
                <Vignette
                  src={`/api/ndf/media/${j.id}`}
                  pdf={j.mimeType === "application/pdf"}
                  nom={j.nomOrigine}
                />
                <BoutonRetirer onClick={() => void retirerExistant(j.id)} />
              </li>
            ))}
            {photos.map((p) => (
              <li key={p.id} className="group relative">
                <Vignette
                  src={p.url}
                  pdf={p.mimeType === "application/pdf"}
                  nom={p.nom}
                />
                <BoutonRetirer onClick={() => retirerPhoto(p.id)} />
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* --------------------------------------------------------- montant */}
      <section className="mb-6">
        <Label htmlFor="montant">Montant payé</Label>
        <div className="relative">
          <input
            id="montant"
            value={montant}
            onChange={(e) => setMontant(e.target.value)}
            inputMode="decimal"
            placeholder="0,00"
            autoComplete="off"
            className="h-16 w-full border border-hairline bg-surface pr-12 pl-4 text-3xl font-semibold tabular-nums text-fg outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
          />
          <span className="pointer-events-none absolute top-1/2 right-4 -translate-y-1/2 text-2xl text-muted">
            €
          </span>
        </div>
        {montant.trim() !== "" && montantCents == null && (
          <p className="mt-1.5 text-sm text-danger">
            Montant illisible — écris par exemple 12,40
          </p>
        )}
      </section>

      {/* ------------------------------------------------------- catégorie */}
      <section className="mb-6">
        <Label>Rubrique</Label>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {categories.map((c) => {
            const actif = categorie === c;
            return (
              <button
                key={c}
                type="button"
                onClick={() => setCategorie(c)}
                aria-pressed={actif}
                className={cn(
                  "flex items-start gap-3 rounded-xl border px-4 py-3 text-left transition",
                  actif
                    ? "border-brand bg-brand-soft ring-2 ring-brand/25"
                    : "border-border bg-surface hover:border-brand/40 hover:bg-surface-2",
                )}
              >
                <span
                  className={cn(
                    "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border",
                    actif
                      ? "border-brand bg-brand text-brand-fg"
                      : "border-border",
                  )}
                >
                  {actif && <Check className="h-3.5 w-3.5" />}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-fg">
                    {LIBELLE_CATEGORIE[c]}
                  </span>
                  <span className="block text-xs text-muted">
                    {EXEMPLE_CATEGORIE[c]}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {/* ------------------------------------------------------------ date */}
      <section className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="date">Date du ticket</Label>
          <Input
            id="date"
            type="date"
            value={date}
            max={new Date().toISOString().slice(0, 10)}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="affaire">
            Affaire <span className="font-normal text-muted">(facultatif)</span>
          </Label>
          <Combobox
            value={affaire}
            onInput={setAffaire}
            onPick={(o) => setAffaire(o.value)}
            options={optionsAffaire}
            placeholder="N° d'affaire, ou rien"
          />
        </div>
      </section>

      {/* ------------------------------------------------------ descriptif */}
      <section className="mb-6">
        <Label htmlFor="descriptif">Descriptif</Label>
        <Input
          id="descriptif"
          value={descriptif}
          onChange={(e) => setDescriptif(e.target.value)}
          list="ndf-descriptifs"
          placeholder="Péage A26, plein gazole, déjeuner…"
        />
        <datalist id="ndf-descriptifs">
          {descriptifsRecents.map((d) => (
            <option key={d} value={d} />
          ))}
        </datalist>
      </section>

      {/* ------------------------------------------ invités (repas d'affaires) */}
      {categorie && demandeInvites(categorie) && (
        <section className="mb-6 border border-hairline bg-surface-2 p-4">
          <p className="mb-3 text-sm font-medium text-fg">
            Repas d&apos;affaires — la compta a besoin de savoir avec qui.
          </p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-[8rem_1fr]">
            <div>
              <Label htmlFor="nbInvites">Nbre invités</Label>
              <Input
                id="nbInvites"
                type="number"
                min={0}
                value={nbInvites}
                onChange={(e) => setNbInvites(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="invites">Sociétés et noms des invités</Label>
              <Input
                id="invites"
                value={invites}
                onChange={(e) => setInvites(e.target.value)}
                placeholder="Ex. Sogea — M. Martin, Mme Bernard"
              />
            </div>
          </div>
        </section>
      )}

      {/* ------------------------------------------------------------- TVA */}
      <section className="mb-6">
        <Label htmlFor="tva">
          TVA <span className="font-normal text-muted">(facultatif)</span>
        </Label>
        <Input
          id="tva"
          value={tva}
          onChange={(e) => setTva(e.target.value)}
          inputMode="decimal"
          placeholder="Montant de TVA lu sur le ticket"
          className="max-w-xs"
        />
      </section>

      {erreur && (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-danger/30 bg-danger/5 p-3 text-sm text-danger">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{erreur}</span>
        </div>
      )}

      {/* --------------------------------------- barre d'action collée en bas */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-surface/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center gap-3">
          <div className="min-w-0 flex-1">
            <div className="truncate text-lg font-semibold tabular-nums text-fg">
              {montantCents != null ? formatEuros(montantCents) : "—"}
            </div>
            <div className="truncate text-xs text-muted">
              {enCours
                ? etape
                : nbJustificatifs === 0
                  ? "Sans justificatif : hors note du mois"
                  : `${nbJustificatifs} justificatif${nbJustificatifs > 1 ? "s" : ""}`}
            </div>
          </div>
          <Button
            onClick={() => void soumettre()}
            disabled={!complet || enCours}
            size="lg"
          >
            {enCours ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Check className="h-4 w-4" />
            )}
            {depense ? "Mettre à jour" : "Enregistrer"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function Vignette({
  src,
  pdf,
  nom,
}: {
  src: string;
  pdf: boolean;
  nom: string;
}) {
  if (pdf) {
    return (
      <div className="flex aspect-square flex-col items-center justify-center gap-1 border border-hairline bg-surface-2 p-2 text-center">
        <FileText className="h-6 w-6 text-muted" />
        <span className="line-clamp-2 text-[10px] break-all text-muted">
          {nom || "PDF"}
        </span>
      </div>
    );
  }
  return (
    <Image
      src={src}
      alt={nom || "Justificatif"}
      width={200}
      height={200}
      unoptimized
      className="aspect-square w-full rounded-lg border border-border object-cover"
    />
  );
}

function BoutonRetirer({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Retirer ce justificatif"
      className="absolute top-1 right-1 rounded-full bg-surface/90 p-1.5 text-danger opacity-0 shadow-sm transition group-hover:opacity-100 focus:opacity-100"
    >
      <Trash2 className="h-3.5 w-3.5" />
    </button>
  );
}
