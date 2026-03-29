// TODO: Parse actual Inshore WebSocket format once we capture real data
// Inshore uses WebSockets (likely Colyseus framework) with unknown message encoding.
// These stubs will be filled in after analyzing raw captured traffic.

/**
 * Normalize an Inshore game state update from WebSocket data.
 * @param {*} rawData - Raw WebSocket message data
 * @returns {object|null} Normalized state or null if not parseable yet
 */
export function normalizeInshoreState(/* rawData */) {
  // TODO: Implement once we know the Inshore WebSocket message format
  return null;
}

/**
 * Normalize an Inshore boat position/state from WebSocket data.
 * @param {*} rawData - Raw WebSocket message data
 * @returns {object|null} Normalized boat data or null if not parseable yet
 */
export function normalizeInshoreBoat(/* rawData */) {
  // TODO: Implement once we know the Inshore WebSocket message format
  return null;
}
