const DB_NAME = 'vregatta';
const DB_VERSION = 2;

/**
 * Opens the vregatta IndexedDB database, creating object stores on first run.
 * @returns {Promise<IDBDatabase>}
 */
export function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;

      if (event.oldVersion < 1) {
        // boatStates: autoIncrement, indexes on timestamp and raceId
        const boatStore = db.createObjectStore('boatStates', { autoIncrement: true });
        boatStore.createIndex('timestamp', 'timestamp', { unique: false });
        boatStore.createIndex('raceId', 'raceId', { unique: false });

        // competitors: autoIncrement, indexes on raceId and timestamp
        const compStore = db.createObjectStore('competitors', { autoIncrement: true });
        compStore.createIndex('raceId', 'raceId', { unique: false });
        compStore.createIndex('timestamp', 'timestamp', { unique: false });

        // races: keyPath raceId
        db.createObjectStore('races', { keyPath: 'raceId' });

        // actions: autoIncrement, index on timestamp
        const actionStore = db.createObjectStore('actions', { autoIncrement: true });
        actionStore.createIndex('timestamp', 'timestamp', { unique: false });

        // windSnapshots: autoIncrement, index on timestamp
        const windStore = db.createObjectStore('windSnapshots', { autoIncrement: true });
        windStore.createIndex('timestamp', 'timestamp', { unique: false });
      }

      if (event.oldVersion < 2) {
        // polars: keyed by _id
        db.createObjectStore('polars', { keyPath: '_id' });
      }
    };

    request.onsuccess = (event) => resolve(event.target.result);
    request.onerror = (event) => reject(event.target.error);
  });
}

/**
 * Saves a normalized boat state into the boatStates store.
 */
export function saveBoatState(db, boatState) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('boatStates', 'readwrite');
    const store = tx.objectStore('boatStates');
    const request = store.add(boatState);
    request.onsuccess = () => resolve(request.result);
    request.onerror = (event) => reject(event.target.error);
  });
}

/**
 * Batch-saves competitors, adding raceId and timestamp to each record.
 */
export function saveCompetitors(db, raceId, timestamp, competitors) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('competitors', 'readwrite');
    const store = tx.objectStore('competitors');
    for (const comp of competitors) {
      store.add({ ...comp, raceId, timestamp });
    }
    tx.oncomplete = () => resolve();
    tx.onerror = (event) => reject(event.target.error);
  });
}

/**
 * Upserts race metadata into the races store (keyed by raceId).
 */
export function saveRace(db, raceMeta) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('races', 'readwrite');
    const store = tx.objectStore('races');
    const request = store.put(raceMeta);
    request.onsuccess = () => resolve(request.result);
    request.onerror = (event) => reject(event.target.error);
  });
}

/**
 * Saves an action record into the actions store.
 */
export function saveAction(db, action) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('actions', 'readwrite');
    const store = tx.objectStore('actions');
    const request = store.add(action);
    request.onsuccess = () => resolve(request.result);
    request.onerror = (event) => reject(event.target.error);
  });
}

/**
 * Saves a wind snapshot into the windSnapshots store.
 */
export function saveWindSnapshot(db, snapshot) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('windSnapshots', 'readwrite');
    const store = tx.objectStore('windSnapshots');
    const request = store.add(snapshot);
    request.onsuccess = () => resolve(request.result);
    request.onerror = (event) => reject(event.target.error);
  });
}

/**
 * Saves (upserts) a polar into the polars store.
 */
export function savePolar(db, polar) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('polars', 'readwrite');
    const store = tx.objectStore('polars');
    const request = store.put(polar);
    request.onsuccess = () => resolve(request.result);
    request.onerror = (event) => reject(event.target.error);
  });
}

/**
 * Retrieves a polar by its _id.
 */
export function getPolar(db, polarId) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('polars', 'readonly');
    const store = tx.objectStore('polars');
    const request = store.get(polarId);
    request.onsuccess = () => resolve(request.result ?? null);
    request.onerror = (event) => reject(event.target.error);
  });
}

/**
 * Returns boat states for a given raceId, ordered by timestamp descending.
 * @param {IDBDatabase} db
 * @param {string} raceId
 * @param {number} [limit] - optional max number of results
 * @returns {Promise<object[]>}
 */
export function getBoatHistory(db, raceId, limit) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('boatStates', 'readonly');
    const store = tx.objectStore('boatStates');
    const index = store.index('raceId');
    const request = index.getAll(raceId);

    request.onsuccess = () => {
      let results = request.result;
      // Sort by timestamp descending
      results.sort((a, b) => b.timestamp - a.timestamp);
      if (limit != null && limit > 0) {
        results = results.slice(0, limit);
      }
      resolve(results);
    };
    request.onerror = (event) => reject(event.target.error);
  });
}

/**
 * Exports all data for a given raceId.
 * @returns {Promise<{race, boatStates, competitors, actions, windSnapshots}>}
 */
export function exportRace(db, raceId) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(
      ['races', 'boatStates', 'competitors', 'actions', 'windSnapshots'],
      'readonly'
    );

    const result = {
      race: null,
      boatStates: [],
      competitors: [],
      actions: [],
      windSnapshots: [],
    };

    // Get race meta
    const raceReq = tx.objectStore('races').get(raceId);
    raceReq.onsuccess = () => {
      result.race = raceReq.result ?? null;
    };

    // Get boat states by raceId index
    const boatReq = tx.objectStore('boatStates').index('raceId').getAll(raceId);
    boatReq.onsuccess = () => {
      result.boatStates = boatReq.result;
    };

    // Get competitors by raceId index
    const compReq = tx.objectStore('competitors').index('raceId').getAll(raceId);
    compReq.onsuccess = () => {
      result.competitors = compReq.result;
    };

    // Actions and windSnapshots don't have raceId — return all
    const actionReq = tx.objectStore('actions').getAll();
    actionReq.onsuccess = () => {
      result.actions = actionReq.result;
    };

    const windReq = tx.objectStore('windSnapshots').getAll();
    windReq.onsuccess = () => {
      result.windSnapshots = windReq.result;
    };

    tx.oncomplete = () => resolve(result);
    tx.onerror = (event) => reject(event.target.error);
  });
}

/**
 * Deletes records older than maxAgeDays across all timestamped stores.
 */
export function cleanup(db, maxAgeDays) {
  const cutoff = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000;
  const storeNames = ['boatStates', 'competitors', 'actions', 'windSnapshots'];

  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeNames, 'readwrite');

    for (const storeName of storeNames) {
      const store = tx.objectStore(storeName);
      const index = store.index('timestamp');
      const range = IDBKeyRange.upperBound(cutoff, true);
      const cursorReq = index.openCursor(range);

      cursorReq.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) {
          cursor.delete();
          cursor.continue();
        }
      };
    }

    tx.oncomplete = () => resolve();
    tx.onerror = (event) => reject(event.target.error);
  });
}
