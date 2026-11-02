// GENERATED from jgor80/11-lab@53e9a20 src/chemistry/index.ts by scripts/sync-xilab.mjs. Do not edit.
// Public entry point for the chemistry engine. Worker-safe: no Node-only imports anywhere below.
export { computeSquadChemistry, isInPosition, ENGINE_VERSION, SquadInputError } from "./engine.ts";
export { diffSquadChemistry, previewSwap, type SlotChange, type SquadChemistryDiff } from "./diff.ts";
export {
  KNOWN_MODIFIERS,
  LINK_TYPES,
  RulesError,
  nextThreshold,
  pointsFor,
  validateRules,
  type ChemistryRules,
  type LinkType,
} from "./rules.ts";
export type * from "./types.ts";
