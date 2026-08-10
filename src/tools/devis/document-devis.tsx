/* eslint-disable @next/next/no-img-element */
/* LE DOCUMENT CLIENT d'un devis — la seule page de l'application qu'un client
 * voie, et la seule qui parte en PDF chez lui.
 *
 * Composant SERVEUR, sans état, sans `use client` : la page publique s'affiche
 * donc sans une ligne de JavaScript. Ce n'est pas une coquetterie —
 *
 *   - l'impression et le PDF ne dépendent d'aucune hydratation (un
 *     « Chargement… » capturé par le moteur de PDF, c'est un devis blanc) ;
 *   - le client peut lire le devis dans un navigateur d'un autre siècle ;
 *   - rien de ce qui s'affiche ici ne peut être obtenu autrement que par les
 *     champs passés en props : ce que `getDevisPublic` ne renvoie pas ne peut
 *     pas fuir (le déboursé, le coefficient, la marge, la référence interne).
 *
 * Le MÊME composant sert l'aperçu interne (`/perso/gus/devis/[id]/apercu`) et la
 * page publique (`/d/[jeton]`) : un aperçu qui ne serait pas le document lui-même
 * ne servirait à rien.
 *
 * Charte : `document-devis.css` (pt/mm et #hex figés — ce document ne suit ni la
 * densité de l'interface ni le thème sombre).
 */
import { DocumentRiche } from "@/lib/editeur-riche/rendu-serveur";
import "./document-devis.css";
import {
  acompteCents,
  calculerDevis,
  dateValidite,
  documentClient,
  formatEuros,
  formatPourcent,
  formatQuantite,
  libelleDevis,
  lignesDestinataire,
  ligneChiffree,
  mentionsLegales,
  texteNu,
  type DevisComplet,
  type LigneCalculee,
  type SocieteVue,
} from "./model";

const LOGO = "/logo-dumortier.png";

function jour(d: Date): string {
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

/** Deux horodatages sont « le même jour » si moins d'une minute les sépare —
 *  `updatedAt` bouge à la seconde près sur l'écriture qui publie. */
function memeInstant(a: Date, b: Date): boolean {
  return Math.abs(a.getTime() - b.getTime()) < 60_000;
}

export interface DocumentDevisProps {
  devis: DevisComplet;
  societe: SocieteVue;
  /** Rendu destiné au PDF serveur : Chromium pose lui-même le pied légal et la
   *  pagination sur chaque page, celui du document ferait doublon. */
  pourPdf?: boolean;
}

export function DocumentDevis({ devis, societe, pourPdf }: DocumentDevisProps) {
  const { entete, lots, lignes } = devis;
  const totaux = calculerDevis(entete, lots, lignes);
  const doc = documentClient(totaux, entete);

  const etabliLe = entete.publieLe ?? entete.createdAt;
  const valableJusquau = dateValidite(etabliLe, entete.validiteJours);
  // Le document DIT quand il a été retouché depuis son établissement. Le lien
  // public montre le devis à sa source : si on l'a corrigé après envoi, le
  // client doit pouvoir s'en apercevoir sans nous appeler.
  const modifieDepuis = !memeInstant(entete.updatedAt, etabliLe) && entete.updatedAt > etabliLe;

  const destinataire = lignesDestinataire(entete.destinataire, entete.clientNom);
  const acompte = acompteCents(totaux.totalTtcCents, societe.acomptePourMille);
  const mentions = mentionsLegales(societe);

  return (
    /* ⚠️ `print-root` n'est PAS décoratif. Le patron d'impression global
       (globals.css) masque toute l'application — `body * { visibility: hidden }`
       — et ne révèle QUE les descendants de `.print-root`. Sans cette classe, le
       devis s'imprime en pages blanches, sans la moindre erreur : la page est
       correcte à l'écran, le PDF sort vide. */
    <div className={`devis-doc print-root${pourPdf ? " pour-pdf" : ""}`}>
      <div className="feuille">
        <div className="bandeau" aria-hidden>
          <i className="b1" />
          <i className="b2" />
        </div>

        {/* --- Cartouche : qui, quoi, pour qui ------------------------------ */}
        <div className="tete">
          <div>
            <p className="stamp">Devis</p>
            <h1>{libelleDevis(entete.numero, entete.revision)}</h1>
            {entete.titre.trim() && <p className="objet">{entete.titre.trim()}</p>}
          </div>
          <div className="marque">
            <img src={LOGO} alt={societe.raisonSociale || "Dumortier"} />
            {destinataire.length > 0 && (
              <div className="pave-client" style={{ marginTop: "6mm" }}>
                {destinataire.map((l, i) => (
                  <div key={i} className={i === 0 ? "dest-1" : undefined}>
                    {l}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="refs">
          {societe.ville && (
            <span>
              {societe.ville}, le <b>{jour(etabliLe)}</b>
            </span>
          )}
          {!societe.ville && (
            <span>
              Établi le <b>{jour(etabliLe)}</b>
            </span>
          )}
          <span>
            Valable jusqu&apos;au <b>{jour(valableJusquau)}</b>
          </span>
          {modifieDepuis && (
            <span>
              Mis à jour le <b>{jour(entete.updatedAt)}</b>
            </span>
          )}
        </div>

        {/* --- Le chiffrage ------------------------------------------------- */}
        {doc.lots.map((lot, i) => (
          <section className="lot" key={lot.titre ?? `hors-lot-${i}`}>
            {lot.titre && <h2 className="lot-titre">{lot.titre}</h2>}
            {lot.note.trim() && <p className="lot-note">{lot.note.trim()}</p>}
            <TableLignes
              lignes={lot.lignes}
              avecPrix={doc.avecPrixLigne}
              sousTotal={doc.avecSousTotaux ? lot.sousTotalCents : null}
            />
          </section>
        ))}

        {doc.lots.length === 0 && (
          <p className="lot-note">Ce devis ne comporte aucune ligne chiffrée.</p>
        )}

        {/* --- Les options, à part et jamais additionnées -------------------- */}
        {doc.options.length > 0 && (
          <section className="options">
            <h2>Options — non comprises dans le total</h2>
            <p className="aide">
              Chiffrées à titre indicatif, à retenir ou non. Elles ne sont pas incluses dans les
              montants ci-dessous.
            </p>
            <TableLignes
              lignes={doc.options.map((o) => o.ligne)}
              avecPrix={doc.avecPrixLigne}
              sousTotal={null}
            />
          </section>
        )}

        {/* --- Conditions et totaux ---------------------------------------- */}
        <div className="bas">
          <div className="gauche">
            {societe.remarques.trim() && (
              <div className="encart">
                <h3>Remarques particulières</h3>
                {societe.remarques
                  .split("\n")
                  .map((l) => l.trim())
                  .filter(Boolean)
                  .map((l, i) => (
                    <p key={i}>{l}</p>
                  ))}
              </div>
            )}

            <div className="encart">
              <h3>Conditions financières</h3>
              {societe.reglement && <p>Règlement par : {societe.reglement}</p>}
              {societe.conditionsReglement && <p>Conditions : {societe.conditionsReglement}</p>}
              <p>
                Offre valable {entete.validiteJours} jours, jusqu&apos;au {jour(valableJusquau)}
              </p>
              {societe.dureeRealisation && (
                <p>Durée estimée de réalisation : {societe.dureeRealisation}</p>
              )}
              {societe.iban && (
                <p className="ref">
                  IBAN : {societe.iban}
                  {societe.bic && ` — BIC : ${societe.bic}`}
                </p>
              )}
            </div>

            <div className="accord">
              <h3>Bon pour accord</h3>
              <p className="champ">
                Fait à <i />, le <i />
              </p>
              <p className="champ">Nom et qualité du signataire : <i /></p>
              <p className="champ">Signature et cachet :</p>
            </div>
          </div>

          <div className="droite">
            <div className="totaux">
              <div className="l">
                <span>Total HT</span>
                <span>{formatEuros(totaux.totalHtCents)}</span>
              </div>
              {totaux.remiseGlobaleCents > 0 && (
                <div className="l remise">
                  <span>
                    Remise
                    {entete.remiseGlobalePourMille
                      ? ` ${formatPourcent(entete.remiseGlobalePourMille * 10)}`
                      : ""}
                  </span>
                  <span>− {formatEuros(totaux.remiseGlobaleCents)}</span>
                </div>
              )}
              {totaux.remiseGlobaleCents > 0 && (
                <div className="l">
                  <span>Net HT</span>
                  <span>{formatEuros(totaux.netHtCents)}</span>
                </div>
              )}
              <div className="l">
                <span>
                  {entete.tauxTvaCentieme === 0
                    ? "TVA — autoliquidation"
                    : `TVA ${formatPourcent(entete.tauxTvaCentieme)}`}
                </span>
                <span>{formatEuros(totaux.tvaCents)}</span>
              </div>
              <div className="l ttc">
                <span>Total TTC</span>
                <span>{formatEuros(totaux.totalTtcCents)}</span>
              </div>
            </div>

            {acompte > 0 && (
              <p className="acompte">
                Acompte à la commande {formatPourcent(societe.acomptePourMille * 10)} :{" "}
                <b>{formatEuros(acompte)}</b>
              </p>
            )}

            {entete.auteur && (
              <div className="signature">
                <div className="nom">{entete.auteur}</div>
                {entete.auteurFonction && <div className="fonction">{entete.auteurFonction}</div>}
              </div>
            )}
          </div>
        </div>

        {/* --- Mentions légales -------------------------------------------- */}
        <footer className="pied">
          {mentions.map((l, i) => (
            <div key={i}>{i === 0 ? <b>{l}</b> : l}</div>
          ))}
        </footer>
      </div>
    </div>
  );
}

/* -----------------------------------------------------------------------------
 * LE TABLEAU DES LIGNES
 * -------------------------------------------------------------------------- */

function TableLignes({
  lignes,
  avecPrix,
  sousTotal,
}: {
  lignes: LigneCalculee[];
  avecPrix: boolean;
  sousTotal: number | null;
}) {
  // Le nombre de colonnes commande le `colSpan` des lignes de texte et du
  // sous-total : le calculer une fois évite trois « 3 ou 5 » dans le rendu.
  const nbColonnes = avecPrix ? 5 : 3;

  return (
    // Le cadre laisse le tableau DÉFILER sur un téléphone plutôt qu'élargir la
    // page : un devis à cinq colonnes de prix ne rentre pas dans 390 px, et un
    // document qu'on doit balayer de gauche à droite en entier est illisible.
    // Sur le papier, il ne défile pas (voir `@media print`).
    <div className="lignes-cadre">
    <table className="lignes">
      <thead>
        <tr>
          <th>Désignation</th>
          <th className="n">Qté</th>
          <th className="u">Unité</th>
          {avecPrix && <th className="p">P.U. HT</th>}
          {avecPrix && <th className="p">Total HT</th>}
        </tr>
      </thead>
      <tbody>
        {lignes.map((lc) => (
          <LigneDocument key={lc.ligne.id} lc={lc} avecPrix={avecPrix} nbColonnes={nbColonnes} />
        ))}
      </tbody>
      {sousTotal !== null && (
        <tfoot>
          <tr>
            <td colSpan={nbColonnes}>Sous-total du lot : {formatEuros(sousTotal)}</td>
          </tr>
        </tfoot>
      )}
    </table>
    </div>
  );
}

function LigneDocument({
  lc,
  avecPrix,
  nbColonnes,
}: {
  lc: LigneCalculee;
  avecPrix: boolean;
  nbColonnes: number;
}) {
  const l = lc.ligne;

  // --- Une ligne TEXTE : le commentaire qui explique le chiffrage ------------
  if (!ligneChiffree(l.genre)) {
    // Le cas courant ne monte aucun rendu de document : un devis porte dix
    // commentaires d'une phrase, pas dix documents (même règle que l'éditeur).
    const nu = texteNu(l.contenu);
    const simple = nu !== null ? nu.trim() || l.designation.trim() : null;
    return (
      <tr className="texte">
        <td colSpan={nbColonnes}>
          {simple !== null ? <p>{simple}</p> : <DocumentRiche contenu={l.contenu} />}
        </td>
      </tr>
    );
  }

  const remisee = lc.remiseCents > 0;

  /* `data-label` n'est pas décoratif : sous 560 px la table se replie en fiches
     (voir document-devis.css) et c'est lui qui redonne son intitulé à chaque
     valeur. Sans ça, un client sur téléphone lit « 2 · U · 1 050,00 » sans
     savoir quelle colonne est laquelle. */
  return (
    <tr>
      <td className="des">{l.designation}</td>
      <td className="n" data-label="Qté">
        {formatQuantite(l.quantiteMillieme)}
      </td>
      <td className="u" data-label="Unité">
        {l.unite}
      </td>
      {avecPrix && (
        <td className="p" data-label="P.U. HT">
          {formatEuros(l.pvUnitaireCents)}
        </td>
      )}
      {avecPrix && (
        <td className="p" data-label="Total HT">
          {remisee && <span className="barre">{formatEuros(lc.brutCents)}</span>}
          {remisee ? " " : ""}
          {formatEuros(lc.totalCents)}
          {remisee && (
            <span className="remise">remise {formatPourcent(l.remisePourMille * 10)}</span>
          )}
        </td>
      )}
    </tr>
  );
}
