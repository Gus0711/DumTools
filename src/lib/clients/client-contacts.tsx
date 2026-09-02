"use client";

import { useState } from "react";
import {
  Check,
  Mail,
  Phone,
  Plus,
  Star,
  Trash2,
  TriangleAlert,
  Users,
  X,
} from "lucide-react";
import { Button, EnteteBloc, EtatVide, Input, Label } from "@/ui";
import {
  basculerActifContact,
  creerContact,
  definirContactPrincipal,
  majContact,
  supprimerContact,
  type SaisieContact,
} from "./actions";
import type { ContactClientVue } from "./types";

/* -----------------------------------------------------------------------------
 * LES PERSONNES CHEZ LE CLIENT
 *
 * Il y en a plusieurs, et c'est tout l'intérêt : le chargé d'affaires, le
 * conducteur de travaux, la comptabilité. Un devis en choisit UNE et la FIGE —
 * ce tableau est le référentiel qui vit, pas ce que porte un devis parti.
 *
 * Deux gestes se distinguent, et il ne faut pas les confondre :
 *   • RETIRER (actif = false) — la personne a quitté la maison. Elle reste
 *     visible ici, et les devis qui la citent gardent leur destinataire.
 *   • SUPPRIMER — l'erreur de frappe. Franc, et confirmé.
 * -------------------------------------------------------------------------- */

const VIDE: SaisieContact = {
  civilite: "",
  nom: "",
  fonction: "",
  email: "",
  telephone: "",
  mobile: "",
  note: "",
};

export function ClientContacts({
  clientId,
  contacts,
}: {
  clientId: string;
  contacts: ContactClientVue[];
}) {
  // Pas de `useTransition` (docs/DEVIS.md §20) ; pas de `router.refresh()` non
  // plus : chaque action de ce fichier revalide déjà `/clients/{id}`.
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  /** null = rien d'ouvert ; "" = le formulaire d'ajout ; sinon l'id édité. */
  const [ouvert, setOuvert] = useState<string | null>(null);

  async function agir(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setErreur(null);
    setEnCours(true);
    try {
      const res = await fn();
      if (!res.ok) {
        setErreur(res.error ?? "Opération impossible");
        return false;
      }
      return true;
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Opération impossible");
      return false;
    } finally {
      setEnCours(false);
    }
  }

  return (
    <section className="bloc signal-accent">
      <EnteteBloc
        icone={Users}
        titre="Contacts"
        compteur={contacts.length}
        mention="à qui les devis sont adressés"
        actions={
          <Button
            size="sm"
            variant="ghost"
            disabled={enCours}
            onClick={() => setOuvert(ouvert === "" ? null : "")}
          >
            <Plus className="h-4 w-4" /> Ajouter
          </Button>
        }
      />

      {erreur && (
        <p className="flex items-center gap-1.5 border-b border-hairline px-4 py-2 text-sm text-danger">
          <TriangleAlert className="h-4 w-4" /> {erreur}
        </p>
      )}

      {ouvert === "" && (
        <Formulaire
          titre="Nouveau contact"
          enCours={enCours}
          onAnnuler={() => setOuvert(null)}
          onValider={async (saisie) => {
            if (await agir(() => creerContact(clientId, saisie))) setOuvert(null);
          }}
        />
      )}

      {contacts.length === 0 && ouvert !== "" ? (
        <EtatVide
          dessin="carnet"
          titre="Personne chez ce client"
          texte="Ajoutez la personne à qui les devis sont adressés : elle pré-remplira le destinataire."
          action={
            <Button size="sm" onClick={() => setOuvert("")}>
              <Plus className="h-4 w-4" /> Ajouter un contact
            </Button>
          }
        />
      ) : (
        <div className="data-card">
          <table className="data-table table-cards w-full">
            <thead>
              <tr>
                <th>Nom</th>
                <th>Fonction</th>
                <th>E-mail</th>
                <th>Téléphone</th>
                <th className="w-px" />
              </tr>
            </thead>
            <tbody>
              {contacts.map((c) =>
                ouvert === c.id ? (
                  <tr key={c.id}>
                    <td colSpan={5} className="p-0">
                      <Formulaire
                        titre={`Modifier ${c.nom}`}
                        depart={c}
                        enCours={enCours}
                        onAnnuler={() => setOuvert(null)}
                        onValider={async (saisie) => {
                          if (await agir(() => majContact(c.id, saisie))) setOuvert(null);
                        }}
                      />
                    </td>
                  </tr>
                ) : (
                  <Rangee
                    key={c.id}
                    contact={c}
                    enCours={enCours}
                    onEditer={() => setOuvert(c.id)}
                    onPrincipal={() => agir(() => definirContactPrincipal(c.id))}
                    onActif={(actif) => agir(() => basculerActifContact(c.id, actif))}
                    onSupprimer={() => {
                      if (
                        confirm(
                          `Supprimer ${c.nom} ? Les devis qui lui ont été adressés gardent leur destinataire.`,
                        )
                      ) {
                        void agir(() => supprimerContact(c.id));
                      }
                    }}
                  />
                ),
              )}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function Rangee({
  contact: c,
  enCours,
  onEditer,
  onPrincipal,
  onActif,
  onSupprimer,
}: {
  contact: ContactClientVue;
  enCours: boolean;
  onEditer: () => void;
  onPrincipal: () => void;
  onActif: (actif: boolean) => void;
  onSupprimer: () => void;
}) {
  return (
    <tr className={c.actif ? undefined : "opacity-55"}>
      <td className="cell-card-title">
        <button
          type="button"
          onClick={onEditer}
          disabled={enCours}
          className="text-left font-medium text-fg hover:text-brand"
        >
          {c.civilite && <span className="text-muted">{c.civilite} </span>}
          {c.nom}
        </button>
        {c.principal && (
          <span className="ml-2 inline-flex items-center gap-1 rounded bg-signal/12 px-1.5 py-0.5 text-[0.68rem] font-medium text-signal">
            <Star className="h-3 w-3" /> proposé
          </span>
        )}
        {!c.actif && <span className="ml-2 text-xs text-subtle">retiré</span>}
      </td>
      <td className="text-muted">{c.fonction || <span className="text-subtle">—</span>}</td>
      <td>
        {c.email ? (
          <a href={`mailto:${c.email}`} className="inline-flex items-center gap-1.5 hover:text-brand">
            <Mail className="h-3.5 w-3.5 text-subtle" />
            {c.email}
          </a>
        ) : (
          <span className="text-subtle">—</span>
        )}
      </td>
      <td className="tabular-nums">
        {c.mobile || c.telephone ? (
          <a
            href={`tel:${(c.mobile || c.telephone).replace(/\s/g, "")}`}
            className="inline-flex items-center gap-1.5 hover:text-brand"
          >
            <Phone className="h-3.5 w-3.5 text-subtle" />
            {c.mobile || c.telephone}
          </a>
        ) : (
          <span className="text-subtle">—</span>
        )}
      </td>
      <td>
        <div className="flex items-center justify-end gap-1">
          {!c.principal && c.actif && (
            <button
              type="button"
              onClick={onPrincipal}
              disabled={enCours}
              title="Proposer cette personne d'office sur les nouveaux devis"
              className="rounded p-1.5 text-subtle transition-colors hover:bg-surface-2 hover:text-signal"
            >
              <Star className="h-4 w-4" />
            </button>
          )}
          <button
            type="button"
            onClick={() => onActif(!c.actif)}
            disabled={enCours}
            title={
              c.actif
                ? "A quitté la maison : le retirer des propositions (les devis le citant sont conservés)"
                : "Le remettre dans les propositions"
            }
            className="rounded p-1.5 text-subtle transition-colors hover:bg-surface-2 hover:text-fg"
          >
            {c.actif ? <X className="h-4 w-4" /> : <Check className="h-4 w-4" />}
          </button>
          <button
            type="button"
            onClick={onSupprimer}
            disabled={enCours}
            title="Supprimer définitivement"
            className="rounded p-1.5 text-subtle transition-colors hover:bg-danger/12 hover:text-danger"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </td>
    </tr>
  );
}

function Formulaire({
  titre,
  depart,
  enCours,
  onValider,
  onAnnuler,
}: {
  titre: string;
  depart?: ContactClientVue;
  enCours: boolean;
  onValider: (saisie: SaisieContact) => void;
  onAnnuler: () => void;
}) {
  const [v, setV] = useState<SaisieContact>(
    depart
      ? {
          civilite: depart.civilite,
          nom: depart.nom,
          fonction: depart.fonction,
          email: depart.email,
          telephone: depart.telephone,
          mobile: depart.mobile,
          note: depart.note,
        }
      : VIDE,
  );
  const champ = (cle: keyof SaisieContact, valeur: string) =>
    setV((s) => ({ ...s, [cle]: valeur }));

  return (
    <div className="border-b border-hairline bg-surface-2 p-4">
      <p className="stamp mb-2">{titre}</p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <Label htmlFor="ct-civ">Civilité</Label>
          <Input
            id="ct-civ"
            value={v.civilite}
            disabled={enCours}
            onChange={(e) => champ("civilite", e.target.value)}
            placeholder="M."
            className="mt-1"
          />
        </div>
        <div>
          <Label htmlFor="ct-nom">Nom</Label>
          <Input
            id="ct-nom"
            value={v.nom}
            disabled={enCours}
            onChange={(e) => champ("nom", e.target.value)}
            placeholder="Jean Dupont"
            className="mt-1"
            autoFocus
          />
        </div>
        <div className="lg:col-span-2">
          <Label htmlFor="ct-fonction">Fonction</Label>
          <Input
            id="ct-fonction"
            value={v.fonction}
            disabled={enCours}
            onChange={(e) => champ("fonction", e.target.value)}
            placeholder="Conducteur de travaux"
            className="mt-1"
          />
        </div>
        <div className="lg:col-span-2">
          <Label htmlFor="ct-mail">E-mail</Label>
          <Input
            id="ct-mail"
            type="email"
            value={v.email}
            disabled={enCours}
            onChange={(e) => champ("email", e.target.value)}
            placeholder="j.dupont@societe.fr"
            className="mt-1"
          />
        </div>
        <div>
          <Label htmlFor="ct-tel">Téléphone</Label>
          <Input
            id="ct-tel"
            value={v.telephone}
            disabled={enCours}
            onChange={(e) => champ("telephone", e.target.value)}
            className="mt-1"
          />
        </div>
        <div>
          <Label htmlFor="ct-mob">Mobile</Label>
          <Input
            id="ct-mob"
            value={v.mobile}
            disabled={enCours}
            onChange={(e) => champ("mobile", e.target.value)}
            className="mt-1"
          />
        </div>
        <div className="sm:col-span-2 lg:col-span-4">
          <Label htmlFor="ct-note">Note</Label>
          <Input
            id="ct-note"
            value={v.note}
            disabled={enCours}
            onChange={(e) => champ("note", e.target.value)}
            placeholder="Ne répond qu'aux mails, absent le mercredi…"
            className="mt-1"
          />
        </div>
      </div>
      <div className="mt-3 flex justify-end gap-2">
        <Button variant="ghost" size="sm" disabled={enCours} onClick={onAnnuler}>
          Annuler
        </Button>
        <Button
          variant="primary"
          size="sm"
          disabled={enCours || !v.nom.trim()}
          onClick={() => onValider(v)}
        >
          Enregistrer
        </Button>
      </div>
    </div>
  );
}
