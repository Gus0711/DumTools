-- Ajout du champ `resume` (description courte, saisie par l'auteur).
-- NB : Prisma proposait aussi de DROP l'index GIN `WikiPage_recherche_idx` et de
-- toucher la colonne générée `recherche` (il ne les gère pas → fausse dérive).
-- On ne garde QUE l'ajout de colonne : l'index GIN et la colonne tsvector générée
-- (cf. migration outil_wiki) doivent rester intacts.
ALTER TABLE "WikiPage" ADD COLUMN "resume" TEXT NOT NULL DEFAULT '';
