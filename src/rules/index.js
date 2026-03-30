/**
 * Racing Rules of Sailing module.
 * Re-exports the rules database and encounter detector.
 */

export { getAllRules, getRule, getRandomRule, rules } from './rrs-database.js';
export {
  detectEncounters,
  determineTack,
  distanceBetween,
  isOverlapped,
  isWindward,
  areConverging,
} from './encounter-detector.js';
