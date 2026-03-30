/**
 * Rules panel for the dashboard.
 *
 * Displays active RRS encounters with urgency-colored cards,
 * give-way/stand-on badges, and "Learn more" links that open
 * a detailed rule page in a new window.
 */

import { getRule, getRandomRule } from '../rules/rrs-database.js';

const URGENCY_COLORS = {
  low: '#44cc44',
  medium: '#ffd600',
  high: '#ff8c00',
  critical: '#ff3333',
};

const URGENCY_LABELS = {
  low: 'LOW',
  medium: 'MED',
  high: 'HIGH',
  critical: 'CRIT',
};

/**
 * Initialize the rules panel.
 *
 * @param {string} containerId - DOM element ID for the rules panel container
 * @returns {{ update: function, updateFleet: function, openRule: function }}
 */
export function initRulesPanel(containerId) {
  const container = document.getElementById(containerId);
  if (!container) {
    return {
      update() {},
      openRule() {},
    };
  }

  // Build initial structure
  container.innerHTML = `
    <div class="rules-panel-inner">
      <div class="rules-header">
        <span class="rules-header-icon">&#9973;</span>
        <span class="rules-header-title">Racing Rules</span>
      </div>
      <div class="rules-content">
        <div class="rules-idle"></div>
      </div>
    </div>
  `;

  const contentEl = container.querySelector('.rules-content');
  let lastTipRule = null;
  /** @type {Map<number, string>} slot -> player name */
  let fleetNames = new Map();
  /** Track what's currently rendered to avoid unnecessary DOM thrashing */
  let renderedEncounterKey = '';

  function renderIdle() {
    if (renderedEncounterKey === 'idle') return; // already showing idle
    renderedEncounterKey = 'idle';

    const tip = getRandomRule();
    if (lastTipRule === tip.number) {
      // Just keep the current tip
    }
    lastTipRule = tip.number;

    contentEl.innerHTML = `
      <div class="rules-idle-message">No boats nearby &mdash; sailing free</div>
      <div class="rules-tip-card">
        <div class="rules-tip-label">Did you know?</div>
        <div class="rules-tip-text">
          <strong>Rule ${tip.number}</strong> (${tip.title}): ${tip.shortText}.
          ${tip.explanation.split('\n')[0].substring(0, 200)}...
        </div>
        <button class="rules-learn-btn" data-rule="${tip.number}">Learn more &rarr;</button>
      </div>
    `;

    wireLearnButtons();
  }

  function renderEncounters(encounters) {
    if (!encounters || encounters.length === 0) {
      renderIdle();
      return;
    }

    // Build a key to check if encounters actually changed
    const key = encounters.map(e => `${e.rule}:${e.otherBoat?.slot ?? ''}:${e.urgency}:${e.playerRole}`).join('|');
    if (key === renderedEncounterKey) return; // skip — nothing changed
    renderedEncounterKey = key;

    let html = '';
    for (const enc of encounters) {
      const rule = enc.rule ? getRule(enc.rule) : null;
      const color = URGENCY_COLORS[enc.urgency] || URGENCY_COLORS.low;
      const urgencyLabel = URGENCY_LABELS[enc.urgency] || '';

      // Resolve other boat name from fleet
      const otherName = enc.otherBoat != null ? (fleetNames.get(enc.otherBoat) || `Boat #${enc.otherBoat}`) : '';

      // Role badge
      let roleBadge = '';
      if (enc.playerRole === 'give-way') {
        roleBadge = '<span class="rules-role-badge rules-role-giveway">GIVE WAY</span>';
      } else if (enc.playerRole === 'stand-on') {
        roleBadge = '<span class="rules-role-badge rules-role-standon">STAND ON</span>';
      }

      // Rule number circle
      const ruleCircle = enc.rule
        ? `<div class="rules-number-circle" style="border-color: ${color}">${enc.rule}</div>`
        : '';

      // Title
      const title = rule ? rule.title : 'Situation Alert';

      // What to do (brief)
      const whatToDo = rule
        ? rule.whatToDo.split('\n')[0].substring(0, 150)
        : '';

      html += `
        <div class="rules-encounter-card" style="border-left-color: ${color}">
          <div class="rules-encounter-top">
            ${ruleCircle}
            <div class="rules-encounter-info">
              <div class="rules-encounter-title">${title}</div>
              <div class="rules-encounter-urgency" style="color: ${color}">${urgencyLabel}</div>
            </div>
            ${roleBadge}
          </div>
          <div class="rules-encounter-desc">${otherName ? `<strong>${otherName}</strong> — ` : ''}${enc.description}</div>
          ${whatToDo ? `<div class="rules-encounter-action">${whatToDo}</div>` : ''}
          ${enc.rule ? `<button class="rules-learn-btn" data-rule="${enc.rule}">Learn more &rarr;</button>` : ''}
        </div>
      `;
    }

    contentEl.innerHTML = html;
    wireLearnButtons();
  }

  function wireLearnButtons() {
    contentEl.querySelectorAll('.rules-learn-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const ruleNum = e.target.dataset.rule;
        if (ruleNum) openRule(ruleNum);
      });
    });
  }

  function openRule(ruleNumber) {
    // Try to open as a new Chrome extension tab/window
    const url = `rules/rule-page.html?rule=${ruleNumber}`;

    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL) {
      const fullUrl = chrome.runtime.getURL(url);
      if (chrome.windows && chrome.windows.create) {
        chrome.windows.create({
          url: fullUrl,
          type: 'popup',
          width: 600,
          height: 800,
        });
      } else if (chrome.tabs && chrome.tabs.create) {
        chrome.tabs.create({ url: fullUrl });
      } else {
        window.open(fullUrl, '_blank', 'width=600,height=800');
      }
    } else {
      // Fallback for non-extension context (testing)
      window.open(url, '_blank', 'width=600,height=800');
    }
  }

  // Show idle state initially
  renderIdle();

  return {
    update(encounters) {
      renderEncounters(encounters);
    },
    updateFleet(fleet) {
      fleetNames.clear();
      if (fleet && Array.isArray(fleet)) {
        for (const p of fleet) {
          if (p.slotId != null && p.name) {
            fleetNames.set(p.slotId, p.name);
          }
        }
      }
    },
    openRule,
  };
}
