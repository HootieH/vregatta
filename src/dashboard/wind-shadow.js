/**
 * Wind shadow inference and visualization.
 *
 * Computes shadow cones downwind of each boat and renders them on the map.
 * Detects when the player boat is in another boat's dirty air.
 */
import L from 'leaflet';

const SHADOW_COLOR = '#ff6b35';
const SHADOW_FILL_OPACITY = 0.12;
const SHADOW_STROKE_OPACITY = 0.25;
const SHADOW_CONE_ANGLE = 30; // degrees total (15 each side)
const SHADOW_LENGTH = 800;    // game units
const SHADOW_HALF_ANGLE_RAD = ((SHADOW_CONE_ANGLE / 2) * Math.PI) / 180;

/**
 * Initialize wind shadow visualization on the map.
 *
 * @param {L.Map} map - Leaflet map instance
 * @param {HTMLElement} container - map container for warning overlay
 * @returns {{ update: function, toggle: function, isVisible: function }}
 */
export function initWindShadow(map, container) {
  const shadowGroup = L.layerGroup().addTo(map);
  let visible = true;

  // Shadow warning overlay
  const warningEl = document.createElement('div');
  warningEl.className = 'map-shadow-warning';
  warningEl.style.display = 'none';
  container.appendChild(warningEl);

  // Cache polygon references by slot to avoid re-creating every frame
  const shadowPolygons = new Map();

  /**
   * Compute the shadow cone polygon points for a boat.
   * Shadow extends DOWNWIND from the boat.
   *
   * @param {object} boat - { x, y }
   * @param {number} windDir - true wind direction in degrees
   * @returns {Array<[number,number]>} polygon vertices [lat, lng]
   */
  function computeShadowCone(boat, windDir) {
    // Downwind direction = wind direction (wind blows FROM windDir, so downwind OF the boat is windDir direction from the boat)
    // Actually: wind comes FROM windDir. A boat's shadow is cast in the direction the wind is going,
    // which is windDir + 180. But "downwind of the boat" means the area that is further along
    // where the wind goes PAST the boat — that's windDir (the direction FROM which wind comes)
    // reversed: shadow extends in the direction windDir + 180... No.
    //
    // Think of it this way: wind blows FROM 179 (roughly south). Boats to the NORTH of a boat
    // are upwind. The shadow is cast DOWNWIND = to the north = windDir + 180 = ~359 = north.
    // Wait, that's wrong. If wind is from the south (179), downwind is NORTH.
    // windDir + 180 = 359 degrees. In our coordinate system (heading 0=east, or game coords),
    // we need to be careful.
    //
    // The game uses: X=North, Y=East. Wind direction 179 means wind blows FROM 179 degrees.
    // "Downwind" from a boat = the direction wind is traveling TO = windDir + 180.
    // Shadow extends FROM the boat in the downwind direction.
    const downwindDeg = (windDir + 180) % 360;
    const downwindRad = (downwindDeg * Math.PI) / 180;

    // Cone apex is at the boat position
    const ax = boat.x;
    const ay = boat.y;

    // Two edges of the cone at SHADOW_LENGTH distance
    const leftRad = downwindRad - SHADOW_HALF_ANGLE_RAD;
    const rightRad = downwindRad + SHADOW_HALF_ANGLE_RAD;

    const lx = ax + SHADOW_LENGTH * Math.cos(leftRad);
    const ly = ay + SHADOW_LENGTH * Math.sin(leftRad);
    const rx = ax + SHADOW_LENGTH * Math.cos(rightRad);
    const ry = ay + SHADOW_LENGTH * Math.sin(rightRad);

    // Triangle: apex, left edge, right edge
    return [[ax, ay], [lx, ly], [rx, ry]];
  }

  /**
   * Check if a point is inside a shadow cone.
   *
   * @param {number} px - point x
   * @param {number} py - point y
   * @param {object} sourceBoat - boat casting the shadow { x, y }
   * @param {number} windDir - true wind direction
   * @returns {{ inShadow: boolean, distance: number, speedLoss: number }}
   */
  function checkShadow(px, py, sourceBoat, windDir) {
    const downwindDeg = (windDir + 180) % 360;
    const downwindRad = (downwindDeg * Math.PI) / 180;

    // Vector from source boat to point
    const dx = px - sourceBoat.x;
    const dy = py - sourceBoat.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < 1 || dist > SHADOW_LENGTH) {
      return { inShadow: false, distance: dist, speedLoss: 0 };
    }

    // Angle from source boat to point
    const angleToPoint = Math.atan2(dy, dx);

    // Angular difference from downwind direction
    let angleDiff = angleToPoint - downwindRad;
    // Normalize to -PI..PI
    while (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;
    while (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;

    if (Math.abs(angleDiff) > SHADOW_HALF_ANGLE_RAD) {
      return { inShadow: false, distance: dist, speedLoss: 0 };
    }

    // In shadow — compute speed loss (fades with distance)
    // Max ~15% loss at closest, fading to 0 at SHADOW_LENGTH
    const distRatio = 1 - (dist / SHADOW_LENGTH);
    const speedLossPct = 0.15 * distRatio;
    // Approximate loss in knots (assume ~7kn base speed)
    const speedLossKnots = +(7 * speedLossPct).toFixed(1);

    return { inShadow: true, distance: dist, speedLoss: speedLossKnots };
  }

  function update(boats, windDirection) {
    if (windDirection == null || !boats || boats.length === 0) {
      warningEl.style.display = 'none';
      return;
    }

    const playerBoat = boats.find(b => b.isPlayer);
    const otherBoats = boats.filter(b => !b.isPlayer);

    // Track which slots still exist
    const activeSlots = new Set();

    // Update shadow cones for non-player boats
    for (const boat of otherBoats) {
      activeSlots.add(boat.slot);
      const conePoints = computeShadowCone(boat, windDirection);

      let poly = shadowPolygons.get(boat.slot);
      if (poly) {
        poly.setLatLngs(conePoints);
      } else {
        poly = L.polygon(conePoints, {
          color: SHADOW_COLOR,
          weight: 1,
          opacity: SHADOW_STROKE_OPACITY,
          fillColor: SHADOW_COLOR,
          fillOpacity: SHADOW_FILL_OPACITY,
          interactive: false,
        });
        if (visible) poly.addTo(shadowGroup);
        shadowPolygons.set(boat.slot, poly);
      }
    }

    // Remove stale shadow cones
    for (const [slot, poly] of shadowPolygons) {
      if (!activeSlots.has(slot)) {
        shadowGroup.removeLayer(poly);
        shadowPolygons.delete(slot);
      }
    }

    // Check if player is in any shadow
    if (!visible) {
      warningEl.style.display = 'none';
      return;
    }

    if (playerBoat) {
      let worstShadow = null;
      let worstSlot = null;

      for (const boat of otherBoats) {
        const result = checkShadow(playerBoat.x, playerBoat.y, boat, windDirection);
        if (result.inShadow) {
          if (!worstShadow || result.speedLoss > worstShadow.speedLoss) {
            worstShadow = result;
            worstSlot = boat.slot;
          }
        }
      }

      if (worstShadow) {
        warningEl.style.display = '';
        warningEl.innerHTML =
          `<div class="shadow-warning-title">IN WIND SHADOW</div>` +
          `<div class="shadow-warning-detail">-${worstShadow.speedLoss}kn from Boat #${worstSlot}'s shadow</div>`;
      } else {
        warningEl.style.display = 'none';
      }
    } else {
      warningEl.style.display = 'none';
    }
  }

  function toggle() {
    visible = !visible;
    if (visible) {
      shadowGroup.addTo(map);
    } else {
      map.removeLayer(shadowGroup);
      warningEl.style.display = 'none';
    }
    return visible;
  }

  function isVisible() {
    return visible;
  }

  return { update, toggle, isVisible };
}
