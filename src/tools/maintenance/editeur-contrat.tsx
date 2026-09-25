"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2, MapPinned, Plus, Save, Trash2 } from "lucide-react";
import { Button, Combobox, Input, Label } from "@/ui";
import { cn } from "@/lib/cn";
import { enregistrerContrat, resoudreSiteId, supprimerContrat } from "./actions";
import type { ClientAvecSites } from "./queries";
import {
  LIBELLE_ETAT,
  formatDuree,
  formatEuros,
  isoJour,
  parseEuros,
  parseHeures,
  type ContratDetail,
  type EtatContrat,
} from "./model";

/* L'éditeur de contrat — ce qu'on remplit UNE fois, contre ce qu'on relit cent
 * fois (la fiche). Il est donc long et plat : un formulaire honnête, pas un
 * assistant en quatre étapes pour huit champs.
 * ========================================================================== */

const ETATS: EtatContrat[] = ["ACTIF", "BROUILLON", "SUSPENDU", "TERMINE"];

const CLASSE_SELECT =
  "h-[var(--control-h)] w-full rounded-md border border-border bg-surface px-2.5 text-sm text-fg hover:border-brand/40 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20";

function heuresInitiales(min: number): string {
  if (min <= 0) return "";
  return min % 60 === 0 ? String(min / 60) : formatDuree(min);
}

export function EditeurContrat({
  qui,
  clients,
  contrat,
}: {
  qui: string;
  clients: ClientAvecSites[];
  /** Absent = création. */
  contrat?: ContratDetail;
}) {
  const router = useRouter();

  const [intitule, setIntitule] = useState(contrat?.intitule ?? "");
  const [clientNom, setClientNom] = useState(contrat?.clientNom ?? "");
  const [reference, setReference] = useState(contrat?.reference ?? "");
  const [numeroWhy, setNumeroWhy] = useState(contrat?.numeroWhy ?? "");
  const [etat, setEtat] = useState<EtatContrat>(contrat?.etat ?? "ACTIF");
  const [debut, setDebut] = useState(contrat?.debut ?? isoJour(new Date()));
  const [fin, setFin] = useState(contrat?.fin ?? "");
  const [tacite, setTacite] = useState(contrat?.tacite ?? true);
  const [preavis, setPreavis] = useState(String(contrat?.preavisJours ?? 90));
  const [tele, setTele] = useState(heuresInitiales(contrat?.quotaTeleMin ?? 0));
  const [presentiel, setPresentiel] = useState(
    heuresInitiales(contrat?.quotaPresentielMin ?? 0),
  );
  const [tarif, setTarif] = useState(
    contrat?.tarifHoraireCents ? String(contrat.tarifHoraireCents / 100) : "",
  );
  const [notes, setNotes] = useState(contrat?.notes ?? "");
  const [siteIds, setSiteIds] = useState<string[]>(
    contrat?.sites.map((s) => s.id) ?? [],
  );
  const [nouveauSite, setNouveauSite] = useState("");

  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  // Le client sélectionné, s'il existe déjà. Null = un nom neuf, qui sera créé
  // à l'enregistrement — il n'a alors pas encore de sites à cocher.
  const client = useMemo(
    () => clients.find((c) => c.nom.toLowerCase() === clientNom.trim().toLowerCase()) ?? null,
    [clients, clientNom],
  );

  // Les sites proposés : ceux du client, plus ceux qu'on vient d'ajouter.
  const [sitesLocaux, setSitesLocaux] = useState<{ id: string; nom: string }[]>([]);
  const sitesProposes = useMemo(() => {
    const base = client?.sites.filter((s) => s.actif || siteIds.includes(s.id)) ?? [];
    const vus = new Set(base.map((s) => s.id));
    return [...base, ...sitesLocaux.filter((s) => !vus.has(s.id))].sort((a, b) =>
      a.nom.localeCompare(b.nom),
    );
  }, [client, sitesLocaux, siteIds]);

  const minutesTele = parseHeures(tele);
  const minutesPresentiel = parseHeures(presentiel);
  const centsTarif = parseEuros(tarif);

  async function ajouterSite() {
    const nom = nouveauSite.trim();
    if (!nom || !client || enCours) return;
    setEnCours(true);
    const r = await resoudreSiteId(client.id, nom);
    setEnCours(false);
    if (!r.ok) {
      setErreur(r.error);
      return;
    }
    setSitesLocaux((l) => [...l, { id: r.id, nom }]);
    setSiteIds((l) => (l.includes(r.id) ? l : [...l, r.id]));
    setNouveauSite("");
  }

  async function enregistrer(e: React.FormEvent) {
    e.preventDefault();
    if (enCours) return;
    setErreur(null);

    if (minutesTele == null || minutesPresentiel == null) {
      setErreur("Les heures incluses ne sont pas comprises — indique un nombre d'heures.");
      return;
    }
    if (centsTarif == null) {
      setErreur("Le tarif horaire n'est pas compris.");
      return;
    }

    setEnCours(true);
    const r = await enregistrerContrat({
      id: contrat?.id,
      intitule,
      clientNom,
      reference,
      numeroWhy,
      etat,
      debut,
      fin,
      tacite,
      preavisJours: Number(preavis) || 0,
      quotaTeleMin: minutesTele,
      quotaPresentielMin: minutesPresentiel,
      tarifHoraireCents: centsTarif,
      notes,
      siteIds,
    });
    setEnCours(false);

    if (!r.ok) {
      setErreur(r.error);
      return;
    }
    router.push(`/perso/${qui}/maintenance/${r.id}`);
  }

  async function supprimer() {
    if (!contrat) return;
    const n = contrat.interventions.length;
    if (
      !confirm(
        `Supprimer « ${contrat.intitule} » ?\n\nToutes ses interventions partent avec` +
          (n > 0 ? ` (${n} sur la période affichée).` : ".") +
          `\n\nPour arrêter un contrat sans rien perdre, passe-le plutôt en « Terminé ».`,
      )
    ) {
      return;
    }
    setEnCours(true);
    await supprimerContrat(contrat.id);
    router.push(`/perso/${qui}/maintenance`);
  }

  return (
    <form onSubmit={enregistrer} className="grid gap-5">
      {/* ---------------------------------------------------------- identité */}
      <section className="bloc p-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-1.5 sm:col-span-2">
            <Label htmlFor="intitule">Intitulé</Label>
            <Input
              id="intitule"
              value={intitule}
              onChange={(e) => setIntitule(e.target.value)}
              placeholder="Maintenance GTB — salles communales"
              required
              autoFocus
            />
          </div>

          <div className="grid gap-1.5">
            <Label>Client</Label>
            <Combobox
              value={clientNom}
              onInput={setClientNom}
              onPick={(o) => setClientNom(o.value)}
              options={clients.map((c) => ({
                value: c.nom,
                tag: c.sites.length > 0 ? `${c.sites.length} site(s)` : undefined,
              }))}
              placeholder="Nom du client"
            />
            {clientNom.trim() && !client && (
              <p className="text-xs text-muted">
                Nouveau client — il sera créé à l&apos;enregistrement.
              </p>
            )}
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="etat">État</Label>
            <select
              id="etat"
              value={etat}
              onChange={(e) => setEtat(e.target.value as EtatContrat)}
              className={CLASSE_SELECT}
            >
              {ETATS.map((e) => (
                <option key={e} value={e}>
                  {LIBELLE_ETAT[e]}
                </option>
              ))}
            </select>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="reference">Référence du contrat</Label>
            <Input
              id="reference"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="Celle qu'on cite au téléphone"
              className="font-mono"
            />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="why">N° Why</Label>
            <Input
              id="why"
              value={numeroWhy}
              onChange={(e) => setNumeroWhy(e.target.value)}
              placeholder="L'affaire qui a vendu le contrat"
              className="font-mono"
            />
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------- durée */}
      <section className="bloc p-4">
        <p className="stamp mb-3">Durée et reconduction</p>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="grid gap-1.5">
            <Label htmlFor="debut">Date d&apos;effet</Label>
            <Input
              id="debut"
              type="date"
              value={debut}
              onChange={(e) => setDebut(e.target.value)}
              required
            />
            <p className="text-xs text-muted">
              C&apos;est elle qui donne la date anniversaire : le forfait repart à
              zéro chaque année à cette date.
            </p>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="fin">Terme</Label>
            <Input
              id="fin"
              type="date"
              value={fin}
              onChange={(e) => setFin(e.target.value)}
            />
            <p className="text-xs text-muted">Vide = sans terme convenu.</p>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="preavis">Préavis de dénonciation</Label>
            <div className="flex items-center gap-2">
              <Input
                id="preavis"
                value={preavis}
                onChange={(e) => setPreavis(e.target.value.replace(/\D/g, ""))}
                inputMode="numeric"
                className="w-24"
              />
              <span className="whitespace-nowrap text-sm text-muted">jours</span>
            </div>
            <p className="text-xs text-muted">
              0 = non renseigné. Sinon l&apos;outil prévient dès qu&apos;on y entre.
            </p>
          </div>

          <div className="grid gap-1.5">
            <Label>Reconduction</Label>
            <label className="flex h-[var(--control-h)] cursor-pointer items-center gap-2 text-sm text-fg">
              <input
                type="checkbox"
                checked={tacite}
                onChange={(e) => setTacite(e.target.checked)}
                className="h-4 w-4 accent-[var(--brand)]"
              />
              Tacite
            </label>
            <p className="text-xs text-muted">
              Le contrat repart d&apos;une période sans qu&apos;on signe.
            </p>
          </div>
        </div>
      </section>

      {/* ----------------------------------------------------------- forfait */}
      <section className="bloc p-4">
        <p className="stamp mb-1">Le forfait, par période annuelle</p>
        <p className="mb-3 text-sm text-muted">
          Les deux forfaits ne se compensent pas : une heure de téléassistance
          épargnée ne paie pas un déplacement.
        </p>
        <div className="grid gap-4 sm:grid-cols-3">
          <ChampHeures
            id="tele"
            label="Téléassistance incluse"
            valeur={tele}
            onChange={setTele}
            minutes={minutesTele}
          />
          <ChampHeures
            id="presentiel"
            label="Présentiel inclus"
            valeur={presentiel}
            onChange={setPresentiel}
            minutes={minutesPresentiel}
          />
          <div className="grid gap-1.5">
            <Label htmlFor="tarif">Tarif horaire hors forfait</Label>
            <div className="flex items-center gap-2">
              <Input
                id="tarif"
                value={tarif}
                onChange={(e) => setTarif(e.target.value)}
                placeholder="75"
                inputMode="decimal"
                className={cn(centsTarif == null && "border-danger")}
              />
              <span className="whitespace-nowrap text-sm text-muted">€ / h</span>
            </div>
            <p className="text-xs text-muted">
              {centsTarif == null
                ? "montant non compris"
                : centsTarif > 0
                  ? `soit ${formatEuros(centsTarif)} de l'heure`
                  : "vide = le hors forfait sera compté en heures, sans montant"}
            </p>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------- sites */}
      <section className="bloc p-4">
        <p className="stamp mb-3">Sites couverts</p>

        {!client ? (
          <p className="text-sm text-muted">
            {clientNom.trim()
              ? "Enregistre d'abord le contrat : les sites se rattachent ensuite, depuis cet écran."
              : "Choisis un client pour voir ses sites."}
          </p>
        ) : (
          <>
            {sitesProposes.length === 0 ? (
              <p className="text-sm text-muted">
                Ce client n&apos;a encore aucun site. Ajoute-les ci-dessous —
                l&apos;un après l&apos;autre, ils resserviront aux contrats suivants.
              </p>
            ) : (
              <ul className="mb-3 grid gap-px bg-hairline sm:grid-cols-2 lg:grid-cols-3">
                {sitesProposes.map((s) => (
                  <li key={s.id} className="bg-surface">
                    <label className="flex cursor-pointer items-center gap-2.5 p-2.5 text-sm text-fg hover:bg-surface-2">
                      <input
                        type="checkbox"
                        checked={siteIds.includes(s.id)}
                        onChange={(e) =>
                          setSiteIds((l) =>
                            e.target.checked
                              ? [...l, s.id]
                              : l.filter((x) => x !== s.id),
                          )
                        }
                        className="h-4 w-4 accent-[var(--brand)]"
                      />
                      <MapPinned className="h-3.5 w-3.5 shrink-0 text-subtle" />
                      {s.nom}
                    </label>
                  </li>
                ))}
              </ul>
            )}

            <div className="flex flex-wrap items-end gap-2">
              <div className="grid min-w-0 flex-1 gap-1.5 sm:max-w-sm">
                <Label htmlFor="site-neuf">Ajouter un site</Label>
                <Input
                  id="site-neuf"
                  value={nouveauSite}
                  onChange={(e) => setNouveauSite(e.target.value)}
                  placeholder="Salle communale de Brancourt"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      // Sans cela, Entrée soumettrait le contrat entier au lieu
                      // d'ajouter le site qu'on vient de taper.
                      e.preventDefault();
                      void ajouterSite();
                    }
                  }}
                />
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={ajouterSite}
                disabled={!nouveauSite.trim() || enCours}
              >
                <Plus className="h-4 w-4" /> Ajouter
              </Button>
            </div>
            <p className="mt-2 text-xs text-muted">
              L&apos;adresse et les accès se complètent dans{" "}
              <Link
                href={`/perso/${qui}/maintenance/sites`}
                className="text-brand underline decoration-dotted underline-offset-4"
              >
                le référentiel des sites
              </Link>
              .
            </p>
          </>
        )}
      </section>

      {/* ------------------------------------------------------------- notes */}
      <section className="bloc p-4">
        <div className="grid gap-1.5">
          <Label htmlFor="notes">Notes</Label>
          <textarea
            id="notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            placeholder="Ce qui est couvert, ce qui ne l'est pas, les particularités."
            className="w-full resize-y rounded-md border border-border bg-surface px-3 py-2 text-sm text-fg hover:border-brand/40 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
          />
        </div>
      </section>

      {erreur && (
        <p role="alert" className="bloc border-danger/40 p-3 text-sm text-danger">
          {erreur}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={enCours}>
          {enCours ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {contrat ? "Enregistrer" : "Créer le contrat"}
        </Button>
        <Link
          href={
            contrat
              ? `/perso/${qui}/maintenance/${contrat.id}`
              : `/perso/${qui}/maintenance`
          }
          className="press inline-flex h-[var(--control-h)] items-center rounded-md px-4 text-sm font-medium text-muted hover:bg-surface-2 hover:text-fg"
        >
          Annuler
        </Link>

        {contrat && (
          <Button
            type="button"
            variant="ghost"
            onClick={supprimer}
            disabled={enCours}
            className="ml-auto text-danger hover:bg-danger/10 hover:text-danger"
          >
            <Trash2 className="h-4 w-4" /> Supprimer
          </Button>
        )}
      </div>
    </form>
  );
}

/** Un forfait se saisit en HEURES, et le champ le dit en réaffichant ce qu'il a
 *  compris — c'est l'écho, pas la règle, qui empêche « 10 » de valoir 10 min. */
function ChampHeures({
  id,
  label,
  valeur,
  onChange,
  minutes,
}: {
  id: string;
  label: string;
  valeur: string;
  onChange: (v: string) => void;
  minutes: number | null;
}) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex items-center gap-2">
        <Input
          id={id}
          value={valeur}
          onChange={(e) => onChange(e.target.value)}
          placeholder="10"
          inputMode="decimal"
          className={cn(minutes == null && "border-danger")}
        />
        <span className="whitespace-nowrap text-sm text-muted">h / an</span>
      </div>
      <p className={cn("text-xs", minutes == null ? "text-danger" : "text-muted")}>
        {minutes == null
          ? "nombre d'heures non compris"
          : minutes > 0
            ? `soit ${formatDuree(minutes)} par période`
            : "vide = aucune heure incluse"}
      </p>
    </div>
  );
}
