import { describe, it, expect } from 'vitest';
import { getAllRules, getRule, getRandomRule, rules } from '../rules/rrs-database.js';

describe('rrs-database', () => {
  const requiredFields = [
    'number', 'title', 'shortText', 'fullText', 'explanation',
    'whenItApplies', 'whatToDo', 'commonMistakes', 'rrsUrl', 'section',
  ];

  it('has all expected rules', () => {
    const numbers = rules.map(r => r.number);
    expect(numbers).toContain('10');
    expect(numbers).toContain('11');
    expect(numbers).toContain('12');
    expect(numbers).toContain('13');
    expect(numbers).toContain('14');
    expect(numbers).toContain('15');
    expect(numbers).toContain('16');
    expect(numbers).toContain('17');
    expect(numbers).toContain('18');
    expect(numbers).toContain('19');
    expect(numbers).toContain('31');
    expect(rules.length).toBe(11);
  });

  it('every rule has all required fields', () => {
    for (const rule of rules) {
      for (const field of requiredFields) {
        expect(rule, `Rule ${rule.number} missing field: ${field}`).toHaveProperty(field);
      }
    }
  });

  it('no rule has empty text fields', () => {
    for (const rule of rules) {
      expect(rule.number.length, `Rule ${rule.number} number is empty`).toBeGreaterThan(0);
      expect(rule.title.length, `Rule ${rule.number} title is empty`).toBeGreaterThan(0);
      expect(rule.shortText.length, `Rule ${rule.number} shortText is empty`).toBeGreaterThan(0);
      expect(rule.fullText.length, `Rule ${rule.number} fullText is empty`).toBeGreaterThan(0);
      expect(rule.explanation.length, `Rule ${rule.number} explanation is empty`).toBeGreaterThan(0);
      expect(rule.whenItApplies.length, `Rule ${rule.number} whenItApplies is empty`).toBeGreaterThan(0);
      expect(rule.whatToDo.length, `Rule ${rule.number} whatToDo is empty`).toBeGreaterThan(0);
      expect(rule.rrsUrl.length, `Rule ${rule.number} rrsUrl is empty`).toBeGreaterThan(0);
      expect(rule.section.length, `Rule ${rule.number} section is empty`).toBeGreaterThan(0);
    }
  });

  it('commonMistakes is a non-empty array for every rule', () => {
    for (const rule of rules) {
      expect(Array.isArray(rule.commonMistakes), `Rule ${rule.number} commonMistakes is not an array`).toBe(true);
      expect(rule.commonMistakes.length, `Rule ${rule.number} commonMistakes is empty`).toBeGreaterThan(0);
      for (const mistake of rule.commonMistakes) {
        expect(typeof mistake).toBe('string');
        expect(mistake.length).toBeGreaterThan(0);
      }
    }
  });

  it('getRule returns correct rule by number', () => {
    const rule10 = getRule('10');
    expect(rule10).not.toBeNull();
    expect(rule10.title).toBe('On Opposite Tacks');

    const rule18 = getRule('18');
    expect(rule18).not.toBeNull();
    expect(rule18.title).toBe('Mark-Room');

    const rule31 = getRule('31');
    expect(rule31).not.toBeNull();
    expect(rule31.title).toBe('Touching a Mark');
  });

  it('getRule returns null for unknown rule', () => {
    expect(getRule('99')).toBeNull();
    expect(getRule('0')).toBeNull();
    expect(getRule('')).toBeNull();
  });

  it('getRule accepts numeric input', () => {
    const rule = getRule(10);
    expect(rule).not.toBeNull();
    expect(rule.number).toBe('10');
  });

  it('getAllRules returns the full array', () => {
    const all = getAllRules();
    expect(all.length).toBe(11);
    expect(all).toBe(rules);
  });

  it('getRandomRule returns a valid rule', () => {
    const rule = getRandomRule();
    expect(rule).not.toBeNull();
    expect(rule).toHaveProperty('number');
    expect(rule).toHaveProperty('title');
    expect(rules).toContain(rule);
  });

  it('explanations are verbose (at least 200 characters)', () => {
    for (const rule of rules) {
      expect(rule.explanation.length, `Rule ${rule.number} explanation too short`).toBeGreaterThan(200);
    }
  });

  it('all rrsUrls are valid URLs', () => {
    for (const rule of rules) {
      expect(rule.rrsUrl, `Rule ${rule.number} rrsUrl`).toMatch(/^https?:\/\//);
    }
  });
});
