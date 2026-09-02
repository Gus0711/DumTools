"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FileText, Search, Trash2, Upload } from "lucide-react";
import { Badge, EtatVide, Input } from "@/ui";
import {
  CATEGORIES_DOC,
  TAILLE_MAX_DOCUMENTATION,
  formatTaille,
  libelleCategorieDoc,
  lienDocumentation,
  type DocumentationAvecProduits,
} from "./model";
import { supprimerDocumentation } from "./actions";

/* La bibliothèque de fiches — une ligne par document, les produits qu'il sert
 * en dessous. Un document SANS produit est signalé plutôt que caché : il ne
 * remonte alors nulle part, et c'est exactement ce qu'on veut voir. */

export function BibliothequeDocumentation({
  docs,
  peutGerer,
}: {
  docs: DocumentationAvecProduits[];
  peutGerer: boolean;
}) {
  const router = useRouter();
  const [filtre, setFiltre] = useState("");
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const terme = filtre.trim().toLowerCase();
  const visibles = terme
    ? docs.filter(
        (d) =>
          d.titre.toLowerCase().includes(terme) ||
          d.produits.some(
            (p) =>
              p.refInterne.toLowerCase().includes(terme) ||
              p.designation.toLowerCase().includes(terme),
          ),
      )
    : docs;

  async function televerser(file: File) {
    setErreur(null);
    if (file.size > TAILLE_MAX_DOCUMENTATION) {
      setErreur(`Fichier trop volumineux (max ${Math.round(TAILLE_MAX_DOCUMENTATION / 1048576)} Mo)`);
      return;
    }
    setEnCours(true);
    try {
      const fd = new FormData();
      fd.set("file", file);
      const r = await fetch("/api/magasin/documentation", { method: "POST", body: fd });
      if (!r.ok) {
        const j = await r.json().catch(() => null);
        throw new Error(j?.error ?? "Téléversement refusé");
      }
      router.refresh();
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Téléversement impossible");
    } finally {
      setEnCours(false);
    }
  }

  async function supprimer(d: DocumentationAvecProduits) {
    const n = d.produits.length;
    const question =
      n > 0
        ? `« ${d.titre} » est rattachée à ${n} produit${n > 1 ? "s" : ""}. La supprimer la retire partout. Continuer ?`
        : `Supprimer « ${d.titre} » ?`;
    if (!confirm(question)) return;
    setErreur(null);
    setEnCours(true);
    try {
      await supprimerDocumentation(d.id);
      router.refresh();
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Suppression impossible");
    } finally {
      setEnCours(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" />
          <Input
            value={filtre}
            onChange={(e) => setFiltre(e.target.value)}
            placeholder="Chercher une fiche, une référence, un produit…"
            className="pl-9"
          />
        </div>
        {peutGerer && (
          <label className="inline-flex h-[var(--control-h)] cursor-pointer items-center gap-2 rounded-md bg-brand px-4 text-sm text-brand-fg shadow-sm transition-colors hover:bg-brand-strong">
            <Upload className="h-4 w-4" />
            {enCours ? "Envoi…" : "Téléverser"}
            <input
              type="file"
              className="hidden"
              disabled={enCours}
              accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx,.xls,.xlsx,.zip"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) televerser(f);
                e.target.value = "";
              }}
            />
          </label>
        )}
      </div>

      {erreur && (
        <p className="bloc bg-danger-soft px-4 py-2 text-sm text-danger">{erreur}</p>
      )}

      {visibles.length === 0 ? (
        <div className="bloc">
          <EtatVide
            dessin="pochette"
            titre={docs.length === 0 ? "Bibliothèque vide" : "Aucun résultat"}
            texte={
              docs.length === 0
                ? "Téléversez une fiche, ou ajoutez-la depuis la fiche d'un produit — c'est là qu'elle prend son sens."
                : "Aucune fiche ne correspond à cette recherche."
            }
          />
        </div>
      ) : (
        <ul className="planche">
          {visibles.map((d) => (
            <li key={d.id} className="bloc p-4">
              <div className="flex flex-wrap items-center gap-2">
                <FileText className="h-4 w-4 shrink-0 text-subtle" />
                <a
                  href={lienDocumentation(d)}
                  target="_blank"
                  rel="noreferrer"
                  className="min-w-0 flex-1 truncate font-medium text-fg hover:text-brand hover:underline"
                >
                  {d.titre}
                </a>
                <Badge tone="neutral">{libelleCategorieDoc(d.categorie)}</Badge>
                <span className="shrink-0 text-xs text-subtle">
                  {d.url ? "lien constructeur" : formatTaille(d.taille)}
                </span>
                {peutGerer && (
                  <button
                    type="button"
                    disabled={enCours}
                    onClick={() => supprimer(d)}
                    aria-label="Supprimer"
                    className="shrink-0 text-subtle transition-colors hover:text-danger"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              {d.produits.length === 0 ? (
                <p className="mt-1.5 text-xs text-warning">
                  Rattachée à aucun produit — elle n&apos;apparaîtra ni sur une fiche article, ni
                  en annexe d&apos;un devis.
                </p>
              ) : (
                <ul className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted">
                  {d.produits.map((p) => (
                    <li key={p.id}>
                      <Link
                        href={`/outils/magasin/produits/${p.id}`}
                        className="hover:text-brand hover:underline"
                      >
                        <span className="ref">{p.refInterne}</span> {p.designation}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}

      <p className="text-xs text-subtle">
        Natures disponibles : {CATEGORIES_DOC.map((c) => c.libelle).join(" · ")}. Une fiche peut
        servir plusieurs produits — « ECY IO Modules » couvre les six modules d&apos;extension, et
        n&apos;existe qu&apos;une fois.
      </p>
    </div>
  );
}
