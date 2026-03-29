import { describe, it, expect, beforeEach } from 'vitest';
import {
  createLogger,
  getLogs,
  clearLogs,
  setLogLevel,
  LogLevel,
} from '../telemetry.js';

describe('telemetry', () => {
  beforeEach(() => {
    clearLogs();
    setLogLevel(LogLevel.DEBUG);
  });

  describe('createLogger', () => {
    it('produces correctly shaped log entries', () => {
      const log = createLogger('test');
      log.info('hello', { foo: 'bar' });

      const logs = getLogs();
      expect(logs).toHaveLength(1);
      expect(logs[0]).toMatchObject({
        level: LogLevel.INFO,
        logger: 'test',
        message: 'hello',
        data: { foo: 'bar' },
      });
      expect(typeof logs[0].timestamp).toBe('number');
    });

    it('creates entries at all levels', () => {
      const log = createLogger('multi');
      log.debug('d');
      log.info('i');
      log.warn('w');
      log.error('e');

      const logs = getLogs();
      expect(logs).toHaveLength(4);
      expect(logs[0].level).toBe(LogLevel.DEBUG);
      expect(logs[1].level).toBe(LogLevel.INFO);
      expect(logs[2].level).toBe(LogLevel.WARN);
      expect(logs[3].level).toBe(LogLevel.ERROR);
    });

    it('handles entries without data', () => {
      const log = createLogger('nodata');
      log.info('just a message');

      const logs = getLogs();
      expect(logs[0].data).toBeUndefined();
    });
  });

  describe('ring buffer', () => {
    it('caps at 500 entries', () => {
      const log = createLogger('buf');
      for (let i = 0; i < 550; i++) {
        log.debug(`msg ${i}`);
      }

      const logs = getLogs();
      expect(logs).toHaveLength(500);
      // Oldest entries should have been evicted; first entry should be msg 50
      expect(logs[0].message).toBe('msg 50');
      expect(logs[499].message).toBe('msg 549');
    });
  });

  describe('getLogs', () => {
    it('returns all logs when no level filter', () => {
      const log = createLogger('filter');
      log.debug('d');
      log.info('i');
      log.warn('w');

      expect(getLogs()).toHaveLength(3);
    });

    it('filters by minimum level', () => {
      const log = createLogger('filter');
      log.debug('d');
      log.info('i');
      log.warn('w');
      log.error('e');

      const warns = getLogs(LogLevel.WARN);
      expect(warns).toHaveLength(2);
      expect(warns[0].level).toBe(LogLevel.WARN);
      expect(warns[1].level).toBe(LogLevel.ERROR);
    });
  });

  describe('clearLogs', () => {
    it('empties the buffer', () => {
      const log = createLogger('clear');
      log.info('a');
      log.info('b');
      expect(getLogs()).toHaveLength(2);

      clearLogs();
      expect(getLogs()).toHaveLength(0);
    });
  });

  describe('setLogLevel', () => {
    it('suppresses entries below the current level', () => {
      setLogLevel(LogLevel.WARN);
      const log = createLogger('level');
      log.debug('should not appear');
      log.info('should not appear');
      log.warn('should appear');
      log.error('should appear');

      const logs = getLogs();
      expect(logs).toHaveLength(2);
      expect(logs[0].level).toBe(LogLevel.WARN);
    });
  });

  describe('multiple loggers share the same buffer', () => {
    it('interleaves entries from different loggers', () => {
      const a = createLogger('a');
      const b = createLogger('b');
      a.info('from a');
      b.info('from b');

      const logs = getLogs();
      expect(logs).toHaveLength(2);
      expect(logs[0].logger).toBe('a');
      expect(logs[1].logger).toBe('b');
    });
  });
});
