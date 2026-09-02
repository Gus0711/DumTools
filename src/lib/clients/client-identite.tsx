"use client";

import { useState } from "react";
import { MapPin, TriangleAlert } from "lucide-react";
import { Button, EnteteBloc, Input, Label } from "@/ui";
import { paveDestinatairePropose } from "@/tools/devis/model";
import { majIdentiteClient } from "./actions";
import type { ClientDetail } from "./types";

/* -----------------------------------------------------------------------------
 * L'IDENTITÉ POSTALE DU CLIENT
 *
 * Ce bloc ne sert pas à « remplir une fiche » : il sert à ce qu'un devis parte
 * à la bonne adresse sans la retaper. D'où l'aperçu du PAVÉ à droite — une
 * adresse ne se vérifie pas sur un formulaire, elle se vérifie sur le document
 * (même raison que l'aperçu du pied de page dans « La maison »).
 *
 * ⚠️ Rien ici ne remonte modifier un devis existant : le devis fige, le
 * référentiel vit (docs/DEVIS.md §24). Corriger une adresse ne change aucun
 * devis déjà chiffré — c'est le bouton « Reprendre du client » de l'éditeur qui
 * décide, devis par devis.
 * -------------------------------------------------------------------------- */

type Identite = Pick<
  ClientDetail,
  "adresse" | "codePostal" | "ville" | "telephone" | "email"
>;

export function ClientIdentite({
  client,
}: {
  client: ClientDetail;
}) {
  const [v, setV] = useState<Identite>({
    adresse: client.adresse,
    codePostal: client.codePostal,
    ville: client.ville,
    telephone: client.telephone,
    email: client.email,
  });
  // Pas de `useTransition` autour d'une écriture : React se réserve le droit de
  // rejouer un rendu de transition, et la réponse s'y perd (docs/DEVIS.md §20).
  // Pas de `router.refresh()` non plus — l'action revalide déjà ce chemin, et
  // deux rafraîchissements pour un écran se courent après.
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enregistre, setEnregistre] = useState(false);

  const champ = (cle: keyof Identite, valeur: string) => {
    setV((s) => ({ ...s, [cle]: valeur }));
    setEnregistre(false);
  };

  // Le principal s'il existe : c'est lui que le devis proposera.
  const contact = client.contacts.find((c) => c.principal && c.actif) ?? null;
  const pave = paveDestinatairePropose({ nom: client.nom, ...v }, contact);

  async function enregistrer() {
    setErreur(null);
    setEnCours(true);
    try {
      const res = await majIdentiteClient(client.id, v);
      if (!res.ok) setErreur(res.error ?? "Enregistrement impossible");
      else setEnregistre(true);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Enregistrement impossible");
    } finally {
      setEnCours(false);
    }
  }

  return (
    <section className="bloc signal-accent">
      <EnteteBloc
        icone={MapPin}
        titre="Coordonnées"
        mention="ce qui pré-remplit le destinataire d'un devis"
      />

      <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,18rem)]">
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label htmlFor="cli-adresse">Adresse</Label>
              <textarea
                id="cli-adresse"
                rows={2}
                value={v.adresse}
                disabled={enCours}
                onChange={(e) => champ("adresse", e.target.value)}
                placeholder={"12 rue de la Gare\nBP 40"}
                className="mt-1 w-full resize-y rounded-md border border-border bg-surface px-2.5 py-1.5 text-sm leading-snug text-fg outline-none focus:border-brand/50"
              />
              <p className="mt-1 text-xs text-subtle">
                Une ligne saisie = une ligne imprimée.
              </p>
            </div>
            <div>
              <Label htmlFor="cli-cp">Code postal</Label>
              <Input
                id="cli-cp"
                value={v.codePostal}
                disabled={enCours}
                onChange={(e) => champ("codePostal", e.target.value)}
                placeholder="02800"
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="cli-ville">Ville</Label>
              <Input
                id="cli-ville"
                value={v.ville}
                disabled={enCours}
                onChange={(e) => champ("ville", e.target.value)}
                placeholder="CHARMES"
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="cli-tel">Téléphone</Label>
              <Input
                id="cli-tel"
                value={v.telephone}
                disabled={enCours}
                onChange={(e) => champ("telephone", e.target.value)}
                placeholder="03 23 38 18 88"
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="cli-email">E-mail</Label>
              <Input
                id="cli-email"
                type="email"
                value={v.email}
                disabled={enCours}
                onChange={(e) => champ("email", e.target.value)}
                placeholder="accueil@societe.fr"
                className="mt-1"
              />
              <p className="mt-1 text-xs text-subtle">
                L&apos;adresse générale de la société. Les personnes sont plus bas.
              </p>
            </div>
          </div>

          <div className="flex items-center justify-end gap-3">
            {erreur && (
              <span className="flex items-center gap-1.5 text-sm text-danger">
                <TriangleAlert className="h-4 w-4" /> {erreur}
              </span>
            )}
            {enregistre && !erreur && (
              <span className="text-sm text-success">Enregistré</span>
            )}
            <Button variant="primary" disabled={enCours} onClick={enregistrer}>
              Enregistrer
            </Button>
          </div>
        </div>

        {/* Le pavé tel qu'il sera proposé — la seule vérification qui compte. */}
        <div>
          <Label>Destinataire proposé sur un devis</Label>
          <div className="mt-1 h-[calc(100%-1.75rem)] border border-hairline bg-surface-2 px-3 py-2.5 text-sm leading-relaxed text-muted">
            {pave ? (
              pave.split("\n").map((l, i) => (
                <div key={i} className={i === 0 ? "font-semibold text-fg" : undefined}>
                  {l}
                </div>
              ))
            ) : (
              <span className="text-subtle">
                Sans adresse, un devis part avec le seul nom du client.
              </span>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
