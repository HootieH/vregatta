const MAX_HISTORY = 20;
const MAX_EVENTS = 50;

export class LiveState {
  constructor() {
    this.boat = null;
    this.race = null;
    this.competitors = new Map();
    this.history = [];
    this.events = [];
  }

  updateBoat(newState) {
    const prevState = this.boat;
    this.boat = newState;

    this.history.push(newState);
    if (this.history.length > MAX_HISTORY) {
      this.history.splice(0, this.history.length - MAX_HISTORY);
    }

    const detectedEvents = prevState ? this.detectEvents(prevState, newState) : [];
    for (const evt of detectedEvents) {
      this.events.push(evt);
    }
    if (this.events.length > MAX_EVENTS) {
      this.events.splice(0, this.events.length - MAX_EVENTS);
    }

    return { changed: true, events: detectedEvents };
  }

  detectEvents(prevState, newState) {
    const events = [];
    const now = newState.timestamp ?? Date.now();

    if (
      prevState.twa != null &&
      newState.twa != null &&
      Math.sign(prevState.twa) !== Math.sign(newState.twa) &&
      prevState.twa !== 0 &&
      newState.twa !== 0
    ) {
      if (Math.abs(newState.twa) <= 90) {
        events.push({ type: 'tack', timestamp: now });
      } else {
        events.push({ type: 'gybe', timestamp: now });
      }
    }

    if (
      prevState.sail != null &&
      newState.sail != null &&
      prevState.sail !== newState.sail
    ) {
      events.push({ type: 'sailChange', from: prevState.sail, to: newState.sail, timestamp: now });
    }

    return events;
  }

  computeVMG(boatState) {
    if (!boatState || boatState.speed == null || boatState.twa == null) {
      return null;
    }

    const twaRad = (boatState.twa * Math.PI) / 180;
    const vmg = boatState.speed * Math.cos(twaRad);
    const component = Math.abs(boatState.twa) < 90 ? 'upwind' : 'downwind';

    return { vmg, component };
  }

  computeDistanceSailed(prev, curr) {
    if (!prev || !curr || prev.lat == null || prev.lon == null || curr.lat == null || curr.lon == null) {
      return null;
    }

    const R = 6371000; // Earth radius in meters
    const toRad = (deg) => (deg * Math.PI) / 180;

    const dLat = toRad(curr.lat - prev.lat);
    const dLon = toRad(curr.lon - prev.lon);
    const lat1 = toRad(prev.lat);
    const lat2 = toRad(curr.lat);

    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const meters = R * c;

    return meters / 1852; // convert to nautical miles
  }

  getSnapshot() {
    return {
      boat: this.boat,
      race: this.race,
      competitorCount: this.competitors.size,
      vmg: this.computeVMG(this.boat),
      events: this.events.slice(-5),
      connected: this.boat !== null,
    };
  }
}
