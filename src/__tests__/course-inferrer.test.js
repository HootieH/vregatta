import { describe, it, expect, beforeEach } from 'vitest';
import { CourseInferrer } from '../colyseus/course-inferrer.js';

describe('CourseInferrer', () => {
  let ci;

  beforeEach(() => {
    ci = new CourseInferrer();
  });

  describe('addCrossing + getMarks', () => {
    it('returns empty marks initially', () => {
      expect(ci.getMarks()).toEqual([]);
    });

    it('records a single mark crossing', () => {
      ci.addCrossing(0, 45, 100, 200, 90, 1000);
      const marks = ci.getMarks();
      expect(marks).toHaveLength(1);
      expect(marks[0].id).toBe(0);
      expect(marks[0].x).toBe(100);
      expect(marks[0].y).toBe(200);
      expect(marks[0].crossingCount).toBe(1);
      expect(marks[0].label).toBe('Windward Port');
    });

    it('averages multiple crossings with newer weight', () => {
      ci.addCrossing(1, 30, 100, 200, 0, 1);
      ci.addCrossing(1, 35, 200, 400, 0, 2);
      const marks = ci.getMarks();
      expect(marks).toHaveLength(1);
      // Weighted avg: (100*1 + 200*2)/3 = 500/3 ≈ 166.67
      expect(marks[0].x).toBeCloseTo(166.67, 0);
      // (200*1 + 400*2)/3 = 1000/3 ≈ 333.33
      expect(marks[0].y).toBeCloseTo(333.33, 0);
      expect(marks[0].crossingCount).toBe(2);
    });

    it('mark 2 with 2 far-apart crossings creates 2 endpoints (start line)', () => {
      ci.addCrossing(2, NaN, 1000, 2000, 0, 1);
      ci.addCrossing(2, NaN, 1000, 2500, 180, 2);
      const marks = ci.getMarks();
      const mark2s = marks.filter(m => m.id === 2);
      expect(mark2s).toHaveLength(2);
      expect(mark2s[0].x).toBe(1000);
      expect(mark2s[0].y).toBe(2000);
      expect(mark2s[1].x).toBe(1000);
      expect(mark2s[1].y).toBe(2500);
    });

    it('mark 2 with 2 close crossings keeps only 1 mark', () => {
      ci.addCrossing(2, NaN, 1000, 2000, 0, 1);
      ci.addCrossing(2, NaN, 1010, 2010, 180, 2);
      const marks = ci.getMarks();
      const mark2s = marks.filter(m => m.id === 2);
      // Distance < 50, so only one endpoint
      expect(mark2s).toHaveLength(1);
    });

    it('ignores crossings with null position', () => {
      ci.addCrossing(0, 45, null, null, 0, 1);
      expect(ci.getMarks()).toHaveLength(0);
    });
  });

  describe('getCourse', () => {
    it('returns empty course initially', () => {
      const course = ci.getCourse();
      expect(course.startLine).toBeNull();
      expect(course.windwardGate).toBeNull();
      expect(course.courseAxis).toBe(0);
      expect(course.courseLength).toBe(0);
    });

    it('returns start line from mark 2 crossings', () => {
      ci.addCrossing(2, NaN, 1000, 500, 0, 1);
      ci.addCrossing(2, NaN, 1000, 800, 180, 2);
      const course = ci.getCourse();
      expect(course.startLine).not.toBeNull();
      expect(course.startLine.x1).toBe(1000);
      expect(course.startLine.y1).toBe(500);
      expect(course.startLine.x2).toBe(1000);
      expect(course.startLine.y2).toBe(800);
    });

    it('returns windward gate from marks 0 and 1', () => {
      ci.addCrossing(0, 45, 5000, 1000, 0, 1);
      ci.addCrossing(1, -45, 5000, 1200, 0, 2);
      const course = ci.getCourse();
      expect(course.windwardGate).not.toBeNull();
      expect(course.windwardGate.port.x).toBe(5000);
      expect(course.windwardGate.port.y).toBe(1000);
      expect(course.windwardGate.stbd.x).toBe(5000);
      expect(course.windwardGate.stbd.y).toBe(1200);
    });

    it('computes course axis and length', () => {
      // Start at (1000, 500+800)/2 = (1000, 650)
      ci.addCrossing(2, NaN, 1000, 500, 0, 1);
      ci.addCrossing(2, NaN, 1000, 800, 180, 2);
      // Windward gate center at (5000, (1000+1200)/2) = (5000, 1100)
      ci.addCrossing(0, 45, 5000, 1000, 0, 3);
      ci.addCrossing(1, -45, 5000, 1200, 0, 4);

      const course = ci.getCourse();
      expect(course.courseLength).toBeGreaterThan(4000);
      // Axis should point roughly north-east-ish from (1000,650) to (5000,1100)
      expect(course.courseAxis).toBeGreaterThan(0);
      expect(course.courseAxis).toBeLessThan(90);
    });
  });

  describe('getLaylines', () => {
    it('returns null with no marks', () => {
      expect(ci.getLaylines(180)).toBeNull();
    });

    it('computes laylines from windward gate and wind direction', () => {
      ci.addCrossing(0, 45, 5000, 1000, 0, 1);
      ci.addCrossing(1, -45, 5000, 1200, 0, 2);

      const laylines = ci.getLaylines(180); // wind from south
      expect(laylines).not.toBeNull();
      expect(laylines.port).toBeDefined();
      expect(laylines.stbd).toBeDefined();

      // Port layline heading: 180 + 180 - 45 = 315
      expect(laylines.port.heading).toBeCloseTo(315, 0);
      // Stbd layline heading: 180 + 180 + 45 = 405 % 360 = 45
      expect(laylines.stbd.heading).toBeCloseTo(45, 0);

      // Lines start from gate center
      const gateCenter = { x: 5000, y: 1100 };
      expect(laylines.port.line[0].x).toBeCloseTo(gateCenter.x, 0);
      expect(laylines.port.line[0].y).toBeCloseTo(gateCenter.y, 0);
      expect(laylines.stbd.line[0].x).toBeCloseTo(gateCenter.x, 0);
      expect(laylines.stbd.line[0].y).toBeCloseTo(gateCenter.y, 0);

      // Lines should extend outward
      expect(laylines.port.line[1].x).not.toBe(laylines.port.line[0].x);
      expect(laylines.stbd.line[1].x).not.toBe(laylines.stbd.line[0].x);
    });

    it('uses course length for layline extent', () => {
      // Add start and gate for course length
      ci.addCrossing(2, NaN, 1000, 500, 0, 1);
      ci.addCrossing(2, NaN, 1000, 800, 180, 2);
      ci.addCrossing(0, 45, 5000, 1000, 0, 3);
      ci.addCrossing(1, -45, 5000, 1200, 0, 4);

      const laylines = ci.getLaylines(180);
      const lineLen = Math.hypot(
        laylines.port.line[1].x - laylines.port.line[0].x,
        laylines.port.line[1].y - laylines.port.line[0].y,
      );
      // Should be approximately the course length
      const course = ci.getCourse();
      expect(lineLen).toBeCloseTo(course.courseLength, -1);
    });
  });

  describe('reset', () => {
    it('clears all crossing data', () => {
      ci.addCrossing(0, 45, 100, 200, 0, 1);
      ci.addCrossing(2, NaN, 300, 400, 0, 2);
      expect(ci.getMarks().length).toBeGreaterThan(0);
      ci.reset();
      expect(ci.getMarks()).toEqual([]);
      expect(ci.getCourse().startLine).toBeNull();
    });
  });
});
