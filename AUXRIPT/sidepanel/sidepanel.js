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

const permissionBanner = document.getElementById('permissionBanner');
const requestMicBtn = document.getElementById('requestMicBtn');

// Microphone permission state
let micPermissionGranted = false;

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
    showError('Failed to save settings');
  } else {
    showToast('⚙️ Settings saved successfully!');
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

  // Validate API key
  const { data } = await chrome.runtime.sendMessage({ type: 'GET_SETTINGS' });
  const provider = data?.provider || 'gemini';
  const hasKey = getApiKeyForProvider(provider, data);

  if (!hasKey) {
    showError(`Please add your ${provider.toUpperCase()} API key in Settings before starting.`);
    recordingStatusEl.textContent = 'Status: Error';
    recordingStatusEl.classList.remove('recording', 'paused');
    recordingStatusEl.classList.add('stopped');
    return;
  }

  resetTranscript();
  recordingStatusEl.textContent = 'Status: Starting...';
  recordingStatusEl.classList.remove('recording', 'paused', 'stopped');
  connectionStatusEl.textContent = navigator.onLine ? 'Connection: Online' : 'Connection: Offline';

  // Pre-prompt mic permission if needed
  if (micCheckbox.checked) {
    try {
      const tmp = await navigator.mediaDevices.getUserMedia({ audio: true });
      tmp.getTracks().forEach(t => t.stop());
    } catch (e) {
      showError(`Microphone permission denied. Please allow microphone access.`);
      recordingStatusEl.textContent = 'Status: Error';
      recordingStatusEl.classList.add('stopped');
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
    showError(res?.error || 'Failed to start capture.');
    recordingStatusEl.textContent = 'Status: Error';
    recordingStatusEl.classList.add('stopped');
    return;
  }

  startBtn.disabled = true;
  pauseBtn.disabled = false;
  stopBtn.disabled = false;
  pauseBtn.textContent = 'Pause';
  recordingStatusEl.textContent = 'Status: Recording';
  recordingStatusEl.classList.add('recording');
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
    recordingStatusEl.classList.remove('recording');
    recordingStatusEl.classList.add('paused');
  } else {
    pauseBtn.textContent = 'Pause';
    recordingStatusEl.textContent = 'Status: Recording';
    recordingStatusEl.classList.remove('paused');
    recordingStatusEl.classList.add('recording');
  }
}

async function stop() {
  const res = await chrome.runtime.sendMessage({ type: 'OFFSCREEN_STOP' });
  if (!res?.ok) {
    showError(res?.error || 'Failed to stop capture.');
  }
  clearInterval(timerInterval);
  timerInterval = null;
  recordingStatusEl.textContent = 'Status: Stopped';
  recordingStatusEl.classList.remove('recording', 'paused');
  recordingStatusEl.classList.add('stopped');
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
copyBtn.addEventListener('click', () => {
  if (!transcriptText.trim()) {
    showError('No transcript to copy');
    return;
  }
  navigator.clipboard.writeText(transcriptText);
  showToast('📋 Copied to clipboard!');
});
downloadTxtBtn.addEventListener('click', () => {
  if (!transcriptText.trim()) {
    showError('No transcript to download');
    return;
  }
  const blob = new Blob([transcriptText], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `transcript-${Date.now()}.txt`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('⬇️ Downloaded transcript.txt');
});
downloadJsonBtn.addEventListener('click', () => {
  if (transcriptJson.length === 0) {
    showError('No transcript to download');
    return;
  }
  const blob = new Blob([JSON.stringify(transcriptJson, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `transcript-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('⬇️ Downloaded transcript.json');
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

// Microphone Permission Handling
async function checkMicrophonePermission() {
  try {
    const result = await navigator.permissions.query({ name: 'microphone' });
    micPermissionGranted = result.state === 'granted';

    if (result.state === 'prompt') {
      // Show banner if permission hasn't been requested yet
      permissionBanner.style.display = 'flex';
    } else if (result.state === 'granted') {
      permissionBanner.style.display = 'none';
    } else if (result.state === 'denied') {
      permissionBanner.style.display = 'none';
      micCheckbox.disabled = true;
      micCheckbox.title = 'Microphone permission denied. Please enable it in browser settings.';
    }

    // Listen for permission changes
    result.addEventListener('change', () => {
      micPermissionGranted = result.state === 'granted';
      if (result.state === 'granted') {
        permissionBanner.style.display = 'none';
        micCheckbox.disabled = false;
        showToast('🎤 Microphone access granted!');
      } else if (result.state === 'denied') {
        permissionBanner.style.display = 'none';
        micCheckbox.disabled = true;
      }
    });
  } catch (e) {
    // Permissions API not supported, will request on first use
    console.log('Permissions API not supported:', e);
  }
}

async function requestMicrophonePermission() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach(track => track.stop());
    micPermissionGranted = true;
    permissionBanner.style.display = 'none';
    micCheckbox.disabled = false;
    showToast('🎤 Microphone access granted!');
    addTranscriptLine('✅ Microphone permission granted. You can now use the microphone feature.', false);
  } catch (e) {
    showError('Microphone permission denied. Please allow access in your browser settings.');
    micCheckbox.disabled = true;
  }
}

// Request mic permission button
requestMicBtn.addEventListener('click', requestMicrophonePermission);

// Show banner when mic checkbox is clicked without permission
micCheckbox.addEventListener('change', async (e) => {
  if (e.target.checked && !micPermissionGranted) {
    e.target.checked = false;
    permissionBanner.style.display = 'flex';
    showError('Please grant microphone permission first.');
  }
});

// Helper functions
function getApiKeyForProvider(provider, settings) {
  switch (provider) {
    case 'gemini': return settings?.geminiApiKey;
    case 'openai': return settings?.openaiApiKey;
    case 'deepgram': return settings?.deepgramApiKey;
    case 'fireworks': return settings?.fireworksApiKey;
    default: return '';
  }
}

function showError(message) {
  errorStatusEl.textContent = message;
  setTimeout(() => {
    errorStatusEl.textContent = '';
  }, 5000);
}

function showToast(message) {
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => {
    toast.style.animation = 'slideInRight 0.25s reverse';
    setTimeout(() => toast.remove(), 250);
  }, 2500);
}

// Init
loadTabs();
loadSettings();
recordingStatusEl.classList.add('stopped');
// Show permission banner on first load
permissionBanner.style.display = 'flex';