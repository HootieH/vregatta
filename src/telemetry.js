export const LogLevel = { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3 };

const LEVEL_NAMES = ['DEBUG', 'INFO', 'WARN', 'ERROR'];
const MAX_ENTRIES = 500;

let currentLevel = LogLevel.INFO;
const buffer = [];

export function setLogLevel(level) {
  currentLevel = level;
}

export function getLogLevel() {
  return currentLevel;
}

export function getLogs(level) {
  if (level == null) return buffer.slice();
  return buffer.filter((e) => e.level >= level);
}

export function clearLogs() {
  buffer.length = 0;
}

function addEntry(entry) {
  buffer.push(entry);
  if (buffer.length > MAX_ENTRIES) {
    buffer.shift();
  }
}

export function createLogger(name) {
  function log(level, message, data) {
    if (level < currentLevel) return;

    const entry = {
      timestamp: Date.now(),
      level,
      logger: name,
      message,
      data,
    };

    addEntry(entry);

    const prefix = `[vRegatta:${name}]`;
    const levelName = LEVEL_NAMES[level] || 'LOG';

    if (level >= LogLevel.ERROR) {
      console.error(prefix, `[${levelName}]`, message, data !== undefined ? data : '');
    } else if (level >= LogLevel.WARN) {
      console.warn(prefix, `[${levelName}]`, message, data !== undefined ? data : '');
    } else {
      console.log(prefix, `[${levelName}]`, message, data !== undefined ? data : '');
    }
  }

  return {
    debug: (message, data) => log(LogLevel.DEBUG, message, data),
    info: (message, data) => log(LogLevel.INFO, message, data),
    warn: (message, data) => log(LogLevel.WARN, message, data),
    error: (message, data) => log(LogLevel.ERROR, message, data),
  };
}
