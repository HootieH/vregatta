import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { classify } from '../classifier.js';
import {
  normalizeBoatState,
  normalizeCompetitor,
  normalizeRaceMeta,
} from '../schemas/index.js';
import {
  openDB,
  saveBoatState,
  saveCompetitors,
  saveRace,
  getBoatHistory,
  exportRace,
  cleanup,
} from '../storage/idb.js';
import {
  mockBoatResponse,
  mockFleetResponse,
  mockRaceResponse,
  mockUrls,
} from './mocks/vr-responses.js';

beforeEach(() => {
  const req = indexedDB.deleteDatabase('vregatta');
  return new Promise((resolve) => {
    req.onsuccess = () => resolve();
    req.onerror = () => resolve();
  });
});

describe('full pipeline: classify → normalize → store → read', () => {
  it('boat: classify → normalize → save → read back', async () => {
    const db = await openDB();

    // Classify
    const { type, data } = classify(mockUrls.boat, mockBoatResponse);
    expect(type).toBe('boat');

    // Normalize (same logic as background.js)
    const sd = data.scriptData ?? data;
    const normalized = normalizeBoatState(sd);
    expect(normalized).not.toBeNull();

    // Add raceId for storage query
    const withRace = { ...normalized, raceId: 'test-race' };

    // Save
    await saveBoatState(db, withRace);

    // Read back
    const history = await getBoatHistory(db, 'test-race');
    expect(history).toHaveLength(1);
    expect(history[0].lat).toBe(48.8566);
    expect(history[0].lon).toBe(-5.3472);
    expect(history[0].speed).toBe(14.2);
    expect(history[0].heading).toBe(215);
    expect(history[0].sail).toBe(5);

    db.close();
  });

  it('fleet: classify → normalize each → save → read back', async () => {
    const db = await openDB();

    // Classify
    const { type, data } = classify(mockUrls.fleet, mockFleetResponse);
    expect(type).toBe('fleet');

    // Normalize
    const items = Array.isArray(data) ? data : [];
    const normalized = items.map(normalizeCompetitor).filter(Boolean);
    expect(normalized).toHaveLength(3);

    // Save
    const raceId = 'test-race';
    const timestamp = Date.now();
    await saveCompetitors(db, raceId, timestamp, normalized);

    // Read back
    const stored = await new Promise((resolve, reject) => {
      const tx = db.transaction('competitors', 'readonly');
      const req = tx.objectStore('competitors').index('raceId').getAll(raceId);
      req.onsuccess = () => resolve(req.result);
      req.onerror = (e) => reject(e.target.error);
    });

    expect(stored).toHaveLength(3);
    expect(stored[0].name).toBe('SailorAlice');
    expect(stored[1].name).toBe('CaptainBob');
    expect(stored[2].name).toBe('WindChaser');
    expect(stored[0].raceId).toBe(raceId);

    db.close();
  });

  it('race: classify → normalize → save → exportRace → verify', async () => {
    const db = await openDB();

    // Classify
    const { type, data } = classify(mockUrls.race, mockRaceResponse);
    expect(type).toBe('race');

    // Normalize (same logic as background.js)
    const legs = data.scriptData.currentLegs;
    const leg = Array.isArray(legs) ? legs[0] : data;
    const normalized = normalizeRaceMeta(leg);
    expect(normalized).not.toBeNull();

    // Save race
    await saveRace(db, normalized);

    // Also save a boat state and competitors for the export
    const boatState = {
      raceId: normalized.raceId,
      lat: 48.8566,
      lon: -5.3472,
      speed: 14.2,
      timestamp: Date.now(),
    };
    await saveBoatState(db, boatState);

    const competitors = [
      { id: 'c1', name: 'Alice', lat: 48.92, lon: -5.18, raceId: normalized.raceId },
    ];
    await saveCompetitors(db, normalized.raceId, Date.now(), competitors);

    // Export
    const exported = await exportRace(db, normalized.raceId);
    expect(exported.race).not.toBeNull();
    expect(exported.race.raceId).toBe('vendee-2024-leg1');
    expect(exported.race.name).toBe('Vendee Globe 2024');
    expect(exported.boatStates).toHaveLength(1);
    expect(exported.competitors).toHaveLength(1);

    db.close();
  });

  it('cleanup removes old data', async () => {
    const db = await openDB();
    const now = Date.now();
    const oldTimestamp = now - 60 * 24 * 60 * 60 * 1000; // 60 days ago
    const recentTimestamp = now - 1 * 24 * 60 * 60 * 1000; // 1 day ago

    await saveBoatState(db, { raceId: 'r1', lat: 1, lon: 2, timestamp: oldTimestamp });
    await saveBoatState(db, { raceId: 'r1', lat: 3, lon: 4, timestamp: recentTimestamp });

    await cleanup(db, 30);

    const history = await getBoatHistory(db, 'r1');
    expect(history).toHaveLength(1);
    expect(history[0].timestamp).toBe(recentTimestamp);

    db.close();
  });
});
