"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  FilePlus2,
  Pencil,
  ClipboardList,
  Trash2,
  ListChecks,
  Inbox,
} from "lucide-react";
import { Badge, Button, Card } from "@/ui";
import { creerFormulaire, supprimerFormulaire } from "./actions";
import type { FormulaireRow } from "./queries";

const dateFr = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

export function IndexFormulaires({
  qui,
  formulairesInitiaux,
  estAdmin,
}: {
  qui: string;
  formulairesInitiaux: FormulaireRow[];
  estAdmin: boolean;
}) {
  const router = useRouter();
  const [formulaires, setFormulaires] = useState(formulairesInitiaux);
  const [creation, demarrerCreation] = useTransition();
  const [suppr, setSuppr] = useState<string | null>(null);

  function nouveau() {
    demarrerCreation(async () => {
      const res = await creerFormulaire(qui);
      if ("id" in res) router.push(`/perso/${qui}/formulaires/${res.id}/edit`);
    });
  }

  async function supprimer(id: string) {
    setSuppr(null);
    setFormulaires((liste) => liste.filter((f) => f.id !== id));
    await supprimerFormulaire(id);
    router.refresh();
  }

  return (
    <div>
      <div className="mb-5 flex items-center justify-between gap-3">
        <p className="text-sm text-subtle">
          {formulaires.length} formulaire{formulaires.length > 1 ? "s" : ""}
          {estAdmin ? "" : " disponible" + (formulaires.length > 1 ? "s" : "")}
        </p>
        {estAdmin && (
          <Button onClick={nouveau} disabled={creation}>
            <FilePlus2 className="h-4 w-4" />
            {creation ? "Création…" : "Nouveau formulaire"}
          </Button>
        )}
      </div>

      {formulaires.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 border-dashed p-12 text-center">
          <ClipboardList className="h-8 w-8 text-subtle" />
          <p className="max-w-sm text-muted">
            {estAdmin
              ? "Aucun formulaire pour l'instant. Crée ton premier modèle : tu y déposeras tes champs, puis tu pourras le publier."
              : "Aucun formulaire disponible pour l'instant. Reviens quand un formulaire aura été publié."}
          </p>
          {estAdmin && (
            <Button onClick={nouveau} disabled={creation}>
              <FilePlus2 className="h-4 w-4" /> Nouveau formulaire
            </Button>
          )}
        </Card>
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {formulaires.map((f) => (
            <li key={f.id}>
              <Card className="group relative flex h-full flex-col overflow-hidden p-4 transition-all hover:-translate-y-0.5 hover:border-brand/30 hover:shadow-md">
                {/* filet d'accent (signature or/laiton) révélé au survol */}
                <span
                  aria-hidden
                  className="rule-accent absolute inset-x-0 top-0 h-0.5 opacity-0 transition-opacity group-hover:opacity-100"
                />
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="truncate font-semibold text-fg">
                      <Link
                        href={
                          estAdmin
                            ? `/perso/${qui}/formulaires/${f.id}/edit`
                            : `/perso/${qui}/formulaires/${f.id}/terrain`
                        }
                        className="hover:text-brand"
                      >
                        {f.nom}
                      </Link>
                    </h3>
                    {f.description && (
                      <p className="mt-0.5 line-clamp-2 text-sm text-muted">
                        {f.description}
                      </p>
                    )}
                  </div>
                  {estAdmin && (
                    <Badge tone={f.publie ? "success" : "neutral"}>
                      {f.publie ? "Publié" : "Brouillon"}
                    </Badge>
                  )}
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-subtle">
                  {estAdmin ? (
                    <>
                      <span className="tabular-nums">
                        {f.nbChamps} champ{f.nbChamps > 1 ? "s" : ""}
                      </span>
                      <span aria-hidden>·</span>
                      <span className="tabular-nums">
                        {f.nbReponses} réponse{f.nbReponses > 1 ? "s" : ""}
                      </span>
                      <span aria-hidden>·</span>
                      <span>maj {dateFr.format(new Date(f.updatedAt))}</span>
                      {f.publie && f.publieLe && (
                        <>
                          <span aria-hidden>·</span>
                          <span>publié le {dateFr.format(new Date(f.publieLe))}</span>
                        </>
                      )}
                    </>
                  ) : (
                    <>
                      <span className="tabular-nums">
                        {f.nbReponses} réponse{f.nbReponses > 1 ? "s" : ""} à ton
                        nom
                      </span>
                      <span aria-hidden>·</span>
                      <span>
                        dispo. le{" "}
                        {dateFr.format(new Date(f.publieLe ?? f.updatedAt))}
                      </span>
                    </>
                  )}
                </div>

                <div className="mt-4 flex items-center gap-2 border-t border-border pt-3">
                  {estAdmin ? (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          router.push(`/perso/${qui}/formulaires/${f.id}/edit`)
                        }
                      >
                        <Pencil className="h-3.5 w-3.5" /> Éditer
                      </Button>
                      <Link
                        href={`/perso/${qui}/formulaires/${f.id}/terrain`}
                        className="inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-sm text-fg hover:bg-surface-2"
                      >
                        <ListChecks className="h-3.5 w-3.5" /> Remplir
                      </Link>
                      <Link
                        href={`/perso/${qui}/formulaires/${f.id}/reponses`}
                        className="inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-sm text-fg hover:bg-surface-2"
                        title={`${f.nbReponses} réponse${f.nbReponses > 1 ? "s" : ""}`}
                      >
                        <Inbox className="h-3.5 w-3.5" /> Réponses
                        {f.nbReponses > 0 && (
                          <span className="rounded-full bg-brand-soft px-1.5 text-xs font-medium text-brand">
                            {f.nbReponses}
                          </span>
                        )}
                      </Link>
                      <div className="ml-auto">
                        {suppr === f.id ? (
                          <span className="flex items-center gap-1.5 text-xs">
                            <button
                              onClick={() => supprimer(f.id)}
                              className="rounded px-2 py-1 font-medium text-danger hover:bg-danger/10"
                            >
                              Confirmer
                            </button>
                            <button
                              onClick={() => setSuppr(null)}
                              className="rounded px-2 py-1 text-muted hover:bg-surface-2"
                            >
                              Annuler
                            </button>
                          </span>
                        ) : (
                          <button
                            onClick={() => setSuppr(f.id)}
                            title="Supprimer"
                            className="rounded-md p-1.5 text-subtle hover:bg-danger/10 hover:text-danger"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </>
                  ) : (
                    <>
                      <Link
                        href={`/perso/${qui}/formulaires/${f.id}/terrain`}
                        className="inline-flex h-8 items-center gap-1.5 rounded-md bg-brand px-3 text-sm font-medium text-brand-fg shadow-sm hover:bg-brand-strong"
                      >
                        <ListChecks className="h-3.5 w-3.5" /> Remplir
                      </Link>
                      <Link
                        href={`/perso/${qui}/formulaires/${f.id}/reponses`}
                        className="ml-auto inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-sm text-fg hover:bg-surface-2"
                      >
                        <Inbox className="h-3.5 w-3.5" /> Mes réponses
                        {f.nbReponses > 0 && (
                          <span className="rounded-full bg-brand-soft px-1.5 text-xs font-medium text-brand">
                            {f.nbReponses}
                          </span>
                        )}
                      </Link>
                    </>
                  )}
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
