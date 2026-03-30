import { toggleDebugPanel } from './debug-panel.js';

// Inject the fetch interceptor into the page context
const script = document.createElement('script');
script.src = chrome.runtime.getURL('injected.js');
document.documentElement.appendChild(script);

console.log('[vRegatta] Content script loaded, injected interceptor');

// Listen for intercepted messages from the injected script
window.addEventListener('message', (event) => {
  if (event.source !== window) return;
  if (!event.data) return;

  // Forward log messages from injected.js to background
  if (event.data.type === 'vr-log') {
    chrome.runtime.sendMessage({
      type: 'logFromInjected',
      level: event.data.level,
      message: event.data.message,
      data: event.data.data,
    });
    return;
  }

  // Forward WebSocket connected notification
  if (event.data.type === 'vr-ws-connected') {
    chrome.runtime.sendMessage({
      type: 'ws-connected',
      url: event.data.url,
      timestamp: event.data.timestamp,
    });
    return;
  }

  // Forward WebSocket intercepted messages
  if (event.data.type === 'vr-ws-intercepted') {
    chrome.runtime.sendMessage({
      type: 'ws-intercepted',
      direction: event.data.direction,
      data: event.data.data,
      url: event.data.url,
      timestamp: event.data.timestamp,
    });
    return;
  }

  if (event.data.type !== 'vr-intercepted') return;

  chrome.runtime.sendMessage({
    type: 'intercepted',
    url: event.data.url,
    body: event.data.body,
  });
});

// Listen for messages from background
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'toggleDebug') {
    toggleDebugPanel();
  }

});
