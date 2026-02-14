// service_worker.js
// Orchestrates the offscreen document and settings storage, and routes messages.

const DEFAULT_SETTINGS = {
  provider: 'gemini',
  geminiApiKey: '', // Users must provide their own API key via settings
  openaiApiKey: '',
  deepgramApiKey: '',
  fireworksApiKey: '',
  geminiModel: 'gemini-1.5-flash',
  chunkSec: 30,
  overlapSec: 3,
  fallbackEnabled: true,
};

async function ensureDefaults() {
  const existing = await chrome.storage.local.get(Object.keys(DEFAULT_SETTINGS));
  const toSet = {};
  for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) {
    if (existing[k] === undefined) toSet[k] = v;
  }
  if (Object.keys(toSet).length) {
    await chrome.storage.local.set(toSet);
  }
}

async function ensureOffscreen() {
  const hasDoc = await chrome.offscreen.hasDocument();
  if (!hasDoc) {
    await chrome.offscreen.createDocument({
      url: 'offscreen.html',
      reasons: ['AUDIO_PLAYBACK'],
      justification: 'Capture and process audio with AudioWorklet for STT.'
    });
  }
}

chrome.runtime.onInstalled.addListener(async () => {
  await ensureDefaults();
  console.log('Audio Transcription extension installed.');
});

chrome.action.onClicked.addListener(async (tab) => {
  try {
    await chrome.sidePanel.open({ windowId: tab.windowId });
  } catch (e) {
    console.warn('Side panel open failed:', e);
  }
});

// Message router
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    try {
      switch (msg?.type) {
        case 'OFFSCREEN_START': {
          await ensureOffscreen();
          await chrome.runtime.sendMessage({ type: 'OFFSCREEN_START', payload: msg.payload });
          sendResponse({ ok: true });
          break;
        }
        case 'OFFSCREEN_STOP': {
          await chrome.runtime.sendMessage({ type: 'OFFSCREEN_STOP' });
          sendResponse({ ok: true });
          break;
        }
        case 'OFFSCREEN_PAUSE': {
          await chrome.runtime.sendMessage({ type: 'OFFSCREEN_PAUSE', payload: { paused: msg.payload?.paused } });
          sendResponse({ ok: true });
          break;
        }
        case 'GET_SETTINGS': {
          const data = await chrome.storage.local.get(Object.keys(DEFAULT_SETTINGS));
          sendResponse({ ok: true, data });
          break;
        }
        case 'SAVE_SETTINGS': {
          await chrome.storage.local.set(msg.payload || {});
          sendResponse({ ok: true });
          break;
        }
        case 'SAVE_QUEUE': {
          await chrome.storage.local.set({ sttQueue: msg.payload?.sttQueue || [] });
          sendResponse({ ok: true });
          break;
        }
        case 'LOAD_QUEUE': {
          const { sttQueue } = await chrome.storage.local.get(['sttQueue']);
          sendResponse({ ok: true, data: { sttQueue: sttQueue || [] } });
          break;
        }
        case 'LIVE_TEXT':
        case 'CHANNELS':
        case 'QUEUE_STATUS':
        case 'STATUS': {
          // Broadcast to all extension contexts (sidepanel listens)
          chrome.runtime.sendMessage(msg);
          sendResponse?.({ ok: true });
          break;
        }
        default:
          sendResponse?.({ ok: true });
          break;
      }
    } catch (e) {
      console.error('Service worker error:', e);
      sendResponse?.({ ok: false, error: e?.message || String(e) });
    }
  })();
  return true; // async
});