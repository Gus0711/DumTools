// Données de référence de l'outil "Liste de Points GTB".
// Généré depuis existant/ListePts_GTB.html — NE PAS éditer à la main (regénérer).
// Sert au seed (Client + PointCatalog) et de repli côté client.

export type IoType = "AI" | "DI" | "AO" | "DO" | "COM";

export interface CatalogPoint {
  nom: string;
  type: IoType;
}

/** 193 clients historiques (référentiel du combobox). */
export const CLIENTS: string[] = ["A M Chauffage","ACTEMIUM","ADICA","AHC","AIREO","AISNE EXPO","ALCAN","AMBROISE - AVITHERM","AUCHAN HYPERMARCHE SAS","AUTOMATISME ET REGULATION","AVENIR ENERGIES","BIET SASU","BOUTROY R - CHARALAMBOUS G","BOUYGUES E&S FM","BREISTROFFER OLIVIER ETS","BRIGAUD  ETS","BRUNET BONNANGE","BUCZEK","BW PLOMBERIE","C.R.R.F J. FICHEUX ST GOBAIN","CARBONNEAUX LIONEL EURL","CC du PAYS NOYONNAIS","CEF NORD Groupe VINCI","CENTRE BRUNEHAUT","CENTRE HOSPITALIER CH-THIERRY","CENTRE HOSPITALIER DE CHAUNY","CENTRE HOSPITALIER DE LAON","CENTRE HOSPITALIER DE PREMONTRE","CENTRE HOSPITALIER DE SAINT QUENTIN","CENTRE HOSPITALIER DE SOISSONS","CK DISTRIBUTION","CLIMAGEL","COFFIN","COGEBIM","COLAS PEZERIL ETS","COMMUNE DE COUVRON AUMENANCOURT","CONRAUX Société Nouvelle","CONRAUX Société Nouvelle - REIMS","CONSEIL DEPARTEMENTAL DE L AISNE","COPAXSO","COPIN ETS","COPRECS","CORDEVANT FREDERIC  ETS","CRAM","CUVERIE TECHNIQUE INOX","ClientTEST","Communauté Agglo Chauny-Tergnier-La Fère","DALKIA FRANCE","DALKIA France AMIENS","DALKIA France CREIL","DALKIA France LILLE","DALKIA France REIMS","DALKIA France SOISSONS","DAUTREPPE Antoine","DEFRIZE SARL","DEHAN SEBASTIEN  ETS","DEJARDIN FABRICE","DELAFONT ETS","DELANNOY DEWAILLY","DELFORGE BACLET EURL","DESSAINT SN","DESSEY DAVID SARL","DONAT ENT","DSP SA","DUPONT CHAUFFAGE SERVICES","E.C.R ELECTRICITE","EAISNER","EDEF LAON","EIFFAGE ENERGIE SYSTEMES","EMI GENIE CLIMATIQUE","ENGIE ENERGIE REIMS","ENGIE ENERGIE SERVICES AISNE","ENGIE ENERGIE SERVICES ARRAS","ENGIE ENERGIE SERVICES Beauvais","ENGIE ENERGIE SERVICES LILLE","ENGIE ENERGIE SERVICES OISE Est","ENGIE ENERGIE SERVICES SOMME","ENGIE ENERGIE SERVICES TROYES","ENGIE HOME SERVICES BRUYERES ET MONTBERAULT","ENGIE HOME SERVICES ST QUENTIN","ENGIE HOME SERVICES VILLENEUVE ST GERMAIN","ENGIE RESEAUX Reims - SOCCRAM","EPHESE LIESSE","ESSIQUE P. SA","Eiffage Energie Systemes - Lorraine","FAPAGAU ET CIE","FAVEREAUX","FERNANDES ETS","FLAMANT","FLAMME BLEUE STE","FOYER DE BETHANCOURT","FRANCOIS AURELIEN  ETS","FRIGITEC","GAYET ETS","GENDARMERIE MOBILE","GONTHIER ARMAND ETS","GROUPE ROBERT SCHUMAN","GUERY Erwan","HELA SARL","HERVE-THERMIQUE","HOFLACK CHAUFFAGE","HOORNAERT FABRICE ETS","HOULLE ARDENNES S.A.","I P H","IDEX ENERGIES - Groupe IDEX","IDEX ENERGIES REIMS","INSTITUT MEDICO EDUCATIF SPECIALISE","JM FROID","K.V.E.I","KOCH Société Nouvelle - Groupe FARENEIT","L.C.FROID ET CLIM","LA BUL - BASE URBAINE DE LOISIRS","LA LOUISIANE S.A","LACOUR MONTAY PAINVIN SARL","LE CAMUS Entreprise","LEGRAND DANIEL ETS","LES PRESSOIRS COQUARD","LOCHERON JOEL SA","LOGITRADE SA","LOU ETS","MAG SAS - CHARRUES DEMBLON","MAGUIN SAS","MAINTENANCE BOBINAGE INDUSTRIEL","MAISON DE RETRAITE DEP. DE L AISNE","MAISON RETRAITE VERVINS","MATRA ELECTRONIQUE","MAUPRIVEZ ENT","MCI SAS","MCT","MISSENARD CLIMATIQUE 59","MISSENARD CLIMATIQUE AMIENS","MISSENARD CLIMATIQUE ARRAS","MISSENARD CLIMATIQUE BEAUVAIS","MISSENARD CLIMATIQUE HC","MISSENARD CLIMATIQUE INSTALL","MISSENARD CLIMATIQUE REIMS","MISSENARD CLIMATIQUE SOISSONS","MISSENARD CLIMATIQUE ST QUENTIN","MONSEGU S A","MORELLE Ets","MORIN WANDERPEPEN S.A.S","MORLET EPERNAY SAS","N'THERMIQUE","NESTLE FRANCE ITANCOURT","NLMK Coating S.A.","NOIROT","NORD EST CLIMATIC","P C P V","PARTICULIER","PERSINET FABIAN","PHIDEL SAS","PLANETE AZUR","POINT CHAUFFAGE","POULAIN SARL","PRO","Passion Malts Concepts","R'Elec","RHODIA OPERATIONS SAS","RSC VISERY SAS","Région Hauts-de-France","S G I","S.D.R 60","S.T.I.","S.T.I.O","SANICONFORT","SARDA WETISCHECK  ENT","SCOP","SEIBO","SERIP SAS","SERVICE TECHNIQUE CHAUNY","SISTEM","SOREM","SORETHERM PICARDIE","STIO","T.R. EQUIPEMENTS","TATA STEEL FRANCE Bâtiments et Systèmes","TCAP ENERGIE","TESTE","THERMACLIM - AVITHERM","THERMOTEC SERVICES","USEDA","VAUVILLE - SARL","VAZ THERMIC","VILLE DE GUISE","VILLE DE LAON","VILLE DE TERGNIER","VILLEVOYE SARL","VILLIERS DEPANNAGE","VINCI LILLE","WEST PHARMACEUTICAL","WILLIAM SAURIN","WOJEWODKA ETS","XAVIER PERE ET FILS"];

/** Catalogue de points par défaut (nom → type d'E/S). */
export const CATALOG: CatalogPoint[] = [{"nom":"Capteur pression","type":"AI"},{"nom":"Commande","type":"DO"},{"nom":"Commande chaudiére 1","type":"AO"},{"nom":"Commande chaudiére 2","type":"AO"},{"nom":"Commande pompe 1","type":"DO"},{"nom":"Commande pompe 2","type":"DO"},{"nom":"Commande Pompe primaire ECS","type":"DO"},{"nom":"Commande Vanne 2 voies","type":"DO"},{"nom":"Commande Vanne 3 voies","type":"AO"},{"nom":"Compteur Impulsion","type":"DI"},{"nom":"Compteur Mbus","type":"COM"},{"nom":"Compteur Modbus","type":"COM"},{"nom":"Defaut","type":"DI"},{"nom":"Defaut chaudière 1","type":"DI"},{"nom":"Defaut chaudière 2","type":"DI"},{"nom":"Defaut ECS","type":"DI"},{"nom":"Defaut Manque Eau","type":"DI"},{"nom":"Defaut Manque Gaz","type":"DI"},{"nom":"Defaut Manque Tension","type":"DI"},{"nom":"Defaut pompe 1","type":"DI"},{"nom":"Defaut pompe 2","type":"DI"},{"nom":"Defaut Pompe bouclage 1","type":"DI"},{"nom":"Defaut Pompe bouclage 2","type":"DI"},{"nom":"Defaut pompe de relevage","type":"DI"},{"nom":"Defaut Pompe primaire ECS","type":"DI"},{"nom":"Pilotage","type":"AO"},{"nom":"Pressostat d'air","type":"DI"},{"nom":"Retour marche","type":"DI"},{"nom":"Sonde ambiance","type":"AI"},{"nom":"Sonde ambiance Ss Fil","type":"COM"},{"nom":"Sonde CO2","type":"AI"},{"nom":"Sonde départ","type":"AI"},{"nom":"Sonde départ chaudiere 1","type":"AI"},{"nom":"Sonde départ chaudiere 2","type":"AI"},{"nom":"Sonde départ primaire","type":"AI"},{"nom":"Sonde extérieur","type":"AI"},{"nom":"Sonde reprise","type":"AI"},{"nom":"Sonde retour","type":"AI"},{"nom":"Sonde soufflage","type":"AI"},{"nom":"Securite Plancher Chauffant","type":"DI"},{"nom":"Compteur Gaz Sans Fils","type":"AO"},{"nom":"Compteur Eau Sans Fils","type":"AO"},{"nom":"Compteur Electrique Sans Fils","type":"AO"},{"nom":"Commande Moteur Air Soufflé","type":"AO"},{"nom":"Défaut Moteur Air Soufflé","type":"DI"},{"nom":"Défaut Débit Air Soufflé","type":"DI"},{"nom":"Sonde Air Soufflé","type":"AI"},{"nom":"Commande Moteur Air Repris","type":"AO"},{"nom":"Défaut Moteur Air Repris","type":"DI"},{"nom":"Défaut Débit Air Repris","type":"DI"},{"nom":"Sonde Air Repris","type":"AI"},{"nom":"Sonde Après Echangeur","type":"AI"},{"nom":"Commande Vanne Chaud","type":"AO"},{"nom":"Commande Vanne Froid","type":"AO"},{"nom":"Pressostat Filtre d'Air Neuf","type":"DI"},{"nom":"Pressostat Filtre d'Air Repris","type":"DI"},{"nom":"Sonde Air Neuf","type":"AI"},{"nom":"Commande registre Air Neuf","type":"AO"},{"nom":"Commande registre Air Soufflé","type":"AO"},{"nom":"Commande registre Air Regeté","type":"AO"}];

/** Modèles : une section pré-remplie de points (par nom). */
export const TEMPLATES: Record<string, string[]> = {
  "Généralité": [
    "Sonde extérieur",
    "Sonde départ primaire",
    "Sonde Retour",
    "Defaut Manque Eau",
    "Defaut Manque Gaz",
    "Defaut Manque Tension",
    "Defaut pompe de relevage"
  ],
  "Circuit Régulé": [
    "Sonde départ",
    "Sonde Retour",
    "Sonde ambiance",
    "Sonde ambiance Ss Fil",
    "Commande Vanne 3 voies",
    "Commande pompe 1",
    "Commande pompe 2",
    "Defaut pompe 1",
    "Defaut pompe 2",
    "Compteur Mbus"
  ],
  "ECS": [
    "Sonde départ",
    "Sonde retour",
    "Commande Pompe primaire ECS",
    "Defaut ECS",
    "Defaut Pompe bouclage 1",
    "Defaut Pompe bouclage 2",
    "Defaut Pompe primaire ECS"
  ],
  "Chaudiere": [
    "Sonde départ chaudiere 1",
    "Sonde départ chaudiere 2",
    "Commande chaudiére 1",
    "Commande chaudiére 2",
    "Defaut chaudière 1",
    "Defaut chaudière 2",
    "Commande Vanne 2 voies",
    "Commande Vanne 2 voies",
    "Capteur pression"
  ],
  "CTA": [
    "Commande Moteur Air Soufflé",
    "Défaut Moteur Air Soufflé",
    "Défaut Débit Air Soufflé",
    "Sonde Air Soufflé",
    "Commande Moteur Air Repris",
    "Défaut Moteur Air Repris",
    "Défaut Débit Air Repris",
    "Sonde Air Repris",
    "Sonde Après Echangeur",
    "Commande Vanne Chaud",
    "Commande Vanne Froid",
    "Pressostat Filtre d'Air Neuf",
    "Pressostat Filtre d'Air Repris",
    "Sonde Air Neuf",
    "Commande registre Air Neuf",
    "Commande registre Air Soufflé",
    "Commande registre Air Regeté"
  ]
};

/** Modèles par défaut au format { nom, points:[{nom,type}] }, résolus depuis le
 *  catalogue (repli type "DI" si un nom n'y figure pas). Sert de seed BDD. */
export function modelesParDefaut(): { nom: string; points: CatalogPoint[] }[] {
  const typeDe = (nom: string): IoType =>
    CATALOG.find((p) => p.nom === nom)?.type ?? "DI";
  return Object.entries(TEMPLATES).map(([nom, noms]) => ({
    nom,
    points: noms.map((n) => ({ nom: n, type: typeDe(n) })),
  }));
}
