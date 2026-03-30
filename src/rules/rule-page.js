/**
 * Rule detail page — standalone page that displays a single RRS rule
 * with full educational content.
 *
 * Reads the rule number from URL params (?rule=10) and renders from
 * the rules database.
 */

import { getRule, getAllRules } from './rrs-database.js';

const allRules = getAllRules();
const ruleNumbers = allRules.map(r => r.number);

/* global URLSearchParams */

function getCurrentRuleNumber() {
  const params = new URLSearchParams(window.location.search);
  return params.get('rule');
}

function renderRule(ruleNumber) {
  const contentEl = document.getElementById('rule-content');
  const rule = getRule(ruleNumber);

  if (!rule) {
    contentEl.innerHTML = `<div class="rule-error">Rule "${ruleNumber}" not found in database.</div>`;
    document.title = 'Rule Not Found';
    return;
  }

  document.title = `Rule ${rule.number} - ${rule.title}`;

  // Build common mistakes list
  const mistakesHtml = rule.commonMistakes
    .map(m => `<li>${m}</li>`)
    .join('');

  contentEl.innerHTML = `
    <div class="rule-header">
      <div class="rule-number-large">${rule.number}</div>
      <div class="rule-title-large">${rule.title}</div>
      <div class="rule-section-label">${rule.section}</div>
    </div>

    <div class="rule-short-text">${rule.shortText}</div>

    <div class="rule-section">
      <div class="rule-section-heading">Full Rule Text</div>
      <div class="rule-full-text">${rule.fullText}</div>
    </div>

    <div class="rule-section">
      <div class="rule-section-heading">Explanation</div>
      <div class="rule-section-body">${rule.explanation}</div>
    </div>

    <div class="rule-section">
      <div class="rule-section-heading">When It Applies</div>
      <div class="rule-section-body">${rule.whenItApplies}</div>
    </div>

    <div class="rule-section">
      <div class="rule-section-heading">What To Do</div>
      <div class="rule-section-body">${rule.whatToDo}</div>
    </div>

    <div class="rule-section">
      <div class="rule-section-heading">Common Mistakes</div>
      <ol class="rule-mistakes-list">${mistakesHtml}</ol>
    </div>

    <a href="${rule.rrsUrl}" target="_blank" rel="noopener" class="rule-official-link">
      View Official Racing Rules of Sailing &rarr;
    </a>
  `;

  // Update nav buttons
  updateNavButtons(ruleNumber);
}

function updateNavButtons(currentNumber) {
  const prevBtn = document.getElementById('prev-rule');
  const nextBtn = document.getElementById('next-rule');
  const closeBtn = document.getElementById('close-rule');

  const idx = ruleNumbers.indexOf(currentNumber);

  if (prevBtn) {
    if (idx > 0) {
      prevBtn.disabled = false;
      prevBtn.onclick = () => navigateToRule(ruleNumbers[idx - 1]);
    } else {
      prevBtn.disabled = true;
      prevBtn.onclick = null;
    }
  }

  if (nextBtn) {
    if (idx < ruleNumbers.length - 1) {
      nextBtn.disabled = false;
      nextBtn.onclick = () => navigateToRule(ruleNumbers[idx + 1]);
    } else {
      nextBtn.disabled = true;
      nextBtn.onclick = null;
    }
  }

  if (closeBtn) {
    closeBtn.onclick = () => window.close();
  }
}

function navigateToRule(ruleNumber) {
  const url = new URL(window.location);
  url.searchParams.set('rule', ruleNumber);
  window.history.pushState({}, '', url);
  renderRule(ruleNumber);
  window.scrollTo(0, 0);
}

// Handle browser back/forward
window.addEventListener('popstate', () => {
  const num = getCurrentRuleNumber();
  if (num) renderRule(num);
});

// Initial render
const ruleNumber = getCurrentRuleNumber();
if (ruleNumber) {
  renderRule(ruleNumber);
} else {
  document.getElementById('rule-content').innerHTML =
    '<div class="rule-error">No rule specified. Use ?rule=10 in the URL.</div>';
}
