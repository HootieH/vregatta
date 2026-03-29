import { describe, it, expect } from 'vitest';
import { classify } from '../classifier.js';
import {
  normalizeBoatState,
  normalizeCompetitor,
  normalizeRaceMeta,
  normalizeWindSnapshot,
  normalizeAction,
} from '../schemas/index.js';
import {
  mockBoatResponse,
  mockFleetResponse,
  mockRaceResponse,
  mockActionResponse,
  mockWindResponse,
  mockAuthResponse,
  mockUrls,
} from './mocks/vr-responses.js';

describe('classify → normalize integration', () => {
  it('boat: classifies and normalizes boat response', () => {
    const { type, data } = classify(mockUrls.boat, mockBoatResponse);
    expect(type).toBe('boat');

    const sd = data.scriptData;
    const normalized = normalizeBoatState(sd);
    expect(normalized).not.toBeNull();
    expect(normalized.lat).toBe(48.8566);
    expect(normalized.lon).toBe(-5.3472);
    expect(normalized.speed).toBe(14.2);
    expect(normalized.heading).toBe(215);
    expect(normalized.twa).toBe(-42.7);
    expect(normalized.tws).toBe(18.3);
    expect(normalized.twd).toBe(257.3);
    expect(normalized.sail).toBe(5);
    expect(normalized.stamina).toBe(0.87);
    expect(normalized.distanceToEnd).toBe(2843.6);
    expect(normalized.aground).toBe(false);
    expect(normalized.isRegulated).toBe(false);
  });

  it('fleet: classifies and normalizes fleet response', () => {
    const { type, data } = classify(mockUrls.fleet, mockFleetResponse);
    expect(type).toBe('fleet');

    const items = Array.isArray(data) ? data : [];
    const normalized = items.map(normalizeCompetitor).filter(Boolean);
    expect(normalized).toHaveLength(3);

    expect(normalized[0].id).toBe('usr_001');
    expect(normalized[0].name).toBe('SailorAlice');
    expect(normalized[0].lat).toBe(48.92);
    expect(normalized[0].rank).toBe(1);
    expect(normalized[0].country).toBe('FR');

    expect(normalized[2].playerType).toBe('bot');
  });

  it('race: classifies and normalizes race response', () => {
    const { type, data } = classify(mockUrls.race, mockRaceResponse);
    expect(type).toBe('race');

    const legs = data.scriptData.currentLegs;
    const normalized = normalizeRaceMeta(legs[0]);
    expect(normalized).not.toBeNull();
    expect(normalized.raceId).toBe('vendee-2024-leg1');
    expect(normalized.legNum).toBe(1);
    expect(normalized.name).toBe('Vendee Globe 2024');
    expect(normalized.polarId).toBe('imoca60_2023');
    expect(normalized.playerCount).toBe(154302);
  });

  it('action: classifies and normalizes action response', () => {
    const { type, data } = classify(mockUrls.action, mockActionResponse);
    expect(type).toBe('action');

    const normalized = normalizeAction(data);
    expect(normalized).not.toBeNull();
    expect(normalized.type).toBe('heading');
    expect(normalized.value).toBe(225);
    expect(normalized.autoTwa).toBe(true);
    expect(normalized.timestamp).toBe(1711700100000);
  });

  it('wind: classifies and normalizes wind response', () => {
    const { type, data } = classify(mockUrls.wind, mockWindResponse);
    expect(type).toBe('wind');

    const normalized = normalizeWindSnapshot(data);
    expect(normalized).not.toBeNull();
    expect(normalized.fileUrl).toContain('winds/live');
    expect(normalized.gridResolution).toBe(0.25);
    expect(normalized.timestamp).toBe(1711695600000);
  });

  it('auth: classifies auth response (no normalizer needed)', () => {
    const { type, data } = classify(mockUrls.auth, mockAuthResponse);
    expect(type).toBe('auth');
    expect(data.authToken).toBeDefined();
  });

  it('unknown: garbage input classifies as unknown, normalizers return null', () => {
    const { type } = classify('https://example.com/random', { foo: 'bar', baz: 123 });
    expect(type).toBe('unknown');

    expect(normalizeBoatState({ foo: 'bar' })).toBeNull();
    expect(normalizeCompetitor({ foo: 'bar' })).toBeNull();
    expect(normalizeRaceMeta({ foo: 'bar' })).toBeNull();
    expect(normalizeWindSnapshot({ foo: 'bar' })).toBeNull();
    expect(normalizeAction({ foo: 'bar' })).toBeNull();
  });

  it('unknown: null inputs classify as unknown', () => {
    const { type } = classify(null, null);
    expect(type).toBe('unknown');
  });
});
