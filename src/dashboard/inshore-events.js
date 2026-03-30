/**
 * Events panel for the Inshore dashboard.
 *
 * Displays recent race events: tacks, gybes, penalties, mark roundings,
 * and rule encounters. Renders as a list inside the rules sidebar.
 */

const MAX_EVENTS = 10;

const EVENT_CONFIG = {
  tack: { label: 'Tack', dotClass: 'tack' },
  gybe: { label: 'Gybe', dotClass: 'gybe' },
  mark: { label: 'Mark', dotClass: 'mark' },
  penalty: { label: 'Penalty', dotClass: 'penalty' },
  rule: { label: 'Rule', dotClass: 'rule' },
};

function formatTime(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

/**
 * Initialize events display in a container.
 *
 * @param {string} containerId - DOM element to append the events section into
 * @returns {{ addEvent: function, update: function }}
 */
export function initInshoreEvents(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return { addEvent() {}, update() {} };

  // Create events section element
  const section = document.createElement('div');
  section.className = 'events-section';
  section.innerHTML = '<div class="events-title">Recent Events</div><div class="events-list"></div>';
  container.appendChild(section);

  const listEl = section.querySelector('.events-list');
  const eventLog = [];

  function render() {
    listEl.innerHTML = '';
    const recent = eventLog.slice(-MAX_EVENTS).reverse();
    if (recent.length === 0) {
      listEl.innerHTML = '<div style="color:#555;font-size:11px;text-align:center;padding:8px 0">No events yet</div>';
      return;
    }
    for (const evt of recent) {
      const cfg = EVENT_CONFIG[evt.type] || { label: evt.type, dotClass: '' };
      const item = document.createElement('div');
      item.className = 'event-item';
      item.innerHTML = `
        <span class="event-dot ${cfg.dotClass}"></span>
        <span class="event-text">${cfg.label}${evt.detail ? ' — ' + evt.detail : ''}</span>
        <span class="event-time">${formatTime(evt.timestamp)}</span>
      `;
      listEl.appendChild(item);
    }
  }

  function addEvent(type, detail, timestamp) {
    eventLog.push({ type, detail: detail || '', timestamp: timestamp || Date.now() });
    if (eventLog.length > 50) eventLog.splice(0, eventLog.length - 50);
    render();
  }

  /**
   * Bulk update from snapshot events array.
   * @param {Array} events - array of { type, timestamp, ... }
   */
  function update(events) {
    if (!events || events.length === 0) return;
    for (const evt of events) {
      // Deduplicate by timestamp+type
      const exists = eventLog.some(e => e.type === evt.type && Math.abs((e.timestamp || 0) - (evt.timestamp || 0)) < 500);
      if (!exists) {
        let detail = '';
        if (evt.type === 'penalty') detail = 'Maneuver penalty';
        if (evt.type === 'sailChange') detail = `${evt.from} -> ${evt.to}`;
        addEvent(evt.type, detail, evt.timestamp);
      }
    }
  }

  render();
  return { addEvent, update };
}
