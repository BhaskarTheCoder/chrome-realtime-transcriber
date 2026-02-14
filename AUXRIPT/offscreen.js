// offscreen/offscreen.js
// Audio capture + chunker + STT with retry/backoff + offline queue.
let ctx = null;
const pipelines = []; // [{ label, stream, sourceNode, workletNode, state }]
let settings = {
  provider: 'gemini',
  geminiApiKey: '',
  openaiApiKey: '',
  deepgramApiKey: '',
  fireworksApiKey: '',
  geminiModel: 'gemini-1.5-flash',
  chunkSec: 30,
  overlapSec: 3,
  fallbackEnabled: true
};
let paused = false;

// Offline queue for chunks (persisted)
let queue = []; // [{id, channel, startSec, endSec, mime, dataB64, attempts}]
let processingQueue = false;

chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type === 'OFFSCREEN_START') startPipeline(msg.payload);
  if (msg?.type === 'OFFSCREEN_STOP') stopPipeline();
  if (msg?.type === 'OFFSCREEN_PAUSE') setPaused(!!msg?.payload?.paused);
});

// Helpers
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const jitter = (ms) => Math.round(ms * (1 + (Math.random() * 0.2 - 0.1)));

function fmtTime(sec) {
  const s = Math.max(0, Math.floor(sec));
  const mm = String(Math.floor(s / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return `${mm}:${ss}`;
}

function flattenFloat32(buffers) {
  const len = buffers.reduce((s, b) => s + b.length, 0);
  const out = new Float32Array(len);
  let o = 0;
  for (const b of buffers) { out.set(b, o); o += b.length; }
  return out;
}

function clamp16(n) {
  return Math.max(-32768, Math.min(32767, n));
}

function floatTo16Wav(float32, sampleRate) {
  const len = float32.length;
  const buffer = new ArrayBuffer(44 + len * 2);
  const view = new DataView(buffer);

  const writeStr = (o, s) => { for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i)); };
  const write16 = (o, v) => view.setUint16(o, v, true);
  const write32 = (o, v) => view.setUint32(o, v, true);

  writeStr(0, 'RIFF');
  write32(4, 36 + len * 2);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  write32(16, 16);
  write16(20, 1); // PCM
  write16(22, 1); // mono
  write32(24, sampleRate);
  write32(28, sampleRate * 2);
  write16(32, 2);
  write16(34, 16);
  writeStr(36, 'data');
  write32(40, len * 2);

  let offset = 44;
  for (let i = 0; i < len; i++) {
    let s = Math.max(-1, Math.min(1, float32[i]));
    const v = s < 0 ? s * 0x8000 : s * 0x7fff;
    view.setInt16(offset, clamp16(v | 0), true);
    offset += 2;
  }
  return new Blob([view], { type: 'audio/wav' });
}

async function blobToBase64(blob) {
  const buf = await blob.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

function base64ToBlob(b64, mime) {
  const bin = atob(b64);
  const len = bin.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime || 'application/octet-stream' });
}

async function loadSettings() {
  const { data } = await chrome.runtime.sendMessage({ type: 'GET_SETTINGS' });
  settings = {
    provider: data.provider || 'gemini',
    geminiApiKey: data.geminiApiKey || '',
    openaiApiKey: data.openaiApiKey || '',
    deepgramApiKey: data.deepgramApiKey || '',
    fireworksApiKey: data.fireworksApiKey || '',
    geminiModel: data.geminiModel || 'gemini-1.5-flash',
    chunkSec: Number.isFinite(data.chunkSec) ? data.chunkSec : 30,
    overlapSec: Number.isFinite(data.overlapSec) ? data.overlapSec : 3,
    fallbackEnabled: data.fallbackEnabled !== false
  };
}

function makeState(sampleRate) {
  return {
    sampleRate,
    chunkSamplesTarget: Math.floor(settings.chunkSec * sampleRate),
    overlapSamples: Math.floor(settings.overlapSec * sampleRate),
    chunkBuffer: [],
    overlapTail: new Float32Array(0),
    timelineSec: 0, // unique audio processed
    chunkIndex: 0
  };
}

// Network/queue
window.addEventListener('online', () => {
  chrome.runtime.sendMessage({ type: 'STATUS', payload: { connection: 'online' } });
  processQueue();
});
window.addEventListener('offline', () => {
  chrome.runtime.sendMessage({ type: 'STATUS', payload: { connection: 'offline' } });
});

async function saveQueue() {
  try {
    await chrome.runtime.sendMessage({ type: 'SAVE_QUEUE', payload: { sttQueue: queue } });
    chrome.runtime.sendMessage({ type: 'QUEUE_STATUS', payload: { size: queue.length } });
  } catch (e) {
    console.error('Failed to save queue:', e);
  }
}
async function loadQueue() {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'LOAD_QUEUE' });
    queue = Array.isArray(response?.data?.sttQueue) ? response.data.sttQueue : [];
    chrome.runtime.sendMessage({ type: 'QUEUE_STATUS', payload: { size: queue.length } });
  } catch (e) {
    console.error('Failed to load queue:', e);
    queue = [];
  }
}

function enqueue({ blob, channel, startSec, endSec }) {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return blobToBase64(blob).then((dataB64) => {
    queue.push({ id, channel, startSec, endSec, mime: 'audio/wav', dataB64, attempts: 0 });
    saveQueue();
    chrome.runtime.sendMessage({
      type: 'LIVE_TEXT',
      payload: { text: `[${fmtTime(startSec)}–${fmtTime(endSec)}] [${channel}] 📦 Queued (offline).`, final: true }
    });
  });
}

async function processQueue() {
  if (processingQueue || !navigator.onLine) return;
  processingQueue = true;
  try {
    while (queue.length && navigator.onLine) {
      const item = queue[0];
      const blob = base64ToBlob(item.dataB64, item.mime);
      try {
        const text = await transcribeWithFallback(blob, item);
        chrome.runtime.sendMessage({
          type: 'LIVE_TEXT',
          payload: { text: `[${fmtTime(item.startSec)}–${fmtTime(item.endSec)}] [${item.channel}] ${text}`, final: true }
        });
        queue.shift();
        await saveQueue();
      } catch (e) {
        item.attempts = (item.attempts || 0) + 1;
        await saveQueue();
        const transient = e?.transient || false;
        if (!transient || item.attempts >= 3) {
          chrome.runtime.sendMessage({
            type: 'LIVE_TEXT',
            payload: { text: `[${fmtTime(item.startSec)}–${fmtTime(item.endSec)}] [${item.channel}] ❌ Final failure: ${e.message}`, final: true }
          });
          queue.shift();
          await saveQueue();
        } else {
          // backoff then retry loop continues
          await sleep(jitter(1000 * Math.pow(2, item.attempts)));
        }
      }
    }
  } finally {
    processingQueue = false;
  }
}

// Core pipeline
async function startPipeline({ tabId, includeMic }) {
  await stopPipeline();
  await loadSettings();
  await loadQueue();

  ctx = new (self.AudioContext || self.webkitAudioContext)({ sampleRate: 48000 });
  await ctx.audioWorklet.addModule(chrome.runtime.getURL('pcm-worklet.js'));

  const sink = ctx.createGain();
  sink.gain.value = 0;
  sink.connect(ctx.destination);

  const list = [];

  // Capture Tab Audio (active or specific tab)
  try {
    const streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: tabId || undefined });
    const tabStream = await navigator.mediaDevices.getUserMedia({
      audio: { mandatory: { chromeMediaSource: 'tab', chromeMediaSourceId: streamId } },
      video: false
    });
    list.push({ stream: tabStream, label: 'Tab Audio' });
  } catch (e) {
    chrome.runtime.sendMessage({ type: 'LIVE_TEXT', payload: { text: `⚠️ Could not capture tab audio: ${e.message}`, final: true } });
  }

  if (includeMic) {
    try {
      const micStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      list.push({ stream: micStream, label: 'Microphone' });
    } catch (e) {
      chrome.runtime.sendMessage({ type: 'LIVE_TEXT', payload: { text: `⚠️ Microphone error: ${e.message}`, final: true } });
    }
  }

  for (const item of list) {
    const node = new AudioWorkletNode(ctx, 'pcm-capture');
    const src = ctx.createMediaStreamSource(item.stream);
    const localSink = ctx.createGain(); localSink.gain.value = 0;
    src.connect(node).connect(localSink).connect(sink);

    const state = makeState(ctx.sampleRate);
    node.port.onmessage = (ev) => {
      if (paused) return;
      const { type, samples } = ev.data || {};
      if (type !== 'pcm') return;

      state.chunkBuffer.push(new Float32Array(samples));
      const currentLen = state.chunkBuffer.reduce((s, b) => s + b.length, 0);

      // Heartbeat ~2s
      if (currentLen % (state.sampleRate * 2) < samples.length) {
        chrome.runtime.sendMessage({ type: 'LIVE_TEXT', payload: { text: `[${item.label}] listening...`, final: false } });
      }

      if (currentLen >= state.chunkSamplesTarget) {
        buildAndHandleChunk(item.label, state);
      }
    };

    pipelines.push({ label: item.label, stream: item.stream, sourceNode: src, workletNode: node, state });
  }

  // Announce channels
  chrome.runtime.sendMessage({ type: 'CHANNELS', payload: { channels: pipelines.map(p => p.label) } });
  if (pipelines.length) {
    chrome.runtime.sendMessage({ type: 'LIVE_TEXT', payload: { text: '🎧 Capture started.', final: false } });
  } else {
    chrome.runtime.sendMessage({ type: 'LIVE_TEXT', payload: { text: '❌ No audio sources available.', final: true } });
  }
}

async function stopPipeline() {
  try {
    for (const p of pipelines.splice(0)) {
      try { p.workletNode?.disconnect(); } catch { }
      try { p.sourceNode?.disconnect(); } catch { }
      try { p.stream?.getTracks().forEach(t => t.stop()); } catch { }
    }
    if (ctx && ctx.state !== 'closed') await ctx.close();
  } catch { }
  ctx = null;
  paused = false;
  chrome.runtime.sendMessage({ type: 'LIVE_TEXT', payload: { text: '⏹️ Capture stopped.', final: true } });
}

async function setPaused(p) {
  paused = p;
  try {
    if (ctx) {
      if (paused && ctx.state === 'running') await ctx.suspend();
      if (!paused && ctx.state === 'suspended') await ctx.resume();
    }
  } catch { }
  chrome.runtime.sendMessage({
    type: 'LIVE_TEXT',
    payload: { text: paused ? '⏸️ Paused.' : '▶️ Resumed.', final: false }
  });
}

async function buildAndHandleChunk(channel, state) {
  // Take unique audio since last chunk
  const flat = flattenFloat32(state.chunkBuffer);
  state.chunkBuffer = [];

  // Prepend previous overlap
  const joined = new Float32Array(state.overlapTail.length + flat.length);
  joined.set(state.overlapTail, 0);
  joined.set(flat, state.overlapTail.length);

  const sr = state.sampleRate;
  const flatDur = flat.length / sr;
  const tailDur = state.overlapTail.length / sr;

  const chunkStartSec = Math.max(0, state.timelineSec - tailDur);
  const chunkEndSec = state.timelineSec + flatDur;

  // Next tail = last overlapSec
  state.overlapTail = joined.slice(Math.max(0, joined.length - state.overlapSamples));
  state.timelineSec += flatDur;

  const wav = floatTo16Wav(joined, sr);
  const timeTag = `[${fmtTime(chunkStartSec)}–${fmtTime(chunkEndSec)}]`;
  chrome.runtime.sendMessage({
    type: 'LIVE_TEXT',
    payload: { text: `${timeTag} [${channel}] processing chunk...`, final: false }
  });

  try {
    if (!navigator.onLine) {
      await enqueue({ blob: wav, channel, startSec: chunkStartSec, endSec: chunkEndSec });
      return;
    }
    const text = await transcribeWithFallback(wav, { channel, startSec: chunkStartSec, endSec: chunkEndSec });
    chrome.runtime.sendMessage({
      type: 'LIVE_TEXT',
      payload: { text: `${timeTag} [${channel}] ${text}`, final: true }
    });
  } catch (e) {
    const transient = e?.transient || false;
    if (transient) {
      await enqueue({ blob: wav, channel, startSec: chunkStartSec, endSec: chunkEndSec });
    } else {
      chrome.runtime.sendMessage({
        type: 'LIVE_TEXT',
        payload: { text: `${timeTag} [${channel}] ❌ ${e.message}`, final: true }
      });
    }
  }
}

// Transcription with fallback + retry
async function transcribeWithFallback(blob, meta) {
  const order = providerOrder(settings.provider);
  const errors = [];
  for (const p of order) {
    const key = getApiKey(p);
    if (!key) { errors.push(`${p}: no API key`); continue; }
    try {
      return await withRetry(() => transcribeWithProvider(p, blob, key, meta), { retries: 3, baseDelay: 1000 });
    } catch (e) {
      errors.push(`${p}: ${e.message}`);
      // Only continue if fallback enabled and error is transient or provider unreachable
      if (!settings.fallbackEnabled) break;
    }
  }
  throw new Error(`All providers failed. ${errors.join(' | ')}`);
}

function providerOrder(primary) {
  const all = ['gemini', 'openai', 'deepgram', 'fireworks'];
  const start = all.indexOf(primary) >= 0 ? primary : 'gemini';
  const ordered = [start, ...all.filter(p => p !== start)];
  return ordered;
}

function getApiKey(provider) {
  switch (provider) {
    case 'gemini': return settings.geminiApiKey;
    case 'openai': return settings.openaiApiKey;
    case 'deepgram': return settings.deepgramApiKey;
    case 'fireworks': return settings.fireworksApiKey;
    default: return '';
  }
}

async function withRetry(fn, { retries = 3, baseDelay = 1000 }) {
  let attempt = 0;
  while (true) {
    try {
      return await fn();
    } catch (e) {
      attempt++;
      const transient = e?.transient || false;
      if (!transient || attempt > retries) throw e;
      await sleep(jitter(baseDelay * Math.pow(2, attempt - 1)));
    }
  }
}

function httpError(status, msg) {
  const err = new Error(msg || `HTTP ${status}`);
  err.status = status;
  err.transient = (status >= 500 || status === 429);
  if (status === 401 || status === 403 || status === 400) err.transient = false;
  return err;
}

async function transcribeWithProvider(provider, blob, apiKey, { startSec, endSec }) {
  switch (provider) {
    case 'gemini':
      return await transcribeGemini(blob, apiKey, settings.geminiModel, startSec, endSec);
    case 'openai':
      return await transcribeOpenAI(blob, apiKey);
    case 'deepgram':
      return await transcribeDeepgram(blob, apiKey);
    case 'fireworks':
      return await transcribeFireworks(blob, apiKey);
    default:
      throw new Error('Unknown provider');
  }
}

// Providers
async function transcribeGemini(blob, apiKey, model, startSec, endSec) {
  const dataB64 = await blobToBase64(blob);
  const prompt = `Transcribe the audio precisely with punctuation; output only the transcript text. Time range: ${fmtTime(startSec)}–${fmtTime(endSec)}.`;
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }, { inline_data: { mime_type: 'audio/wav', data: dataB64 } }] }],
      generationConfig: { temperature: 0 }
    })
  });
  if (!res.ok) throw httpError(res.status, `Gemini HTTP ${res.status}`);
  const json = await res.json();
  const text = json?.candidates?.[0]?.content?.parts?.map(p => p.text).join('') || '';
  return text.trim() || '[No speech detected]';
}

async function transcribeOpenAI(blob, apiKey) {
  const form = new FormData();
  form.append('file', blob, 'audio.wav');
  form.append('model', 'whisper-1');
  const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form
  });
  if (!res.ok) throw httpError(res.status, `OpenAI HTTP ${res.status}`);
  const json = await res.json();
  const text = json?.text || '';
  return text.trim() || '[No speech detected]';
}

async function transcribeDeepgram(blob, apiKey) {
  const res = await fetch('https://api.deepgram.com/v1/listen?smart_format=true&punctuate=true', {
    method: 'POST',
    headers: {
      Authorization: `Token ${apiKey}`,
      'Content-Type': 'audio/wav'
    },
    body: blob
  });
  if (!res.ok) throw httpError(res.status, `Deepgram HTTP ${res.status}`);
  const json = await res.json();
  const text = json?.results?.channels?.[0]?.alternatives?.[0]?.transcript || '';
  return text.trim() || '[No speech detected]';
}

async function transcribeFireworks(blob, apiKey) {
  const form = new FormData();
  form.append('file', blob, 'audio.wav');
  form.append('model', 'whisper-large-v3'); // Adjust to your available model
  const res = await fetch('https://api.fireworks.ai/inference/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form
  });
  if (!res.ok) throw httpError(res.status, `Fireworks HTTP ${res.status}`);
  const json = await res.json();
  const text = json?.text || '';
  return text.trim() || '[No speech detected]';
}