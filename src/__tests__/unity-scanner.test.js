import { describe, it, expect } from 'vitest';
import {
  scanFloat32Coords,
  scanInt16Coords,
  clusterCandidates,
  scanForStrings,
  findUnityModule,
  tryUnityQuery,
} from '../unity-scanner.js';

describe('unity-scanner', () => {
  describe('scanFloat32Coords', () => {
    it('finds coordinate pairs in range', () => {
      const f32 = new Float32Array([0, 0, 15000, 12000, 0, 0, 0]);
      const buffer = new Uint8Array(f32.buffer);
      const results = scanFloat32Coords(buffer, []);
      expect(results.length).toBeGreaterThan(0);
      const match = results.find(r => Math.abs(r.x - 15000) < 1 && Math.abs(r.y - 12000) < 1);
      expect(match).toBeDefined();
      expect(match.format).toBe('float32');
    });

    it('excludes values outside coordinate range', () => {
      const f32 = new Float32Array([1, 2, 100, 200, 50000, 60000]);
      const buffer = new Uint8Array(f32.buffer);
      const results = scanFloat32Coords(buffer, []);
      expect(results).toHaveLength(0);
    });

    it('excludes known boat positions', () => {
      const f32 = new Float32Array([15000, 12000, 0]);
      const buffer = new Uint8Array(f32.buffer);
      const boats = [{ x: 15000, y: 12000 }];
      const results = scanFloat32Coords(buffer, boats);
      expect(results).toHaveLength(0);
    });

    it('keeps coords far from known boats', () => {
      const f32 = new Float32Array([15000, 12000, 0, 20000, 14000, 0]);
      const buffer = new Uint8Array(f32.buffer);
      const boats = [{ x: 15000, y: 12000 }];
      const results = scanFloat32Coords(buffer, boats);
      const match = results.find(r => Math.abs(r.x - 20000) < 1 && Math.abs(r.y - 14000) < 1);
      expect(match).toBeDefined();
    });

    it('handles empty buffer', () => {
      const buffer = new Uint8Array(0);
      const results = scanFloat32Coords(buffer, []);
      expect(results).toHaveLength(0);
    });

    it('respects maxCandidates option', () => {
      // Create a buffer with many matching pairs
      const values = [];
      for (let i = 0; i < 100; i++) {
        values.push(10000 + i, 11000 + i, 0);
      }
      const f32 = new Float32Array(values);
      const buffer = new Uint8Array(f32.buffer);
      const results = scanFloat32Coords(buffer, [], { maxCandidates: 5 });
      expect(results.length).toBeLessThanOrEqual(5);
    });

    it('skips non-finite values', () => {
      const f32 = new Float32Array([NaN, 12000, 0, Infinity, 15000, 0]);
      const buffer = new Uint8Array(f32.buffer);
      const results = scanFloat32Coords(buffer, []);
      expect(results.filter(r => !Number.isFinite(r.x))).toHaveLength(0);
    });
  });

  describe('scanInt16Coords', () => {
    it('finds int16 coordinate pairs in range', () => {
      const i16 = new Int16Array([0, 0, 15000, 12000, 0, 0]);
      const buffer = new Uint8Array(i16.buffer);
      const results = scanInt16Coords(buffer, []);
      const match = results.find(r => r.x === 15000 && r.y === 12000);
      expect(match).toBeDefined();
      expect(match.format).toBe('int16');
    });

    it('excludes values outside range', () => {
      const i16 = new Int16Array([100, 200, -5000, 3000]);
      const buffer = new Uint8Array(i16.buffer);
      const results = scanInt16Coords(buffer, []);
      expect(results).toHaveLength(0);
    });

    it('excludes known boat positions', () => {
      const i16 = new Int16Array([15000, 12000]);
      const buffer = new Uint8Array(i16.buffer);
      const boats = [{ x: 15050, y: 12050 }];
      const results = scanInt16Coords(buffer, boats);
      expect(results).toHaveLength(0);
    });

    it('handles empty buffer', () => {
      const buffer = new Uint8Array(0);
      const results = scanInt16Coords(buffer, []);
      expect(results).toHaveLength(0);
    });
  });

  describe('clusterCandidates', () => {
    it('clusters nearby points', () => {
      const candidates = [
        { x: 15000, y: 12000, offset: 0 },
        { x: 15010, y: 12005, offset: 4 },
        { x: 15005, y: 12010, offset: 8 },
        { x: 20000, y: 14000, offset: 12 },
      ];
      const clusters = clusterCandidates(candidates, 100);
      expect(clusters).toHaveLength(2);
      // Larger cluster first
      expect(clusters[0].count).toBe(3);
      expect(clusters[1].count).toBe(1);
      // Average of the 3-point cluster
      expect(clusters[0].x).toBeCloseTo(15005, 0);
      expect(clusters[0].y).toBeCloseTo(12005, 0);
    });

    it('returns empty for empty input', () => {
      expect(clusterCandidates([], 100)).toHaveLength(0);
    });

    it('keeps distant points as separate clusters', () => {
      const candidates = [
        { x: 10000, y: 10000, offset: 0 },
        { x: 20000, y: 20000, offset: 4 },
      ];
      const clusters = clusterCandidates(candidates, 100);
      expect(clusters).toHaveLength(2);
      expect(clusters[0].count).toBe(1);
    });

    it('sorts by count descending', () => {
      const candidates = [
        { x: 20000, y: 14000, offset: 0 },
        { x: 15000, y: 12000, offset: 4 },
        { x: 15001, y: 12001, offset: 8 },
        { x: 15002, y: 12002, offset: 12 },
      ];
      const clusters = clusterCandidates(candidates, 100);
      expect(clusters[0].count).toBeGreaterThanOrEqual(clusters[clusters.length - 1].count);
    });
  });

  describe('scanForStrings', () => {
    it('finds search terms in heap', () => {
      const text = 'some data mark position here buoy gate finish';
      const encoder = new TextEncoder();
      const heap = encoder.encode(text);
      const results = scanForStrings(heap, ['mark', 'buoy', 'gate']);
      expect(results.length).toBe(3);
      expect(results.map(r => r.term)).toContain('mark');
      expect(results.map(r => r.term)).toContain('buoy');
      expect(results.map(r => r.term)).toContain('gate');
    });

    it('returns empty for no matches', () => {
      const encoder = new TextEncoder();
      const heap = encoder.encode('nothing interesting here');
      const results = scanForStrings(heap, ['mark', 'buoy']);
      expect(results).toHaveLength(0);
    });

    it('handles null/empty inputs gracefully', () => {
      expect(scanForStrings(null, ['test'])).toHaveLength(0);
      expect(scanForStrings(new Uint8Array(0), [])).toHaveLength(0);
      expect(scanForStrings(new Uint8Array(0), null)).toHaveLength(0);
    });

    it('includes context around matches', () => {
      const text = 'XXXXX_course_data_XXXXX';
      const encoder = new TextEncoder();
      const heap = encoder.encode(text);
      const results = scanForStrings(heap, ['course']);
      expect(results).toHaveLength(1);
      expect(results[0].context).toContain('course');
      expect(results[0].offset).toBeGreaterThan(0);
    });
  });

  describe('findUnityModule', () => {
    it('returns null when no Unity module exists', () => {
      // In test env there is no Unity
      const result = findUnityModule();
      expect(result).toBeNull();
    });
  });

  describe('tryUnityQuery', () => {
    it('reports no SendMessage when instance is null', () => {
      const result = tryUnityQuery(null);
      expect(result.errors).toContain('No SendMessage available');
    });

    it('reports no SendMessage when instance has no SendMessage', () => {
      const result = tryUnityQuery({});
      expect(result.errors).toContain('No SendMessage available');
    });

    it('attempts SendMessage on known game object names', () => {
      const calls = [];
      const fakeInstance = {
        SendMessage: (name, method, param) => calls.push({ name, method, param }),
      };
      const result = tryUnityQuery(fakeInstance);
      expect(result.attempted.length).toBeGreaterThan(0);
      expect(calls.length).toBeGreaterThan(0);
      expect(result.attempted).toContain('GameManager');
      expect(result.attempted).toContain('CourseManager');
    });
  });
});
