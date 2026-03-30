/**
 * Decodes LEAVE messages (type 0x02) from VR Inshore.
 *
 * LEAVE messages are OUTGOING from client to Game server, fired when
 * the player crosses a mark or gate.
 *
 * Message structure (after 0xf3 + 0x02 header):
 *   - payload[20] = mark ID (0, 1, or 2)
 *   - payload[21..24] = float32 BE crossing angle (NaN when not applicable)
 *
 * Mark semantics:
 *   - Mark 2 = start/finish area
 *   - Mark 0 = windward gate port pin
 *   - Mark 1 = windward gate starboard pin
 *
 * @param {Uint8Array|Buffer} buffer - Raw binary message (full, including 0xf3 header)
 * @returns {{markId: number, crossingAngle: number, hasAngle: boolean}|null}
 */
export function decodeLeaveMessage(buffer) {
  if (!buffer || buffer.length < 2) return null;

  // Strip 0xf3 header + 0x02 type byte to get payload
  const payload = buffer[0] === 0xf3 ? buffer.slice(2) : buffer;

  // Need at least 25 bytes in payload: 20 for offset + 1 markId + 4 float
  if (payload.length < 25) return null;

  const markId = payload[20];

  // Float32 BE at payload offset 21..24
  const angleBuf = new DataView(payload.buffer, payload.byteOffset + 21, 4);
  const crossingAngle = angleBuf.getFloat32(0, false); // big-endian

  const hasAngle = !isNaN(crossingAngle);

  return {
    markId,
    crossingAngle: hasAngle ? Math.round(crossingAngle * 100) / 100 : NaN,
    hasAngle,
  };
}
