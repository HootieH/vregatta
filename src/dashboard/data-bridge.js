import { computeVMGEfficiency } from '../analytics/performance.js';

const POLL_INTERVAL = 5000;
const MAX_HISTORY = 200;
const MAX_PERF_HISTORY = 720; // 1 hour at 5s intervals

export function createDataBridge(onUpdate) {
  let timer = null;
  const positionHistory = [];
  const perfHistory = [];
  const efficiencyHistory = [];
  let lastSnapshot = null;

  function poll() {
    chrome.runtime.sendMessage({ type: 'getStatus' }, (response) => {
      if (chrome.runtime.lastError || !response) {
        onUpdate(null, positionHistory);
        return;
      }

      if (response.boat && response.boat.lat != null && response.boat.lon != null) {
        const last = positionHistory[positionHistory.length - 1];
        if (!last || last.lat !== response.boat.lat || last.lon !== response.boat.lon) {
          positionHistory.push({ lat: response.boat.lat, lon: response.boat.lon });
          if (positionHistory.length > MAX_HISTORY) {
            positionHistory.splice(0, positionHistory.length - MAX_HISTORY);
          }
        }
      }

      lastSnapshot = response;
      onUpdate(response, positionHistory);
    });
  }

  function start() {
    poll();
    timer = setInterval(poll, POLL_INTERVAL);
  }

  function stop() {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  }

  function getHistory() {
    return positionHistory.slice();
  }

  let cachedPolar = null;

  function fetchPolar() {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: 'getPolar' }, (response) => {
        if (chrome.runtime.lastError || !response || !response.polar) {
          resolve(null);
          return;
        }
        cachedPolar = response.polar;
        resolve(cachedPolar);
      });
    });
  }

  function addPerfSnapshot(boatState, polar, options) {
    if (!boatState || !polar) return;
    perfHistory.push({ ...boatState, timestamp: boatState.timestamp ?? Date.now() });
    if (perfHistory.length > MAX_PERF_HISTORY) perfHistory.shift();

    const eff = computeVMGEfficiency(boatState, polar, options);
    efficiencyHistory.push(eff);
    if (efficiencyHistory.length > MAX_PERF_HISTORY) efficiencyHistory.shift();
  }

  function getPerformanceHistory() {
    return { history: perfHistory.slice(), efficiencyHistory: efficiencyHistory.slice() };
  }

  function getLastSnapshot() {
    return lastSnapshot;
  }

  return { start, stop, getHistory, fetchPolar, addPerfSnapshot, getPerformanceHistory, getLastSnapshot };
}
