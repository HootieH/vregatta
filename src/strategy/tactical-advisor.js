import { computeSailScore, computeVMGEfficiency } from '../analytics/performance.js';
import { computeLaylines } from '../routing/layline.js';
import { bearingTo, distanceNm, twaForHeading } from '../routing/geometry.js';
import { bestVMG } from '../polars/best-vmg.js';

/**
 * Analyzes current situation and returns prioritized tactical advice.
 * @param {object} boat - {lat, lon, speed, heading, twa, tws, twd, sail}
 * @param {{lat:number, lon:number}} waypoint
 * @param {object} polar - polar data
 * @param {string[]} options - e.g. ['foil','hull','light','heavy','reach']
 * @param {object} windHistory - wind history tracker with getShifts()
 * @param {object[]} competitors - array of competitor objects
 * @returns {{advice: object[], summary: string}}
 */
export function getTacticalAdvice(boat, waypoint, polar, options, windHistory, competitors) {
  if (!boat) throw new Error('getTacticalAdvice: boat is required');
  if (!polar) throw new Error('getTacticalAdvice: polar is required');

  const advice = [];
  const opts = options || [];

  // 1. Wind shift opportunity
  if (windHistory && typeof windHistory.getShifts === 'function') {
    const { shifts } = windHistory.getShifts();
    if (shifts && shifts.length > 0) {
      const latest = shifts[shifts.length - 1];
      const ageMs = Date.now() - latest.timestamp;
      if (ageMs < 10 * 60 * 1000) { // within last 10 min
        const isHeader = isWindShiftHeader(boat, latest);
        if (isHeader) {
          advice.push({
            priority: 1,
            type: 'wind_shift',
            message: `Header ${latest.magnitude.toFixed(0)}° ${latest.direction} — tack now`,
            action: 'tack',
            urgency: latest.magnitude >= 25 ? 'critical' : 'high',
          });
        } else {
          advice.push({
            priority: 3,
            type: 'wind_shift',
            message: `Lift ${latest.magnitude.toFixed(0)}° ${latest.direction} — hold course`,
            action: 'hold',
            urgency: 'low',
          });
        }
      }
    }
  }

  // 2. Layline proximity
  if (waypoint && boat.tws != null && boat.twd != null) {
    try {
      const laylines = computeLaylines(boat, waypoint, polar, opts);
      if (laylines.onLayline) {
        advice.push({
          priority: 1,
          type: 'layline',
          message: 'On layline — tack/gybe to mark now',
          action: 'tack_to_mark',
          urgency: 'critical',
        });
      } else if (laylines.laylineDistance != null && laylines.laylineDistance < 0.5) {
        advice.push({
          priority: 2,
          type: 'layline',
          message: `Layline ${laylines.laylineDistance.toFixed(1)}nm away — prepare to tack`,
          action: 'prepare_tack',
          urgency: 'high',
        });
      }
    } catch {
      // Missing data for layline computation — skip silently
    }
  }

  // 3. Sail optimization
  if (boat.twa != null && boat.tws != null && boat.sail != null) {
    const sailScore = computeSailScore(boat, polar, opts);
    if (sailScore && !sailScore.correct) {
      const lossStr = sailScore.speedLoss > 0 ? ` (losing ${sailScore.speedLoss.toFixed(1)}kn)` : '';
      advice.push({
        priority: 2,
        type: 'sail',
        message: `Switch to ${sailScore.optimalSail}${lossStr}`,
        action: `sail_${sailScore.optimalSail.toLowerCase().replace(/\s/g, '')}`,
        urgency: sailScore.speedLoss >= 1.5 ? 'high' : 'medium',
      });
    }
  }

  // 4. VMG optimization
  if (boat.twa != null && boat.tws != null && boat.speed != null) {
    const vmgEff = computeVMGEfficiency(boat, polar, opts);
    if (vmgEff != null && vmgEff < 85) {
      const vmgData = bestVMG(boat.tws, polar, opts);
      const absTwa = Math.abs(boat.twa);
      const isUpwind = absTwa < 90;
      const optimalTwa = isUpwind ? vmgData.twaUp : vmgData.twaDown;
      const twaDiff = optimalTwa - absTwa;
      const direction = twaDiff > 0 ? 'bear away' : 'head up';
      advice.push({
        priority: 3,
        type: 'vmg',
        message: `VMG ${vmgEff.toFixed(0)}% — ${direction} ${Math.abs(twaDiff).toFixed(0)}°`,
        action: 'adjust_heading',
        urgency: vmgEff < 70 ? 'high' : 'medium',
      });
    }
  }

  // 5. Competitor awareness
  if (competitors && competitors.length > 0 && boat.lat != null && boat.lon != null) {
    for (const comp of competitors) {
      if (comp.lat == null || comp.lon == null) continue;
      const dist = distanceNm(boat, comp);
      if (dist > 5) continue; // only nearby

      const brgToComp = bearingTo(boat, comp);
      const brgDiff = Math.abs(((boat.heading - brgToComp + 540) % 360) - 180);

      if (brgDiff < 30 && dist < 2) {
        advice.push({
          priority: 4,
          type: 'competitor',
          message: `${comp.name || 'Competitor'} ${dist.toFixed(1)}nm ahead — converging`,
          action: 'monitor',
          urgency: dist < 0.5 ? 'high' : 'medium',
        });
        break; // only flag closest convergence
      }
    }
  }

  // Sort by priority (1 = highest)
  advice.sort((a, b) => a.priority - b.priority);

  // Limit to 5
  const limited = advice.slice(0, 5);

  const summary = limited.length > 0
    ? limited[0].message
    : 'No tactical advice — steady as she goes';

  return { advice: limited, summary };
}

/**
 * Determines if a wind shift is a header (wind shifted toward your bow).
 * A header means the wind moved so your TWA got smaller — tacking is beneficial.
 */
function isWindShiftHeader(boat, shift) {
  if (boat.twa == null || boat.heading == null) return false;
  // Compute what TWA would have been with old wind direction
  const oldTwa = twaForHeading(boat.heading, shift.fromTwd);
  const newTwa = twaForHeading(boat.heading, shift.toTwd);
  // Header = TWA decreased (wind came more from ahead)
  return newTwa < oldTwa;
}
