// Génération d'un squelette GFX (programme Distech) depuis une liste de points.
export { CONTROLLERS, getController, type ControllerConfig } from "./controllers";
export { planAssignment, expandRows, type AssignmentPlan, type AssignedPoint } from "./assign";
export { buildGfx, type GfxResult, type HomeInfo } from "./writer";
