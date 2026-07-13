-- Ajoute l'état CORBEILLE (affaire mise de côté : perdue / erreur), masqué
-- par défaut du tableau de bord mais retrouvable.
ALTER TYPE "EtatAffaire" ADD VALUE IF NOT EXISTS 'CORBEILLE';
