import { describe, it, expect } from 'vitest';
import {
  normalizeBoatState,
  normalizeCompetitor,
  normalizeRaceMeta,
  normalizeWindSnapshot,
  normalizeAction,
} from '../schemas/index.js';

describe('normalizeBoatState', () => {
  it('extracts all fields from full data', () => {
    const raw = {
      pos: { lat: 48.8566, lon: 2.3522 },
      speed: 12.5,
      heading: 180,
      twa: -45.3,
      tws: 15.2,
      twd: 225,
      sail: 2,
      stamina: 0.95,
      distanceToEnd: 1234.5,
      aground: false,
      lastCalcDate: 1700000000,
      isRegulated: false,
      timestamp: 1700000000,
    };
    const result = normalizeBoatState(raw);
    expect(result).toEqual({
      lat: 48.8566,
      lon: 2.3522,
      speed: 12.5,
      heading: 180,
      twa: -45.3,
      tws: 15.2,
      twd: 225,
      sail: 2,
      stamina: 0.95,
      distanceToEnd: 1234.5,
      aground: false,
      lastCalcDate: 1700000000,
      isRegulated: false,
      timestamp: 1700000000,
    });
  });

  it('works with minimal data (only lat/lon)', () => {
    const raw = { pos: { lat: 10, lon: 20 } };
    const result = normalizeBoatState(raw);
    expect(result).not.toBeNull();
    expect(result.lat).toBe(10);
    expect(result.lon).toBe(20);
    expect(result.speed).toBeNull();
    expect(result.sail).toBeNull();
  });

  it('returns null for garbage input', () => {
    expect(normalizeBoatState(null)).toBeNull();
    expect(normalizeBoatState(undefined)).toBeNull();
    expect(normalizeBoatState('string')).toBeNull();
    expect(normalizeBoatState(42)).toBeNull();
    expect(normalizeBoatState({})).toBeNull();
    expect(normalizeBoatState({ pos: {} })).toBeNull();
    expect(normalizeBoatState({ pos: { lat: 10 } })).toBeNull();
  });
});

describe('normalizeCompetitor', () => {
  it('extracts all fields from full data', () => {
    const raw = {
      id: 'abc123',
      displayName: 'Sailor1',
      pos: { lat: 48.0, lon: 2.0 },
      speed: 10,
      heading: 90,
      twa: 60,
      sail: 1,
      rank: 5,
      dtf: 500,
      dtl: 50,
      country: 'FR',
      playerType: 'real',
    };
    const result = normalizeCompetitor(raw);
    expect(result).toEqual({
      id: 'abc123',
      name: 'Sailor1',
      lat: 48.0,
      lon: 2.0,
      speed: 10,
      heading: 90,
      twa: 60,
      sail: 1,
      rank: 5,
      dtf: 500,
      dtl: 50,
      country: 'FR',
      playerType: 'real',
    });
  });

  it('works with minimal data (only id)', () => {
    const raw = { id: 'xyz' };
    const result = normalizeCompetitor(raw);
    expect(result).not.toBeNull();
    expect(result.id).toBe('xyz');
    expect(result.name).toBeNull();
    expect(result.lat).toBeNull();
  });

  it('returns null for garbage input', () => {
    expect(normalizeCompetitor(null)).toBeNull();
    expect(normalizeCompetitor(undefined)).toBeNull();
    expect(normalizeCompetitor('string')).toBeNull();
    expect(normalizeCompetitor({})).toBeNull();
  });
});

describe('normalizeRaceMeta', () => {
  it('extracts all fields from full data', () => {
    const raw = {
      raceId: 'race1',
      legNum: 3,
      name: 'Vendee Globe',
      polarId: 'imoca60',
      startDate: '2024-01-01',
      endDate: '2024-03-01',
      playerCount: 150000,
    };
    const result = normalizeRaceMeta(raw);
    expect(result).toEqual({
      raceId: 'race1',
      legNum: 3,
      name: 'Vendee Globe',
      polarId: 'imoca60',
      startDate: '2024-01-01',
      endDate: '2024-03-01',
      playerCount: 150000,
    });
  });

  it('falls back to legId or _id for raceId', () => {
    expect(normalizeRaceMeta({ legId: 'leg1' }).raceId).toBe('leg1');
    expect(normalizeRaceMeta({ _id: 'id1' }).raceId).toBe('id1');
  });

  it('works with minimal data (only raceId)', () => {
    const raw = { raceId: 'r1' };
    const result = normalizeRaceMeta(raw);
    expect(result).not.toBeNull();
    expect(result.raceId).toBe('r1');
    expect(result.name).toBeNull();
  });

  it('returns null for garbage input', () => {
    expect(normalizeRaceMeta(null)).toBeNull();
    expect(normalizeRaceMeta(undefined)).toBeNull();
    expect(normalizeRaceMeta('string')).toBeNull();
    expect(normalizeRaceMeta({})).toBeNull();
  });
});

describe('normalizeWindSnapshot', () => {
  it('extracts all fields from full data', () => {
    const raw = {
      timestamp: 1700000000,
      fileUrl: 'https://static.virtualregatta.com/winds/live/20240101.wnd',
      gridResolution: 0.5,
    };
    const result = normalizeWindSnapshot(raw);
    expect(result).toEqual({
      timestamp: 1700000000,
      fileUrl: 'https://static.virtualregatta.com/winds/live/20240101.wnd',
      gridResolution: 0.5,
    });
  });

  it('falls back to url and resolution fields', () => {
    const raw = { url: 'https://example.com/wind.wnd', resolution: 1.0 };
    const result = normalizeWindSnapshot(raw);
    expect(result.fileUrl).toBe('https://example.com/wind.wnd');
    expect(result.gridResolution).toBe(1.0);
  });

  it('works with minimal data (only fileUrl)', () => {
    const raw = { fileUrl: 'https://example.com/wind.wnd' };
    const result = normalizeWindSnapshot(raw);
    expect(result).not.toBeNull();
    expect(result.fileUrl).toBe('https://example.com/wind.wnd');
    expect(result.gridResolution).toBeNull();
  });

  it('returns null for garbage input', () => {
    expect(normalizeWindSnapshot(null)).toBeNull();
    expect(normalizeWindSnapshot(undefined)).toBeNull();
    expect(normalizeWindSnapshot('string')).toBeNull();
    expect(normalizeWindSnapshot({})).toBeNull();
  });
});

describe('normalizeAction', () => {
  it('extracts all fields from full data', () => {
    const raw = {
      timestamp: 1700000000,
      type: 'heading',
      value: 180,
      autoTwa: true,
    };
    const result = normalizeAction(raw);
    expect(result).toEqual({
      timestamp: 1700000000,
      type: 'heading',
      value: 180,
      autoTwa: true,
    });
  });

  it('works with minimal data (only type)', () => {
    const raw = { type: 'sail' };
    const result = normalizeAction(raw);
    expect(result).not.toBeNull();
    expect(result.type).toBe('sail');
    expect(result.value).toBeNull();
    expect(result.autoTwa).toBeNull();
  });

  it('returns null for garbage input', () => {
    expect(normalizeAction(null)).toBeNull();
    expect(normalizeAction(undefined)).toBeNull();
    expect(normalizeAction('string')).toBeNull();
    expect(normalizeAction({})).toBeNull();
  });
});
