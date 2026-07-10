// Cas de test de la normalisation des noms de dossiers kDrive.
// Lancer : npx tsx --test src/lib/kdrive/normalize.test.ts
//
// ⚠️ LOT 3 — À COMPLÉTER AVEC LE VRAI kDrive : ces cas couvrent les variations
// génériques (casse, accents, tirets, espaces). Remplacer/enrichir `CAS_REELS`
// avec des paires (nom DumTools, nom réel du dossier kDrive) prélevées sur
// l'arborescence de production — surtout les clients aux noms « piégeux »
// (accents, tirets cadratins, suffixes juridiques, espaces multiples).

import { test } from "node:test";
import assert from "node:assert/strict";
import { normaliserSegment, segmentsEgaux } from "./normalize";

// Paires qui DOIVENT être considérées comme le même dossier.
const EQUIVALENTS: [string, string][] = [
  ["Client A", "client a"], // casse
  ["Réf Bâtiment", "Ref Batiment"], // accents
  ["2026-0142 - Lycée", "2026 - 0142 - Lycee"], // tirets + espaces + accents
  ["Mairie  d'Anizy", "Mairie d'Anizy"], // espaces multiples
  ["ECS – Production", "ECS - Production"], // tiret cadratin (–) vs ASCII (-)
  ["Prog", " prog "], // espaces de bord
  ["Chauffage Nord", "Chauffage Nord"], // espace insécable
];

// Paires qui ne DOIVENT PAS être confondues (dossiers réellement distincts).
const DISTINCTS: [string, string][] = [
  ["2026-0142 - Lycée", "2026-0143 - Lycée"],
  ["Client A", "Client AB"],
  ["Achat", "Achats"],
  ["Bureau Nord", "Bureau Sud"],
];

// >>> À REMPLIR au lot 3 depuis le vrai kDrive : [nom DumTools, nom dossier kDrive]
const CAS_REELS: [string, string][] = [
  // ex. ["SARL Dupont", "Dupont"],  ← si le dossier kDrive omet la forme juridique
];

test("segments équivalents malgré casse/accents/tirets/espaces", () => {
  for (const [a, b] of EQUIVALENTS) {
    assert.ok(segmentsEgaux(a, b), `« ${a} » devrait égaler « ${b} »`);
  }
});

test("segments distincts non confondus", () => {
  for (const [a, b] of DISTINCTS) {
    assert.ok(!segmentsEgaux(a, b), `« ${a} » ne devrait PAS égaler « ${b} »`);
  }
});

test("idempotence : normaliser(normaliser(x)) === normaliser(x)", () => {
  for (const [a] of [...EQUIVALENTS, ...DISTINCTS]) {
    const n = normaliserSegment(a);
    assert.equal(normaliserSegment(n), n);
  }
});

test("cas réels prélevés sur le kDrive de production", () => {
  for (const [dumtools, kdrive] of CAS_REELS) {
    assert.ok(
      segmentsEgaux(dumtools, kdrive),
      `« ${dumtools} » (DumTools) devrait matcher le dossier kDrive « ${kdrive} »`,
    );
  }
});
