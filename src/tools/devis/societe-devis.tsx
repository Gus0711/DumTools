"use client";

import { useState } from "react";
import { Building2, RotateCcw } from "lucide-react";
import { Button, EnteteBloc, Input, Label } from "@/ui";
import { enregistrerSociete } from "./actions";
import {
  SOCIETE_DEFAUT,
  formatPourcent,
  mentionsLegales,
  parsePourcent,
  type SocieteVue,
} from "./model";

/* -----------------------------------------------------------------------------
 * L'IDENTITÉ DE LA MAISON — ce qui s'imprime au bas de chaque devis
 *
 * Un seul jeu de valeurs pour tous les devis : c'est la décision prise le
 * 2026-08-08, et les devis historiques la confirment (mêmes conditions, même
 * acompte, même durée annoncée d'un client à l'autre). Rien ne se surcharge par
 * devis — le jour où il faudra un acompte à 30 % sur une affaire, le champ
 * descendra sur le devis.
 *
 * L'écran montre le PIED DE PAGE tel qu'il sortira : une mention légale ne se
 * vérifie pas sur un formulaire, elle se vérifie sur le document.
 * -------------------------------------------------------------------------- */

export function SocieteBloc({
  societe,
  enCours,
  agir,
}: {
  societe: SocieteVue;
  enCours: boolean;
  agir: (fn: () => Promise<unknown>) => void;
}) {
  const [v, setV] = useState<SocieteVue>(societe);
  const [acompte, setAcompte] = useState(formatPourcent(societe.acomptePourMille * 10));
  const [erreurAcompte, setErreurAcompte] = useState<string | null>(null);

  const champ = (cle: keyof SocieteVue, valeur: string) => setV((s) => ({ ...s, [cle]: valeur }));

  // L'aperçu se met à jour sous les doigts : c'est ce qui rend l'écran utile.
  const mentions = mentionsLegales(v);

  function enregistrer() {
    const pm = parseAcompte(acompte);
    if (pm === null) {
      setErreurAcompte("Pourcentage illisible");
      return;
    }
    setErreurAcompte(null);
    agir(() => enregistrerSociete({ ...v, acomptePourMille: pm }));
  }

  return (
    <section className="bloc signal-ao">
      <EnteteBloc
        icone={Building2}
        titre="La maison"
        mention="ce qui s'imprime sur chaque devis"
        actions={
          <button
            type="button"
            disabled={enCours}
            onClick={() => {
              setV(SOCIETE_DEFAUT);
              setAcompte(formatPourcent(SOCIETE_DEFAUT.acomptePourMille * 10));
            }}
            title="Remettre les valeurs d'origine dans le formulaire (rien n'est enregistré avant de valider)"
            className="inline-flex items-center gap-1.5 text-xs text-muted transition-colors hover:text-brand"
          >
            <RotateCcw className="h-3.5 w-3.5" /> Valeurs d&apos;origine
          </button>
        }
      />

      <div className="space-y-4 p-4">
        <Groupe titre="Identité">
          <Champ
            label="Raison sociale"
            valeur={v.raisonSociale}
            onChange={(x) => champ("raisonSociale", x)}
            placeholder="DUMORTIER"
          />
          <Champ
            label="Forme et capital"
            valeur={v.formeCapital}
            onChange={(x) => champ("formeCapital", x)}
            placeholder="SAS au capital de 38 112,25 €"
            large
          />
        </Groupe>

        <Groupe titre="Coordonnées">
          <Champ
            label="Adresse"
            valeur={v.adresse}
            onChange={(x) => champ("adresse", x)}
            placeholder="ZAC du Château"
            large
          />
          <Champ
            label="Code postal"
            valeur={v.codePostal}
            onChange={(x) => champ("codePostal", x)}
            placeholder="02800"
          />
          <Champ
            label="Ville"
            valeur={v.ville}
            onChange={(x) => champ("ville", x)}
            placeholder="CHARMES"
            aide="Sert aussi de lieu d'émission : « CHARMES, le 08/08/2026 »."
          />
          <Champ
            label="Téléphone"
            valeur={v.telephone}
            onChange={(x) => champ("telephone", x)}
            placeholder="03 23 38 18 88"
          />
          <Champ
            label="E-mail"
            valeur={v.email}
            onChange={(x) => champ("email", x)}
            placeholder="dumortier@fareneit.fr"
          />
          <Champ
            label="Site"
            valeur={v.siteWeb}
            onChange={(x) => champ("siteWeb", x)}
            placeholder="www.fareneit.fr"
          />
        </Groupe>

        <Groupe titre="Mentions légales">
          <Champ label="RCS" valeur={v.rcs} onChange={(x) => champ("rcs", x)} large />
          <Champ label="Code APE" valeur={v.codeApe} onChange={(x) => champ("codeApe", x)} />
          <Champ
            label="TVA intracommunautaire"
            valeur={v.tvaIntracom}
            onChange={(x) => champ("tvaIntracom", x)}
          />
        </Groupe>

        <Groupe titre="Règlement">
          <Champ label="IBAN" valeur={v.iban} onChange={(x) => champ("iban", x)} large mono />
          <Champ label="BIC" valeur={v.bic} onChange={(x) => champ("bic", x)} mono />
          <Champ
            label="Règlement par"
            valeur={v.reglement}
            onChange={(x) => champ("reglement", x)}
            placeholder="Virement"
          />
          <Champ
            label="Conditions"
            valeur={v.conditionsReglement}
            onChange={(x) => champ("conditionsReglement", x)}
            placeholder="30 jours NET"
          />
          <div>
            <Label htmlFor="acompte">Acompte à la commande</Label>
            <Input
              id="acompte"
              value={acompte}
              onChange={(e) => setAcompte(e.target.value)}
              placeholder="50 %"
              className="mt-1 tabular-nums"
            />
            <p className="mt-1 text-xs text-subtle">
              {erreurAcompte ? (
                <span className="text-danger">{erreurAcompte}</span>
              ) : (
                "Calculé sur le TTC. À zéro, la ligne disparaît du document."
              )}
            </p>
          </div>
          <Champ
            label="Durée estimée de réalisation"
            valeur={v.dureeRealisation}
            onChange={(x) => champ("dureeRealisation", x)}
            placeholder="15 jours"
          />
        </Groupe>

        <div>
          <Label htmlFor="remarques">Remarques particulières</Label>
          <textarea
            id="remarques"
            rows={3}
            value={v.remarques}
            onChange={(e) => champ("remarques", e.target.value)}
            placeholder="Encart imprimé sur chaque devis. Vide : l'encart n'apparaît pas."
            className="mt-1 w-full resize-y rounded-md border border-border bg-surface px-2.5 py-1.5 text-sm leading-snug text-fg outline-none focus:border-brand/50"
          />
        </div>

        {/* Le pied de page tel qu'il s'imprimera — la seule vérification qui
            compte pour une mention légale. */}
        <div>
          <Label>Pied de page du document</Label>
          <div className="mt-1 border border-hairline bg-surface-2 px-3 py-2.5 text-center text-[0.7rem] leading-relaxed text-muted">
            {mentions.length === 0 ? (
              <span className="text-subtle">Aucune mention : le pied de page sera vide.</span>
            ) : (
              mentions.map((l, i) => (
                <div key={i} className={i === 0 ? "font-semibold text-fg" : undefined}>
                  {l}
                </div>
              ))
            )}
          </div>
        </div>

        <div className="flex justify-end">
          <Button variant="primary" disabled={enCours} onClick={enregistrer}>
            Enregistrer
          </Button>
        </div>
      </div>
    </section>
  );
}

/** « 50 » / « 50 % » / « 33,5 % » → pour mille. */
function parseAcompte(saisie: string): number | null {
  const centieme = parsePourcent(saisie);
  if (centieme === null) return null;
  const pourMille = Math.round(centieme / 10);
  return pourMille >= 0 && pourMille <= 1000 ? pourMille : null;
}

function Groupe({ titre, children }: { titre: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="stamp mb-2">{titre}</p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{children}</div>
    </div>
  );
}

function Champ({
  label,
  valeur,
  onChange,
  placeholder,
  aide,
  large,
  mono,
}: {
  label: string;
  valeur: string;
  onChange: (v: string) => void;
  placeholder?: string;
  aide?: string;
  large?: boolean;
  mono?: boolean;
}) {
  return (
    <div className={large ? "sm:col-span-2" : undefined}>
      <Label>{label}</Label>
      <Input
        value={valeur}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={mono ? "mt-1 font-mono text-sm" : "mt-1"}
      />
      {aide && <p className="mt-1 text-xs text-subtle">{aide}</p>}
    </div>
  );
}
