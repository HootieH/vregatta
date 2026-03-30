import { FleetAccumulator } from '../colyseus/fleet-accumulator.js';

const MAX_HISTORY = 20;
const MAX_EVENTS = 50;

export class LiveState {
  constructor() {
    this.boat = null;
    this.race = null;
    this.competitors = new Map();
    this.history = [];
    this.events = [];
    this.inshoreBoats = new Map();
    this.inshoreTick = 0;
    this.fleetAccumulator = new FleetAccumulator();
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

  updateInshore(normalizedState) {
    if (!normalizedState || !normalizedState.boats) {
      return { changed: false, events: [], newBoatSpotted: false };
    }

    let changed = false;
    const detectedEvents = [];
    this.inshoreTick = normalizedState.tick;

    // Wind data from Inshore state
    if (normalizedState.windDirection != null) {
      this.inshoreWindDirection = normalizedState.windDirection;
    }
    if (normalizedState.windSpeed != null) {
      this.inshoreWindSpeed = normalizedState.windSpeed;
    }
    // Race info
    if (normalizedState.currentLap != null) {
      this.inshoreCurrentLap = normalizedState.currentLap;
    }
    if (normalizedState.raceTimerSeconds != null) {
      this.inshoreRaceTimerSeconds = normalizedState.raceTimerSeconds;
    }
    if (normalizedState.raceId != null) {
      this.inshoreRaceId = normalizedState.raceId;
    }

    for (const boat of normalizedState.boats) {
      const prev = this.inshoreBoats.get(boat.slot);
      if (!prev || prev.heading !== boat.heading || prev.x !== boat.x || prev.y !== boat.y || prev.speedRaw !== boat.speedRaw) {
        changed = true;
      }

      // Detect tack/gybe events for player boat from TWA sign change
      if (boat.isPlayer && prev && prev.twa != null && boat.twa != null
          && prev.twa !== 0 && boat.twa !== 0
          && Math.sign(prev.twa) !== Math.sign(boat.twa)) {
        const now = normalizedState.timestamp ?? Date.now();
        if (Math.abs(boat.twa) <= 90) {
          detectedEvents.push({ type: 'tack', timestamp: now, source: 'inshore' });
        } else {
          detectedEvents.push({ type: 'gybe', timestamp: now, source: 'inshore' });
        }
      }

      this.inshoreBoats.set(boat.slot, boat);
    }

    // Feed the fleet accumulator
    const accResult = this.fleetAccumulator.update(normalizedState);

    for (const evt of detectedEvents) {
      this.events.push(evt);
    }
    if (this.events.length > MAX_EVENTS) {
      this.events.splice(0, this.events.length - MAX_EVENTS);
    }

    return { changed, events: detectedEvents, newBoatSpotted: accResult.newBoatSpotted };
  }

  getSnapshot() {
    const playerBoat = this.inshoreBoats.size > 0
      ? Array.from(this.inshoreBoats.values()).find(b => b.isPlayer) ?? null
      : null;

    // Accumulated fleet data
    const accFleet = this.fleetAccumulator.getFleet();
    const accStats = this.fleetAccumulator.getStats();

    return {
      boat: this.boat,
      race: this.race,
      competitorCount: this.competitors.size,
      vmg: this.computeVMG(this.boat),
      events: this.events.slice(-5),
      connected: this.boat !== null || this.inshoreBoats.size > 0,
      inshoreBoats: Array.from(this.inshoreBoats.values()),
      inshoreAllBoats: accFleet,
      inshoreFleetSize: accStats.totalSeen,
      inshoreTick: this.inshoreTick,
      inshoreActive: this.inshoreBoats.size > 0 || accStats.totalSeen > 0,
      inshoreWindDirection: this.inshoreWindDirection ?? null,
      inshoreWindSpeed: this.inshoreWindSpeed ?? null,
      inshorePlayerBoat: playerBoat,
      inshoreTwa: playerBoat?.twa ?? null,
      inshoreTack: playerBoat?.tack ?? null,
      inshorePointOfSail: playerBoat?.pointOfSail ?? null,
      inshoreVmg: playerBoat?.vmg ?? null,
      inshoreSpeed: playerBoat?.speedRaw ?? null,
      inshoreAccStats: accStats,
      inshoreCurrentLap: this.inshoreCurrentLap ?? null,
      inshoreRaceTimerSeconds: this.inshoreRaceTimerSeconds ?? null,
      inshoreRaceId: this.inshoreRaceId ?? null,
      // Fleet data is added by background.js from FleetManager
      inshoreFleet: [],
      inshoreFleetStats: { total: 0, inRace: 0, withPosition: 0, withName: 0 },
    };
  }
}
