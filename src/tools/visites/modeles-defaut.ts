// Modèles de checklist par type de visite — LE « guide pour ne rien oublier ».
// Client-safe (embarqué dans l'îlot terrain : les modèles doivent être
// disponibles hors-ligne, donc dans le bundle, pas en base pour l'instant).
// Pensé pour le métier complet de Dumortier : GTB ET armoire électrique
// (relevé → suivi → réception → maintenance, voir docs/ROADMAP.md §1).

import {
  uuid,
  dateISOLocale,
  type ItemChecklist,
  type Reserve,
  type SectionChecklist,
  type TypeVisite,
  type Visite,
} from "./model";

interface ItemModele {
  libelle: string;
  aide?: string;
}

interface SectionModele {
  titre: string;
  items: ItemModele[];
}

export const MODELES: Record<TypeVisite, SectionModele[]> = {
  /* ---------------------------------------------------------------------------
   * RELEVÉ AVANT CHIFFRAGE — étape 1 du cycle : tout ce qu'il faut voir, coter
   * et photographier pour chiffrer sans retourner sur site.
   * ------------------------------------------------------------------------- */
  RELEVE: [
    {
      titre: "Site & accès",
      items: [
        {
          libelle: "Contact sur place",
          aide: "Nom + téléphone du gardien / responsable technique (en note).",
        },
        {
          libelle: "Accès au local technique",
          aide: "Clés, badge, code… qui les détient ? Comment on revient seul ?",
        },
        {
          libelle: "Horaires & contraintes d'intervention",
          aide: "Site occupé, école, horaires imposés, bruit, coactivité.",
        },
        {
          libelle: "Stationnement & manutention",
          aide: "Accès VL, escaliers, monte-charge — comment amener l'armoire ?",
        },
        {
          libelle: "Photos du site",
          aide: "Façade, local technique, environnement général.",
        },
      ],
    },
    {
      titre: "Armoire électrique — existant & implantation",
      items: [
        {
          libelle: "Armoire(s) existante(s)",
          aide: "Photo porte FERMÉE + porte OUVERTE + plaque signalétique.",
        },
        {
          libelle: "Place disponible dans l'existant",
          aide: "Réserve sur châssis, goulottes, presse-étoupes libres. Coter l'espace.",
        },
        {
          libelle: "Emplacement pour une nouvelle armoire",
          aide: "Mur/châssis disponible : cotes L×H×P, fixation possible, ouverture de porte.",
        },
        {
          libelle: "État & vétusté de l'existant",
          aide: "Échauffements, serrages, propreté. Le repérage existant est-il fiable ?",
        },
        {
          libelle: "Schémas électriques existants",
          aide: "Pochette de l'armoire : présents ? à jour ? → photo de chaque folio utile.",
        },
      ],
    },
    {
      titre: "Alimentation électrique",
      items: [
        {
          libelle: "Tension disponible",
          aide: "230 V mono / 400 V tri + N ? Photo du TGBT.",
        },
        {
          libelle: "Départ disponible pour la GTB",
          aide: "Calibre, différentiel, bornes libres — sinon prévoir le départ au chiffrage.",
        },
        {
          libelle: "Mise à la terre",
          aide: "Barrette accessible ? Réseau de terre visuellement sain ?",
        },
        {
          libelle: "Cheminement alim → armoire GTB",
          aide: "Distance et passage du câble d'alimentation.",
        },
      ],
    },
    {
      titre: "GTB / régulation existante",
      items: [
        {
          libelle: "Marque & modèle des régulateurs",
          aide: "Photo de CHAQUE étiquette produit (référence exacte).",
        },
        {
          libelle: "Programme récupérable ?",
          aide: "Sauvegarde possible (.gfx ou autre) ? Mot de passe connu ?",
        },
        {
          libelle: "Bus de communication existants",
          aide: "Modbus / BACnet / M-Bus / KNX : quels équipements, où, adresses connues ?",
        },
        {
          libelle: "Sondes & actionneurs conservables",
          aide: "État, type de signal (0-10V, PT1000, TOR…) — ce qu'on garde vs remplace.",
        },
      ],
    },
    {
      titre: "Équipements CVC à raccorder",
      items: [
        {
          libelle: "Production (chaudières, PAC, groupe froid)",
          aide: "Nombre, marque, modèle, protocole disponible. Photo des plaques.",
        },
        {
          libelle: "Distribution (pompes, vannes)",
          aide: "Pompes mono/tri, secours ; vannes 2V/3V et leur signal de commande.",
        },
        {
          libelle: "Aéraulique (CTA, extracteurs)",
          aide: "Registres, batteries, variateurs — ce qui remonte en GTB.",
        },
        {
          libelle: "Comptage (eau, énergie, élec)",
          aide: "Impulsion ou bus (M-Bus/Modbus) ? Emplacement des compteurs.",
        },
        {
          libelle: "Sondes à prévoir",
          aide: "Extérieure, départs, ambiances, ballons — repérer les emplacements.",
        },
      ],
    },
    {
      titre: "Réseau & supervision",
      items: [
        {
          libelle: "Arrivée réseau IP dans le local",
          aide: "Prise RJ45 ? Baie de brassage ? Qui gère l'informatique du site ?",
        },
        {
          libelle: "Couverture 4G",
          aide: "Si routeur 4G nécessaire : tester le signal DANS le local technique.",
        },
        {
          libelle: "Besoin supervision / accès distant",
          aide: "Attente du client : écran local, accès web, alarmes SMS/mail ?",
        },
      ],
    },
    {
      titre: "Câblage & cheminements",
      items: [
        {
          libelle: "Chemins de câbles existants",
          aide: "Place restante ? Photos des cheminements.",
        },
        {
          libelle: "Distances estimées",
          aide: "Armoire → équipements principaux : métrés pour le chiffrage câble.",
        },
        {
          libelle: "Percements / fourreaux à prévoir",
          aide: "Murs coupe-feu, réservations, rebouchages.",
        },
        {
          libelle: "Contraintes particulières",
          aide: "Hauteur, amiante, ATEX, zones occupées, EPI spécifiques.",
        },
      ],
    },
  ],

  /* ---------------------------------------------------------------------------
   * SUIVI DE CHANTIER — étapes 3-4 : l'armoire se pose, les câbles se tirent.
   * ------------------------------------------------------------------------- */
  SUIVI: [
    {
      titre: "Armoire électrique",
      items: [
        { libelle: "Armoire livrée / posée / fixée" },
        {
          libelle: "Alimentation raccordée & protégée",
          aide: "Départ dédié, différentiel, repérage au TGBT.",
        },
        {
          libelle: "Étiquetage conforme au schéma",
          aide: "Repères des borniers = repères du schéma d'armoire.",
        },
        {
          libelle: "Photos d'avancement de l'armoire",
          aide: "Porte ouverte, borniers, un cliché par visite pour l'historique.",
        },
      ],
    },
    {
      titre: "Câblage",
      items: [
        { libelle: "Chemins de câbles posés" },
        {
          libelle: "Câbles tirés",
          aide: "Noter l'avancement (% ou zones restantes).",
        },
        {
          libelle: "Raccordement côté armoire",
          aide: "Bornes serrées, blindages repris, repérage des conducteurs.",
        },
        {
          libelle: "Raccordement côté équipements",
          aide: "Sondes, vannes, pompes… ce qui reste à raccorder.",
        },
      ],
    },
    {
      titre: "Coordination",
      items: [
        {
          libelle: "Avancement des autres corps d'état",
          aide: "Électricien, CVC, plombier : des bloquants pour nous ?",
        },
        {
          libelle: "Points d'arrêt / réserves",
          aide: "Tout ce qui bloque ou devra être repris → onglet Réserves + photo.",
        },
        {
          libelle: "Prochaines étapes & planning",
          aide: "Qui fait quoi d'ici la prochaine visite ? Date visée ?",
        },
      ],
    },
    {
      titre: "Sécurité & propreté",
      items: [
        {
          libelle: "Zone de travail sécurisée",
          aide: "Consignations, balisage, armoire fermée à clé en partant.",
        },
        { libelle: "Repli / propreté de la zone" },
      ],
    },
  ],

  /* ---------------------------------------------------------------------------
   * RÉCEPTION / LEVÉE DE RÉSERVES — étape 6 : on livre au client.
   * ------------------------------------------------------------------------- */
  RECEPTION: [
    {
      titre: "Armoire électrique",
      items: [
        {
          libelle: "Contrôle final des serrages",
          aide: "Resserrage complet des connexions de puissance et de commande.",
        },
        { libelle: "Étiquetage & repérage complets" },
        {
          libelle: "Schéma à jour dans la pochette",
          aide: "Le schéma DANS l'armoire = l'armoire telle que câblée (TQC).",
        },
        {
          libelle: "Essais des protections",
          aide: "Test des différentiels, calibres cohérents.",
        },
      ],
    },
    {
      titre: "Fonctionnel GTB",
      items: [
        {
          libelle: "Mise en service soldée",
          aide: "Rapport de mise en service DumTools : plus aucun point en défaut.",
        },
        {
          libelle: "Régulations testées en automatique",
          aide: "Consignes atteintes, pas de forçage résiduel.",
        },
        {
          libelle: "Alarmes remontées & testées",
          aide: "Provoquer un défaut → vérifier la remontée (supervision, mail, SMS).",
        },
        {
          libelle: "Sauvegarde du programme déposée",
          aide: "Le .gfx final dans la GED Documents de l'affaire (dossier Prog).",
        },
      ],
    },
    {
      titre: "Supervision & remise au client",
      items: [
        {
          libelle: "Site visible sur la supervision",
          aide: "Points remontés, synoptiques opérationnels, libellés propres.",
        },
        {
          libelle: "Accès / identifiants remis au client",
          aide: "Comptes créés, mots de passe transmis, droits adaptés.",
        },
        {
          libelle: "DOE / documentation remis",
          aide: "Dossier de livraison : schémas, liste de points, notices.",
        },
        {
          libelle: "Formation de l'exploitant faite",
          aide: "Consignes, dérogations, qui appeler en cas de défaut.",
        },
        {
          libelle: "Réserves restantes listées",
          aide: "Tout ce qui reste → onglet Réserves (elles suivront l'affaire).",
        },
      ],
    },
  ],

  /* ---------------------------------------------------------------------------
   * MAINTENANCE / SAV — étape 7 : le site vit.
   * ------------------------------------------------------------------------- */
  MAINTENANCE: [
    {
      titre: "Armoire électrique",
      items: [
        {
          libelle: "État général",
          aide: "Propreté, échauffements, traces d'humidité, resserrage si besoin.",
        },
        {
          libelle: "Ventilation / température d'armoire",
          aide: "Filtres de ventilation à souffler / remplacer ?",
        },
        {
          libelle: "Photos si évolution",
          aide: "Toute modification depuis la dernière visite.",
        },
      ],
    },
    {
      titre: "Régulation / GTB",
      items: [
        {
          libelle: "Alarmes en cours",
          aide: "Relever chaque alarme active : cause, action, photo si utile.",
        },
        {
          libelle: "Valeurs des sondes cohérentes",
          aide: "Comparer quelques mesures (dérive de sonde ?).",
        },
        {
          libelle: "Forçages en place",
          aide: "Lister les points forcés — à lever ou à justifier.",
        },
        {
          libelle: "Sauvegarde du programme faite",
          aide: "Un .gfx frais dans la GED si le programme a évolué.",
        },
      ],
    },
    {
      titre: "Améliorations & suites",
      items: [
        {
          libelle: "Demandes du client",
          aide: "Nouveaux besoins → futur devis (noter le contexte).",
        },
        {
          libelle: "Usures / remplacements à prévoir",
          aide: "Anticiper : sondes HS, vannes dures, batteries…",
        },
      ],
    },
  ],
};

/** Instancie les sections d'un modèle (ids frais, statuts vides). */
export function sectionsDepuisModele(type: TypeVisite): SectionChecklist[] {
  return MODELES[type].map((s) => ({
    id: uuid(),
    titre: s.titre,
    items: s.items.map(
      (it): ItemChecklist => ({
        id: uuid(),
        libelle: it.libelle,
        aide: it.aide,
        statut: "",
        note: "",
        photoIds: [],
        audioIds: [],
      }),
    ),
  }));
}

/** Crée une visite vierge (terrain, 100 % hors-ligne possible). Les réserves
 *  ouvertes de l'affaire (issues des visites précédentes) sont reportées pour
 *  qu'on ne les oublie pas. */
export function nouvelleVisite(
  type: TypeVisite,
  affaire: {
    chantierId: string | null;
    chantierNom: string;
    clientNom: string;
    numeroWhy: string | null;
    reservesOuvertes?: Reserve[];
  },
): Visite {
  const now = Date.now();
  return {
    id: uuid(),
    type,
    titre: "",
    date: dateISOLocale(),
    chantierId: affaire.chantierId,
    chantierNom: affaire.chantierNom,
    clientNom: affaire.clientNom,
    numeroWhy: affaire.numeroWhy,
    createdTs: now,
    data: {
      participants: "",
      notes: "",
      sections: sectionsDepuisModele(type),
      reserves: (affaire.reservesOuvertes ?? []).map((r) => ({
        ...r,
        photoIds: [],
      })),
      medias: [],
      updatedTs: now,
    },
  };
}
