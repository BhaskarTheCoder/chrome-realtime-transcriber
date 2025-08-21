// sidepanel.js
let transcriptText = '';
let transcriptJson = []; // [{time, text, final}]
let startTime = null;
let timerInterval = null;

// Elements
const recordingStatusEl = document.getElementById('recordingStatus');
const connectionStatusEl = document.getElementById('connectionStatus');
const errorStatusEl = document.getElementById('errorStatus');
const timerEl = document.getElementById('timer');
const transcriptEl = document.getElementById('transcript');
const micCheckbox = document.getElementById('micCheckbox');
const tabList = document.getElementById('tabList');

const startBtn = document.getElementById('startBtn');
const pauseBtn = document.getElementById('pauseBtn');
const stopBtn = document.getElementById('stopBtn');

const channelListEl = document.getElementById('channelList');

const providerSelect = document.getElementById('providerSelect');
const geminiModelEl = document.getElementById('geminiModel');
const geminiKeyEl = document.getElementById('geminiKey');
const openaiKeyEl = document.getElementById('openaiKey');
const deepgramKeyEl = document.getElementById('deepgramKey');
const fireworksKeyEl = document.getElementById('fireworksKey');
const chunkSecEl = document.getElementById('chunkSec');
const overlapSecEl = document.getElementById('overlapSec');
const fallbackEnabledEl = document.getElementById('fallbackEnabled');
const saveSettingsBtn = document.getElementById('saveSettingsBtn');

const copyBtn = document.getElementById('copyBtn');
const downloadTxtBtn = document.getElementById('downloadTxtBtn');
const downloadJsonBtn = document.getElementById('downloadJsonBtn');

async function loadTabs() {
  const tabs = await chrome.tabs.query({});
  const current = tabList.querySelector('option[value="current"]');
  tabList.innerHTML = '';
  if (current) tabList.appendChild(current);
  for (const t of tabs) {
    const opt = document.createElement('option');
    opt.value = String(t.id);
    opt.textContent = t.title || `Tab ${t.id}`;
    tabList.appendChild(opt);
  }
}

async function loadSettings() {
  const { data } = await chrome.runtime.sendMessage({ type: 'GET_SETTINGS' });
  providerSelect.value = data.provider || 'gemini';
  geminiModelEl.value = data.geminiModel || 'gemini-1.5-flash';
  geminiKeyEl.value = data.geminiApiKey || '';
  openaiKeyEl.value = data.openaiApiKey || '';
  deepgramKeyEl.value = data.deepgramApiKey || '';
  fireworksKeyEl.value = data.fireworksApiKey || '';
  chunkSecEl.value = (data.chunkSec ?? 30);
  overlapSecEl.value = (data.overlapSec ?? 3);
  fallbackEnabledEl.checked = data.fallbackEnabled !== false;
}

async function saveSettings() {
  const payload = {
    provider: providerSelect.value,
    geminiModel: geminiModelEl.value.trim() || 'gemini-1.5-flash',
    geminiApiKey: geminiKeyEl.value.trim(),
    openaiApiKey: openaiKeyEl.value.trim(),
    deepgramApiKey: deepgramKeyEl.value.trim(),
    fireworksApiKey: fireworksKeyEl.value.trim(),
    chunkSec: Math.max(5, Number(chunkSecEl.value) || 30),
    overlapSec: Math.max(0, Number(overlapSecEl.value) || 3),
    fallbackEnabled: !!fallbackEnabledEl.checked
  };
  const res = await chrome.runtime.sendMessage({ type: 'SAVE_SETTINGS', payload });
  if (!res?.ok) {
    errorStatusEl.textContent = 'Failed to save settings';
  } else {
    addTranscriptLine('⚙️ Settings saved.', false);
  }
}

function resetTranscript() {
  transcriptText = '';
  transcriptJson = [];
  transcriptEl.innerHTML = '';
}

function addTranscriptLine(text, final) {
  const p = document.createElement('p');
  p.className = 'transcript-line';
  p.textContent = text;
  transcriptEl.appendChild(p);
  transcriptEl.scrollTop = transcriptEl.scrollHeight;

  transcriptText += text + '\n';
  transcriptJson.push({ time: Date.now(), text, final: !!final });
}

function updateChannelsList(channels) {
  channelListEl.innerHTML = '';
  channels.forEach(ch => {
    const li = document.createElement('li');
    li.textContent = ch;
    channelListEl.appendChild(li);
  });
}

function updateTimer() {
  const elapsed = Math.floor((Date.now() - startTime) / 1000);
  const minutes = String(Math.floor(elapsed / 60)).padStart(2, '0');
  const seconds = String(elapsed % 60).padStart(2, '0');
  timerEl.textContent = `${minutes}:${seconds}`;
}

async function start() {
  errorStatusEl.textContent = '';
  resetTranscript();
  recordingStatusEl.textContent = 'Status: Starting...';
  connectionStatusEl.textContent = navigator.onLine ? 'Connection: Online' : 'Connection: Offline';

  // Pre-prompt mic permission if needed
  if (micCheckbox.checked) {
    try {
      const tmp = await navigator.mediaDevices.getUserMedia({ audio: true });
      tmp.getTracks().forEach(t => t.stop());
    } catch (e) {
      errorStatusEl.textContent = `Microphone permission error: ${e.message}`;
      recordingStatusEl.textContent = 'Status: Error';
      return;
    }
  }

  const selected = tabList.value;
  const tabId = selected === 'current' ? null : Number(selected) || null;

  const res = await chrome.runtime.sendMessage({
    type: 'OFFSCREEN_START',
    payload: { tabId, includeMic: micCheckbox.checked }
  });

  if (!res?.ok) {
    errorStatusEl.textContent = res?.error || 'Failed to start capture.';
    recordingStatusEl.textContent = 'Status: Error';
    return;
  }

  startBtn.disabled = true;
  pauseBtn.disabled = false;
  stopBtn.disabled = false;
  pauseBtn.textContent = 'Pause';
  recordingStatusEl.textContent = 'Status: Recording';
  connectionStatusEl.textContent = navigator.onLine ? 'Connection: Online' : 'Connection: Offline';
  startTime = Date.now();
  timerInterval = setInterval(updateTimer, 1000);
}

async function pauseResume() {
  const paused = pauseBtn.textContent === 'Pause';
  const res = await chrome.runtime.sendMessage({ type: 'OFFSCREEN_PAUSE', payload: { paused } });
  if (!res?.ok) return;
  if (paused) {
    pauseBtn.textContent = 'Resume';
    recordingStatusEl.textContent = 'Status: Paused';
  } else {
    pauseBtn.textContent = 'Pause';
    recordingStatusEl.textContent = 'Status: Recording';
  }
}

async function stop() {
  const res = await chrome.runtime.sendMessage({ type: 'OFFSCREEN_STOP' });
  if (!res?.ok) {
    errorStatusEl.textContent = res?.error || 'Failed to stop capture.';
  }
  clearInterval(timerInterval);
  timerInterval = null;
  recordingStatusEl.textContent = 'Status: Stopped';
  connectionStatusEl.textContent = 'Connection: Offline';
  startBtn.disabled = false;
  pauseBtn.disabled = true;
  stopBtn.disabled = true;
}

// Buttons
startBtn.addEventListener('click', start);
pauseBtn.addEventListener('click', pauseResume);
stopBtn.addEventListener('click', stop);

saveSettingsBtn.addEventListener('click', saveSettings);

// Export
copyBtn.addEventListener('click', () => navigator.clipboard.writeText(transcriptText));
downloadTxtBtn.addEventListener('click', () => {
  const blob = new Blob([transcriptText], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'transcript.txt';
  a.click();
  URL.revokeObjectURL(url);
});
downloadJsonBtn.addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(transcriptJson, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'transcript.json';
  a.click();
  URL.revokeObjectURL(url);
});

// Live updates
chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type === 'LIVE_TEXT') {
    const { text, final } = msg.payload || {};
    if (text) addTranscriptLine(text, final);
  }
  if (msg?.type === 'CHANNELS') {
    updateChannelsList(msg.payload?.channels || []);
  }
  if (msg?.type === 'STATUS') {
    const conn = msg.payload?.connection;
    if (conn) connectionStatusEl.textContent = `Connection: ${conn[0].toUpperCase()}${conn.slice(1)}`;
  }
});

// Connection indicator
window.addEventListener('online', () => connectionStatusEl.textContent = 'Connection: Online');
window.addEventListener('offline', () => connectionStatusEl.textContent = 'Connection: Offline');

// Init
loadTabs();
loadSettings();