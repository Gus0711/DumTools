import type { Metadata } from "next";
import Link from "next/link";
import { auth } from "@/auth";
import { Badge, Cartouche, EtatVide } from "@/ui";
import { fmtDateHeure } from "@/lib/dates";
import { OuvrirInventaire } from "@/tools/magasin/inventaire";
import { ETAT_INVENTAIRE_LABEL, peutGererReferentiel, type EtatInventaire } from "@/tools/magasin/model";
import { listerDepots, listerInventaires } from "@/tools/magasin/queries";

export const metadata: Metadata = { title: "Inventaires — Magasin" };

const TON: Record<EtatInventaire, "warning" | "success" | "neutral"> = {
  OUVERT: "warning",
  VALIDE: "success",
  ANNULE: "neutral",
};

export default async function Page() {
  const session = await auth();
  const peutGerer = peutGererReferentiel(session?.user?.role);
  const [inventaires, depots] = await Promise.all([listerInventaires(), listerDepots()]);

  return (
    <div className="mx-auto max-w-5xl px-4 py-5 md:px-7 md:py-7">
      <Cartouche
        estampille="Magasin"
        titre="Inventaires"
        retour={{ href: "/outils/magasin", label: "Le rayon" }}
        description="Compter ce qu'il y a vraiment. L'ouverture fige le théorique, la validation transforme chaque différence en écart visible — jamais en correction silencieuse."
        actions={peutGerer ? <OuvrirInventaire depots={depots.filter((d) => d.actif)} /> : null}
        className="mb-6"
      />

      {inventaires.length === 0 ? (
        <div className="data-card">
          <EtatVide
            dessin="bornier"
            titre="Aucune campagne"
            texte="Un inventaire se compte dépôt par dépôt, et peut s'étaler sur plusieurs jours : les lignes comptées sont enregistrées au fur et à mesure."
          />
        </div>
      ) : (
        <div className="data-card overflow-x-auto">
          <table className="data-table table-cards">
            <thead>
              <tr>
                <th>Campagne</th>
                <th>Dépôt</th>
                <th>État</th>
                <th className="text-right">Comptées</th>
                <th className="text-right">Écarts</th>
                <th>Ouverte</th>
                <th>Par</th>
              </tr>
            </thead>
            <tbody>
              {inventaires.map((i) => (
                <tr key={i.id}>
                  <td className="cell-title cell-card-title cell-wrap">
                    <Link
                      href={`/outils/magasin/inventaires/${i.id}`}
                      className="transition-colors hover:text-brand"
                    >
                      {i.libelle}
                    </Link>
                  </td>
                  <td data-label="Dépôt">{i.depot}</td>
                  <td data-label="État">
                    <Badge tone={TON[i.etat as EtatInventaire]} point>
                      {ETAT_INVENTAIRE_LABEL[i.etat as EtatInventaire]}
                    </Badge>
                  </td>
                  <td data-label="Comptées" className="text-right tabular-nums">
                    {i.nbComptees}/{i.nbLignes}
                  </td>
                  <td data-label="Écarts" className="text-right tabular-nums">
                    {i.nbEcarts > 0 ? (
                      <span className="text-danger">{i.nbEcarts}</span>
                    ) : (
                      i.nbEcarts
                    )}
                  </td>
                  <td data-label="Ouverte" className="whitespace-nowrap">
                    {fmtDateHeure(i.ouvertLe)}
                  </td>
                  <td data-label="Par" className="text-muted">
                    {i.ouvertPar ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
