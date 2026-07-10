"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  Copy,
  KeyRound,
  KeySquare,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  ShieldCheck,
  Trash2,
  User,
  X,
} from "lucide-react";
import { Button, Input, Label } from "@/ui";
import { cn } from "@/lib/cn";
import type { UtilisateurRow } from "./queries";
import {
  creerUtilisateur,
  genererJetonMcp,
  modifierUtilisateur,
  reinitialiserMotDePasse,
  revoquerJetonMcp,
} from "./actions";

type EditDraft = { id: string; nom: string; role: string; actif: boolean };
type CreateDraft = { nom: string; email: string; motDePasse: string; role: string };

const selectCls =
  "h-9 rounded-md border border-border bg-surface px-2.5 text-sm text-fg";

export function ConfigUtilisateurs({
  utilisateurs,
  moiId,
}: {
  utilisateurs: UtilisateurRow[];
  moiId: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [erreur, setErreur] = useState<string | null>(null);
  const [creation, setCreation] = useState<CreateDraft | null>(null);
  const [edit, setEdit] = useState<EditDraft | null>(null);
  const [reset, setReset] = useState<{ id: string; motDePasse: string } | null>(null);
  // Panneau « Jeton MCP » ouvert pour un utilisateur donné.
  const [mcp, setMcp] = useState<{ id: string } | null>(null);
  // Jeton fraîchement généré (affiché une seule fois, pour copie).
  const [nouveauJeton, setNouveauJeton] = useState<string | null>(null);
  const [copie, setCopie] = useState(false);

  function run(action: () => Promise<void>, done?: () => void) {
    setErreur(null);
    startTransition(async () => {
      try {
        await action();
        done?.();
        router.refresh();
      } catch (e) {
        setErreur(e instanceof Error ? e.message : "Erreur inattendue");
      }
    });
  }

  function genererJeton(id: string) {
    setErreur(null);
    setCopie(false);
    startTransition(async () => {
      try {
        const { token } = await genererJetonMcp({ id });
        setNouveauJeton(token);
        router.refresh();
      } catch (e) {
        setErreur(e instanceof Error ? e.message : "Erreur inattendue");
      }
    });
  }

  function fermerMcp() {
    setMcp(null);
    setNouveauJeton(null);
    setCopie(false);
  }

  async function copierJeton() {
    if (!nouveauJeton) return;
    try {
      await navigator.clipboard.writeText(nouveauJeton);
      setCopie(true);
    } catch {
      /* le champ reste sélectionnable manuellement */
    }
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-6 md:px-10">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-fg">Utilisateurs</h1>
          <p className="mt-1 text-sm text-muted">
            Comptes autorisés à se connecter à DumTools. Les administrateurs peuvent
            gérer les comptes ; les membres accèdent aux outils.
          </p>
        </div>
        {pending && <Loader2 className="mt-1 h-5 w-5 animate-spin text-muted" />}
      </div>

      {erreur && (
        <div className="mb-4 rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
          {erreur}
        </div>
      )}

      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-fg">
          Comptes <span className="text-subtle">({utilisateurs.length})</span>
        </h2>
        <Button
          size="sm"
          variant="outline"
          onClick={() =>
            setCreation({ nom: "", email: "", motDePasse: "", role: "MEMBRE" })
          }
        >
          <Plus className="h-4 w-4" /> Ajouter un utilisateur
        </Button>
      </div>

      {/* Formulaire de création --------------------------------------------- */}
      {creation && (
        <div className="mb-4 rounded-lg border border-border bg-surface-2 p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>Nom</Label>
              <Input
                autoFocus
                value={creation.nom}
                onChange={(e) => setCreation({ ...creation, nom: e.target.value })}
                placeholder="Jean Dupont"
                className="mt-1"
              />
            </div>
            <div>
              <Label>Email</Label>
              <Input
                type="email"
                value={creation.email}
                onChange={(e) => setCreation({ ...creation, email: e.target.value })}
                placeholder="prenom.nom@dumortier02.fr"
                className="mt-1"
              />
            </div>
            <div>
              <Label>Mot de passe provisoire</Label>
              <Input
                type="text"
                value={creation.motDePasse}
                onChange={(e) =>
                  setCreation({ ...creation, motDePasse: e.target.value })
                }
                placeholder="8 caractères minimum"
                className="mt-1"
              />
            </div>
            <div>
              <Label>Rôle</Label>
              <select
                value={creation.role}
                onChange={(e) => setCreation({ ...creation, role: e.target.value })}
                className={cn(selectCls, "mt-1 w-full")}
              >
                <option value="MEMBRE">Membre</option>
                <option value="ADMIN">Administrateur</option>
              </select>
            </div>
          </div>
          <div className="mt-4 flex items-center justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setCreation(null)}>
              Annuler
            </Button>
            <Button
              size="sm"
              disabled={pending}
              onClick={() =>
                run(() => creerUtilisateur(creation), () => setCreation(null))
              }
            >
              <Check className="h-4 w-4" /> Créer le compte
            </Button>
          </div>
        </div>
      )}

      {/* Liste des comptes -------------------------------------------------- */}
      <div className="divide-y divide-border-soft overflow-hidden rounded-lg border border-border">
        {utilisateurs.map((u) => {
          const enEdition = edit?.id === u.id;
          const enReset = reset?.id === u.id;
          const enMcp = mcp?.id === u.id;
          return (
            <div key={u.id} className="bg-surface">
              <div className="flex flex-wrap items-center gap-3 px-4 py-3">
                <div
                  className={cn(
                    "flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
                    u.role === "ADMIN"
                      ? "bg-brand/10 text-brand"
                      : "bg-surface-2 text-muted",
                    !u.actif && "opacity-50",
                  )}
                >
                  {u.role === "ADMIN" ? (
                    <ShieldCheck className="h-5 w-5" />
                  ) : (
                    <User className="h-5 w-5" />
                  )}
                </div>

                {enEdition ? (
                  <Input
                    value={edit.nom}
                    onChange={(e) => setEdit({ ...edit, nom: e.target.value })}
                    className="h-9 w-48"
                  />
                ) : (
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className={cn("truncate font-medium text-fg", !u.actif && "text-muted")}>
                        {u.nom}
                      </span>
                      {u.id === moiId && (
                        <span className="rounded bg-surface-2 px-1.5 py-0.5 text-[10px] font-medium text-subtle">
                          vous
                        </span>
                      )}
                      {!u.actif && (
                        <span className="rounded bg-danger/10 px-1.5 py-0.5 text-[10px] font-medium text-danger">
                          désactivé
                        </span>
                      )}
                      {u.aJetonMcp && (
                        <span
                          className="rounded bg-brand/10 px-1.5 py-0.5 text-[10px] font-medium text-brand"
                          title="Jeton d'accès MCP actif"
                        >
                          MCP
                        </span>
                      )}
                    </div>
                    <div className="truncate text-xs text-subtle">{u.email}</div>
                  </div>
                )}

                {enEdition ? (
                  <>
                    <select
                      value={edit.role}
                      onChange={(e) => setEdit({ ...edit, role: e.target.value })}
                      className={selectCls}
                    >
                      <option value="MEMBRE">Membre</option>
                      <option value="ADMIN">Administrateur</option>
                    </select>
                    <label className="flex items-center gap-1.5 text-sm text-fg">
                      <input
                        type="checkbox"
                        checked={edit.actif}
                        onChange={(e) => setEdit({ ...edit, actif: e.target.checked })}
                        className="h-4 w-4 accent-brand"
                      />
                      Actif
                    </label>
                    <Button
                      size="sm"
                      disabled={pending}
                      onClick={() => run(() => modifierUtilisateur(edit), () => setEdit(null))}
                    >
                      <Check className="h-4 w-4" /> Enregistrer
                    </Button>
                    <Button size="icon" variant="ghost" onClick={() => setEdit(null)} aria-label="Annuler">
                      <X className="h-4 w-4" />
                    </Button>
                  </>
                ) : (
                  <>
                    <span className="hidden text-xs font-medium text-muted sm:inline">
                      {u.role === "ADMIN" ? "Administrateur" : "Membre"}
                    </span>
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label="Réinitialiser le mot de passe"
                      onClick={() => {
                        setReset(enReset ? null : { id: u.id, motDePasse: "" });
                        setEdit(null);
                        fermerMcp();
                      }}
                    >
                      <KeyRound className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label="Jeton d'accès MCP"
                      className={cn(u.aJetonMcp && "text-brand")}
                      onClick={() => {
                        if (enMcp) fermerMcp();
                        else {
                          setMcp({ id: u.id });
                          setNouveauJeton(null);
                          setCopie(false);
                        }
                        setEdit(null);
                        setReset(null);
                      }}
                    >
                      <KeySquare className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label="Modifier"
                      onClick={() => {
                        setEdit({ id: u.id, nom: u.nom, role: u.role, actif: u.actif });
                        setReset(null);
                      }}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                  </>
                )}
              </div>

              {/* Réinitialisation de mot de passe */}
              {enReset && (
                <div className="flex flex-wrap items-end gap-2 border-t border-border-soft bg-surface-2 px-4 py-3">
                  <div>
                    <Label>Nouveau mot de passe pour {u.nom}</Label>
                    <Input
                      autoFocus
                      type="text"
                      value={reset.motDePasse}
                      onChange={(e) => setReset({ ...reset, motDePasse: e.target.value })}
                      placeholder="8 caractères minimum"
                      className="mt-1 w-64"
                    />
                  </div>
                  <Button
                    size="sm"
                    disabled={pending}
                    onClick={() =>
                      run(() => reinitialiserMotDePasse(reset), () => setReset(null))
                    }
                  >
                    <Check className="h-4 w-4" /> Définir
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setReset(null)}>
                    Annuler
                  </Button>
                </div>
              )}

              {/* Jeton d'accès MCP */}
              {enMcp && (
                <div className="border-t border-border-soft bg-surface-2 px-4 py-3">
                  <div className="mb-2 flex items-center gap-2 text-sm font-medium text-fg">
                    <KeySquare className="h-4 w-4 text-brand" />
                    Jeton d'accès MCP — {u.nom}
                  </div>
                  <p className="mb-3 max-w-2xl text-xs text-muted">
                    Permet à ce compte de se connecter au serveur MCP (Claude
                    Desktop / Code) ; ses écritures lui sont attribuées. Le jeton
                    n'est affiché qu'une fois, à la génération, puis se met dans
                    l'en-tête « Authorization: Bearer … » du poste.
                  </p>

                  {nouveauJeton && (
                    <div className="mb-3">
                      <Label>Nouveau jeton — copiez-le maintenant</Label>
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        <Input
                          readOnly
                          value={nouveauJeton}
                          onFocus={(e) => e.currentTarget.select()}
                          className="w-full max-w-xl font-mono text-xs"
                        />
                        <Button size="sm" variant="outline" onClick={copierJeton}>
                          <Copy className="h-4 w-4" /> {copie ? "Copié" : "Copier"}
                        </Button>
                      </div>
                      <p className="mt-1 text-xs text-danger">
                        Ne sera plus réaffiché. Régénérer invalide ce jeton.
                      </p>
                    </div>
                  )}

                  <div className="flex flex-wrap items-center gap-2">
                    <Button size="sm" disabled={pending} onClick={() => genererJeton(u.id)}>
                      {u.aJetonMcp ? (
                        <>
                          <RefreshCw className="h-4 w-4" /> Régénérer
                        </>
                      ) : (
                        <>
                          <KeySquare className="h-4 w-4" /> Générer un jeton
                        </>
                      )}
                    </Button>
                    {u.aJetonMcp && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-danger"
                        disabled={pending}
                        onClick={() =>
                          run(() => revoquerJetonMcp({ id: u.id }), () => setNouveauJeton(null))
                        }
                      >
                        <Trash2 className="h-4 w-4" /> Révoquer
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" onClick={fermerMcp}>
                      Fermer
                    </Button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
