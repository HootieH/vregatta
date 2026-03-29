import { describe, it, expect } from 'vitest';
import { classify } from '../classifier.js';

describe('classify', () => {
  it('classifies auth by URL', () => {
    const result = classify(
      'https://prod.vro.sparks.virtualregatta.com/AuthenticationRequest',
      { token: 'abc' },
    );
    expect(result.type).toBe('auth');
  });

  it('classifies wind by URL', () => {
    const result = classify(
      'https://static.virtualregatta.com/winds/live/20260329_12.wnd',
      null,
    );
    expect(result.type).toBe('wind');
  });

  it('classifies ranking by URL', () => {
    const result = classify(
      'https://vro-api-ranking.prod.virtualregatta.com/ranking/leg1',
      { data: [] },
    );
    expect(result.type).toBe('ranking');
  });

  it('classifies ranking by scriptData.rankings', () => {
    const result = classify(
      'https://prod.vro.sparks.virtualregatta.com/LogEventRequest',
      { scriptData: { rankings: [{ rank: 1 }] } },
    );
    expect(result.type).toBe('ranking');
  });

  it('classifies action by eventKey', () => {
    const result = classify(
      'https://prod.vro.sparks.virtualregatta.com/LogEventRequest',
      { eventKey: 'Game_AddBoatAction', scriptData: { value: 180 } },
    );
    expect(result.type).toBe('action');
  });

  it('classifies boat by scriptData with boat fields', () => {
    const result = classify(
      'https://prod.vro.sparks.virtualregatta.com/LogEventRequest',
      { scriptData: { pos: { lat: 48.5, lon: -5.1 }, speed: 12.3, heading: 220 } },
    );
    expect(result.type).toBe('boat');
  });

  it('classifies race by scriptData.currentLegs', () => {
    const result = classify(
      'https://prod.vro.sparks.virtualregatta.com/LogEventRequest',
      { scriptData: { currentLegs: [{ legId: 1, name: 'Vendee Globe' }] } },
    );
    expect(result.type).toBe('race');
  });

  it('classifies fleet from array of competitor objects', () => {
    const result = classify(
      'https://prod.vro.sparks.virtualregatta.com/LogEventRequest',
      [
        { pos: { lat: 48, lon: -5 }, displayName: 'Sailor1', rank: 1 },
        { pos: { lat: 47, lon: -6 }, displayName: 'Sailor2', rank: 2 },
      ],
    );
    expect(result.type).toBe('fleet');
  });

  it('returns unknown for unrecognized payload', () => {
    const result = classify(
      'https://example.com/something',
      { foo: 'bar' },
    );
    expect(result.type).toBe('unknown');
  });

  it('returns unknown for null url and null body', () => {
    const result = classify(null, null);
    expect(result.type).toBe('unknown');
  });

  it('preserves body in data field', () => {
    const body = { scriptData: { pos: { lat: 1, lon: 2 } } };
    const result = classify('https://prod.vro.sparks.virtualregatta.com/x', body);
    expect(result.data).toBe(body);
  });
});
