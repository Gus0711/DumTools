-- Le versement d'une pièce du fil vers la GED de l'affaire : on garde la date,
-- pour dire « déjà versée » plutôt que de la verser deux fois en silence.
-- (docs/DEVIS-FIL.md §8 — écrite à la main, cf. le piège du wiki tsvector.)
ALTER TABLE "DevisMedia" ADD COLUMN "verseeLe" TIMESTAMP(3);
