/**
 * L'IDENTITÉ DU CLIENT — contrôles de bout en bout, sur la VRAIE base.
 *
 *   npx tsx --conditions=react-server scripts/clients-contacts-smoke.mts
 *
 * Ce que ce script cherche, c'est ce qui se perd ou se trompe EN SILENCE :
 *
 *   • un devis adressé à la personne d'une AUTRE société (la garde de
 *     `propositionDestinataire` — le seul défaut de cette fonction qui
 *     n'apparaîtrait jamais dans les tests du moteur, faute de base) ;
 *   • un destinataire qui disparaît d'une révision ou d'une copie — le devis
 *     part alors sans savoir à qui, et personne ne le voit avant l'envoi ;
 *   • une personne effacée du référentiel qui emporterait avec elle le
 *     destinataire des devis qui la citaient.
 *
 * Le moteur pur (la mise en forme du pavé, la règle « on ne remplit que le
 * vide ») est vérifié ailleurs, sans base : `scripts/devis-smoke.mts`.
 *
 * Le script crée ses propres clients (préfixe « ZZ-CT ») et efface tout à la fin.
 */
import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client.js";
import { PrismaPg } from "@prisma/adapter-pg";
import { propositionDestinataire } from "../src/tools/devis/queries.js";
import { paveReprenable } from "../src/tools/devis/model.js";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

let ok = 0;
let ko = 0;
function verif(titre: string, condition: boolean, detail = "") {
  if (condition) {
    ok += 1;
    console.log(`  ✔ ${titre}`);
  } else {
    ko += 1;
    console.log(`  ✘ ${titre}${detail ? ` — ${detail}` : ""}`);
  }
}
const egal = (titre: string, obtenu: unknown, attendu: unknown) =>
  verif(titre, Object.is(obtenu, attendu), `obtenu ${JSON.stringify(obtenu)}`);
const section = (t: string) => console.log(`\n▸ ${t}`);

const PREFIXE = "ZZ-CT";

/* Un essai précédent a pu s'interrompre : on repart d'un terrain net plutôt que
   d'échouer sur sa propre trace. */
async function nettoyer() {
  const clients = await prisma.client.findMany({
    where: { nom: { startsWith: PREFIXE } },
    select: { id: true },
  });
  const ids = clients.map((c) => c.id);
  if (ids.length > 0) {
    await prisma.devis.deleteMany({ where: { clientId: { in: ids } } });
    await prisma.client.deleteMany({ where: { id: { in: ids } } });
  }
  await prisma.devis.deleteMany({ where: { numero: { startsWith: PREFIXE } } });
}

await nettoyer();

/* --- Le terrain ------------------------------------------------------------ */

const clientA = await prisma.client.create({
  data: {
    nom: `${PREFIXE} COMMUNE DE CHARMES`,
    adresse: "12 rue de la Gare\nBP 40",
    codePostal: "02800",
    ville: "CHARMES",
  },
});
const clientB = await prisma.client.create({
  data: { nom: `${PREFIXE} AUTRE SOCIÉTÉ`, adresse: "1 place du Marché", ville: "LAON" },
});

const dupont = await prisma.contactClient.create({
  data: {
    clientId: clientA.id,
    civilite: "M.",
    nom: "Jean Dupont",
    fonction: "Conducteur de travaux",
    email: "j.dupont@charmes.fr",
    telephone: "03 23 00 00 00",
    mobile: "06 12 34 56 78",
    principal: true,
  },
});
const compta = await prisma.contactClient.create({
  data: {
    clientId: clientA.id,
    civilite: "Mme",
    nom: "Martin",
    fonction: "Comptabilité",
    email: "compta@charmes.fr",
  },
});
const chezB = await prisma.contactClient.create({
  data: { clientId: clientB.id, nom: "Intrus", email: "intrus@autre.fr", principal: true },
});

let devisA = await prisma.devis.create({
  data: {
    numero: `${PREFIXE}0001`,
    titre: "Essai identité client",
    clientNom: clientA.nom,
    clientId: clientA.id,
    filId: "",
  },
});
await prisma.devis.update({ where: { id: devisA.id }, data: { filId: devisA.id } });

/* --- 1. Ce que le référentiel propose -------------------------------------- */

section("Ce que le référentiel propose");
{
  const p = await propositionDestinataire(clientA.id, { mode: "principal" });
  verif("le principal est retenu d'office", p.contact.contactId === dupont.id);
  egal(
    "le pavé est complet, dans l'ordre du gabarit de la maison",
    p.pave,
    `${clientA.nom}\nConducteur de travaux\n12 rue de la Gare\nBP 40\n02800 CHARMES\nÀ l'attention de M. Jean Dupont`,
  );
  egal("l'email est copié, pas référencé", p.contact.contactEmail, "j.dupont@charmes.fr");
  egal(
    "le MOBILE l'emporte sur le fixe (c'est celui qu'on compose pour relancer)",
    p.contact.contactTel,
    "06 12 34 56 78",
  );

  const aucun = await propositionDestinataire(clientA.id, { mode: "aucun" });
  verif("« aucun contact » ne pose personne", aucun.contact.contactId === null);
  verif("… mais garde l'adresse", aucun.pave.includes("02800 CHARMES"));
  verif("… et n'écrit pas « À l'attention de »", !aucun.pave.includes("attention"));

  const sansClient = await propositionDestinataire(null, { mode: "principal" });
  egal("un devis sans client ne propose rien", sansClient.pave, "");
  verif("… et ce n'est pas une erreur", sansClient.ok);
}

/* --- 2. LA GARDE ----------------------------------------------------------- */

section("La garde : on n'adresse pas un devis à la personne d'une autre société");
{
  const bon = await propositionDestinataire(clientA.id, { mode: "precis", id: compta.id });
  verif("une personne de ce client passe", bon.ok && bon.contact.contactId === compta.id);
  verif("… et c'est bien la sienne qui est écrite", bon.pave.includes("À l'attention de Mme Martin"));

  const intrus = await propositionDestinataire(clientA.id, { mode: "precis", id: chezB.id });
  verif("LA PERSONNE D'UN AUTRE CLIENT EST REFUSÉE", !intrus.ok);
  verif("… et rien n'est proposé au passage", intrus.contact.contactId === null && !intrus.pave);

  const inconnu = await propositionDestinataire(clientA.id, { mode: "precis", id: "n-existe-pas" });
  verif("un id inventé est refusé de la même façon", !inconnu.ok);
}

/* --- 3. Le contact figé survit au référentiel ------------------------------ */

section("Le devis fige : ce qui est copié survit au référentiel");
{
  const p = await propositionDestinataire(clientA.id, { mode: "principal" });
  devisA = await prisma.devis.update({
    where: { id: devisA.id },
    data: { destinataire: p.pave, ...p.contact },
  });
  egal("le devis porte le nom de la personne", devisA.contactNom, "Jean Dupont");

  // La personne quitte la maison, et on efface carrément sa fiche.
  await prisma.contactClient.delete({ where: { id: dupont.id } });
  const apres = await prisma.devis.findUniqueOrThrow({ where: { id: devisA.id } });
  egal("le lien est coupé (SetNull)", apres.contactId, null);
  egal("MAIS LE NOM RESTE", apres.contactNom, "Jean Dupont");
  egal("… et l'email aussi", apres.contactEmail, "j.dupont@charmes.fr");
  verif("… et le pavé imprimé est intact", apres.destinataire.includes("À l'attention de M. Jean Dupont"));
}

/* --- 4. Révision et copie emportent le destinataire ------------------------ */

section("Révision et copie emportent le destinataire");
{
  const source = await prisma.devis.findUniqueOrThrow({ where: { id: devisA.id } });
  // On refait ce que font `nouvelleRevision` et `dupliquerDevis` : la recopie
  // des cinq champs. Les oublier ne lève aucune erreur — d'où ce contrôle.
  const revision = await prisma.devis.create({
    data: {
      numero: source.numero,
      revision: 2,
      parentId: source.id,
      filId: source.filId,
      clientNom: source.clientNom,
      clientId: source.clientId,
      destinataire: source.destinataire,
      contactId: source.contactId,
      contactNom: source.contactNom,
      contactFonction: source.contactFonction,
      contactEmail: source.contactEmail,
      contactTel: source.contactTel,
    },
  });
  egal("la v2 est adressée à la même personne", revision.contactNom, source.contactNom);
  egal("… avec la même adresse mail", revision.contactEmail, source.contactEmail);
  egal("… et le même pavé imprimé", revision.destinataire, source.destinataire);

  // Le contrôle qui rend le précédent utile : sans la recopie, on le verrait.
  const oubli = await prisma.devis.create({
    data: {
      numero: `${PREFIXE}0002`,
      filId: "",
      clientNom: source.clientNom,
      clientId: source.clientId,
      destinataire: source.destinataire,
    },
  });
  verif(
    "témoin : une création qui OUBLIE la recopie part bien sans destinataire",
    oubli.contactNom === "" && oubli.contactEmail === "",
  );
}

/* --- 5. « On ne remplit que le vide », contre la vraie base ---------------- */

section("On ne remplit que le vide");
{
  const propose = (await propositionDestinataire(clientA.id, { mode: "principal" })).pave;
  verif("un devis neuf accepte la proposition", paveReprenable("", propose));
  verif("un pavé encore identique l'accepte aussi", paveReprenable(propose, propose));
  verif(
    "UN PAVÉ RETAPÉ NE SE FAIT PAS ÉCRASER PAR UN CHANGEMENT DE FICHE",
    !paveReprenable(`${clientA.nom}\nService facturation — TSA 20045\n02800 CHARMES`, propose),
  );
}

/* --- 6. Supprimer un client ne supprime pas ses devis ---------------------- */

section("Supprimer un client");
{
  const avant = await prisma.contactClient.count({ where: { clientId: clientB.id } });
  await prisma.client.delete({ where: { id: clientB.id } });
  const apres = await prisma.contactClient.count({ where: { clientId: clientB.id } });
  verif("ses contacts partent avec lui (Cascade)", avant === 1 && apres === 0);
}

/* --- Verdict --------------------------------------------------------------- */

await nettoyer();
await prisma.$disconnect();

console.log(`\n${ok + ko} contrôles — ${ok} ✔  ${ko} ✘`);
if (ko > 0) process.exit(1);
console.log("L'identité du client tient ses invariants.\n");
