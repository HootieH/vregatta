const MAX_POINTS = 240; // ~2 hours at 30s intervals
const MAX_AGE_MS = 2 * 60 * 60 * 1000; // 2 hours
const SHIFT_WINDOW_MS = 10 * 60 * 1000; // 10 minutes
const SHIFT_THRESHOLD_DEG = 15;

function angleDiff(a, b) {
  let d = ((b - a + 540) % 360) - 180;
  return d;
}

export function initWindHistory() {
  const points = [];

  function addPoint(tws, twd, timestamp) {
    if (tws == null || twd == null) return;
    const ts = timestamp ?? Date.now();
    points.push({ tws, twd, timestamp: ts });

    // Trim old points
    const cutoff = Date.now() - MAX_AGE_MS;
    while (points.length > 0 && points[0].timestamp < cutoff) {
      points.shift();
    }
    while (points.length > MAX_POINTS) {
      points.shift();
    }
  }

  function getData() {
    return points.slice();
  }

  function getShifts() {
    const shifts = [];
    if (points.length < 2) return { shifts };

    for (let i = 1; i < points.length; i++) {
      const current = points[i];
      // Look back within the shift window
      let j = i - 1;
      while (j >= 0 && current.timestamp - points[j].timestamp <= SHIFT_WINDOW_MS) {
        j--;
      }
      j = Math.max(0, j + 1);

      const ref = points[j];
      if (current.timestamp - ref.timestamp < 60000) continue; // need at least 1 min span

      const diff = angleDiff(ref.twd, current.twd);
      const magnitude = Math.abs(diff);

      if (magnitude >= SHIFT_THRESHOLD_DEG) {
        const direction = diff > 0 ? 'veering' : 'backing';
        // Avoid duplicate shift events for the same shift
        const lastShift = shifts[shifts.length - 1];
        if (lastShift && current.timestamp - lastShift.timestamp < SHIFT_WINDOW_MS) {
          // Update existing shift if magnitude grew
          if (magnitude > lastShift.magnitude) {
            lastShift.toTwd = current.twd;
            lastShift.magnitude = magnitude;
            lastShift.direction = direction;
            lastShift.timestamp = current.timestamp;
          }
          continue;
        }

        shifts.push({
          timestamp: current.timestamp,
          fromTwd: ref.twd,
          toTwd: current.twd,
          direction,
          magnitude,
        });
      }
    }

    return { shifts };
  }

  return { addPoint, getData, getShifts };
}
