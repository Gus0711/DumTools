-- Le pavé destinataire du document client, tel qu'il s'imprime (voir le
-- commentaire du champ dans schema.prisma).
ALTER TABLE "Devis" ADD COLUMN "destinataire" TEXT NOT NULL DEFAULT '';
