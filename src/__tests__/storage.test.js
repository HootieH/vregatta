import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import {
  openDB,
  saveBoatState,
  saveCompetitors,
  saveRace,
  saveAction,
  saveWindSnapshot,
  getBoatHistory,
  exportRace,
  cleanup,
} from '../storage/idb.js';

// Reset IndexedDB between tests so each test gets a clean database
beforeEach(async () => {
  await new Promise((resolve) => {
    const req = indexedDB.deleteDatabase('vregatta');
    req.onsuccess = () => resolve();
    req.onerror = () => resolve();
    req.onblocked = () => resolve();
  });
});

describe('openDB', () => {
  it('opens the database and creates all object stores', async () => {
    const db = await openDB();
    expect(db.name).toBe('vregatta');
    expect([...db.objectStoreNames].sort()).toEqual(
      ['actions', 'boatStates', 'competitors', 'polars', 'races', 'windSnapshots'].sort()
    );
    db.close();
  });
});

describe('saveBoatState + getBoatHistory', () => {
  it('saves and reads back boat states for a race', async () => {
    const db = await openDB();
    const state1 = { raceId: 'race1', lat: 48.5, lon: -3.2, speed: 12, timestamp: 1000 };
    const state2 = { raceId: 'race1', lat: 48.6, lon: -3.3, speed: 13, timestamp: 2000 };
    const state3 = { raceId: 'race2', lat: 10.0, lon: 20.0, speed: 5, timestamp: 1500 };

    await saveBoatState(db, state1);
    await saveBoatState(db, state2);
    await saveBoatState(db, state3);

    const history = await getBoatHistory(db, 'race1');
    expect(history).toHaveLength(2);
    // Should be ordered by timestamp desc
    expect(history[0].timestamp).toBe(2000);
    expect(history[1].timestamp).toBe(1000);
    db.close();
  });

  it('respects the limit parameter', async () => {
    const db = await openDB();
    await saveBoatState(db, { raceId: 'r', timestamp: 1 });
    await saveBoatState(db, { raceId: 'r', timestamp: 2 });
    await saveBoatState(db, { raceId: 'r', timestamp: 3 });

    const history = await getBoatHistory(db, 'r', 2);
    expect(history).toHaveLength(2);
    expect(history[0].timestamp).toBe(3);
    db.close();
  });
});

describe('saveCompetitors', () => {
  it('saves competitors with raceId and timestamp', async () => {
    const db = await openDB();
    const comps = [
      { id: 'c1', name: 'Alice', lat: 48.0, lon: -3.0 },
      { id: 'c2', name: 'Bob', lat: 49.0, lon: -4.0 },
    ];

    await saveCompetitors(db, 'race1', 5000, comps);

    // Read back via a transaction
    const result = await new Promise((resolve, reject) => {
      const tx = db.transaction('competitors', 'readonly');
      const req = tx.objectStore('competitors').index('raceId').getAll('race1');
      req.onsuccess = () => resolve(req.result);
      req.onerror = (e) => reject(e.target.error);
    });

    expect(result).toHaveLength(2);
    expect(result[0].raceId).toBe('race1');
    expect(result[0].timestamp).toBe(5000);
    expect(result[0].name).toBe('Alice');
    db.close();
  });
});

describe('saveRace', () => {
  it('saves and upserts race metadata', async () => {
    const db = await openDB();
    await saveRace(db, { raceId: 'r1', name: 'Atlantic', playerCount: 100 });
    await saveRace(db, { raceId: 'r1', name: 'Atlantic Cup', playerCount: 150 });

    const result = await new Promise((resolve, reject) => {
      const tx = db.transaction('races', 'readonly');
      const req = tx.objectStore('races').get('r1');
      req.onsuccess = () => resolve(req.result);
      req.onerror = (e) => reject(e.target.error);
    });

    expect(result.name).toBe('Atlantic Cup');
    expect(result.playerCount).toBe(150);
    db.close();
  });
});

describe('saveAction', () => {
  it('saves an action record', async () => {
    const db = await openDB();
    await saveAction(db, { type: 'heading', value: 180, timestamp: 3000 });

    const result = await new Promise((resolve, reject) => {
      const tx = db.transaction('actions', 'readonly');
      const req = tx.objectStore('actions').getAll();
      req.onsuccess = () => resolve(req.result);
      req.onerror = (e) => reject(e.target.error);
    });

    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('heading');
    expect(result[0].value).toBe(180);
    db.close();
  });
});

describe('saveWindSnapshot', () => {
  it('saves a wind snapshot', async () => {
    const db = await openDB();
    await saveWindSnapshot(db, { fileUrl: 'https://example.com/wind.wnd', timestamp: 4000 });

    const result = await new Promise((resolve, reject) => {
      const tx = db.transaction('windSnapshots', 'readonly');
      const req = tx.objectStore('windSnapshots').getAll();
      req.onsuccess = () => resolve(req.result);
      req.onerror = (e) => reject(e.target.error);
    });

    expect(result).toHaveLength(1);
    expect(result[0].fileUrl).toBe('https://example.com/wind.wnd');
    db.close();
  });
});

describe('exportRace', () => {
  it('returns all data for a given raceId', async () => {
    const db = await openDB();

    await saveRace(db, { raceId: 'r1', name: 'Test Race' });
    await saveBoatState(db, { raceId: 'r1', lat: 48.5, lon: -3.2, timestamp: 1000 });
    await saveBoatState(db, { raceId: 'r1', lat: 48.6, lon: -3.3, timestamp: 2000 });
    await saveCompetitors(db, 'r1', 1000, [{ id: 'c1', name: 'Alice' }]);
    await saveAction(db, { type: 'sail', value: 2, timestamp: 1500 });
    await saveWindSnapshot(db, { fileUrl: 'wind.wnd', timestamp: 1000 });

    const data = await exportRace(db, 'r1');

    expect(data.race.name).toBe('Test Race');
    expect(data.boatStates).toHaveLength(2);
    expect(data.competitors).toHaveLength(1);
    expect(data.actions).toHaveLength(1);
    expect(data.windSnapshots).toHaveLength(1);
    db.close();
  });

  it('returns null race when raceId not found', async () => {
    const db = await openDB();
    const data = await exportRace(db, 'nonexistent');
    expect(data.race).toBeNull();
    expect(data.boatStates).toEqual([]);
    db.close();
  });
});

describe('cleanup', () => {
  it('removes records older than maxAgeDays', async () => {
    const db = await openDB();
    const now = Date.now();
    const oldTimestamp = now - 31 * 24 * 60 * 60 * 1000; // 31 days ago
    const recentTimestamp = now - 1 * 24 * 60 * 60 * 1000; // 1 day ago

    await saveBoatState(db, { raceId: 'r1', timestamp: oldTimestamp });
    await saveBoatState(db, { raceId: 'r1', timestamp: recentTimestamp });
    await saveAction(db, { type: 'heading', timestamp: oldTimestamp });
    await saveAction(db, { type: 'sail', timestamp: recentTimestamp });

    await cleanup(db, 30);

    // Old records should be gone, recent ones remain
    const boats = await getBoatHistory(db, 'r1');
    expect(boats).toHaveLength(1);
    expect(boats[0].timestamp).toBe(recentTimestamp);

    const actions = await new Promise((resolve, reject) => {
      const tx = db.transaction('actions', 'readonly');
      const req = tx.objectStore('actions').getAll();
      req.onsuccess = () => resolve(req.result);
      req.onerror = (e) => reject(e.target.error);
    });
    expect(actions).toHaveLength(1);
    expect(actions[0].type).toBe('sail');
    db.close();
  });
});
