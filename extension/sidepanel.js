const startTabBtn = document.getElementById("startTabBtn");
const startMicBtn = document.getElementById("startMicBtn");
const stopBtn = document.getElementById("stopBtn");
const transcriptDiv = document.getElementById("transcript");
const statusDiv = document.getElementById("status");
const exportBtn = document.getElementById("exportBtn");
const timerDiv = document.getElementById("timer");

let recorders = {};
let audioBuffers = {};
let overlapBuffers = {};
let startTime = null;
let timerInterval = null;

const CHUNK_MS = 5000;
const OVERLAP_MS = 1000;

// --- BUTTONS ---
startTabBtn.addEventListener("click", async () => {
    const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
    startTabRecording(tab.id, tab.title);
});

startMicBtn.addEventListener("click", async () => {
    try {
        await navigator.mediaDevices.getUserMedia({audio: true});
        startMicRecording();
    } catch {
        alert("Microphone permission denied!");
    }
});

stopBtn.addEventListener("click", () => stopAllRecordings());

// --- RECORDING FUNCTIONS ---
function startTabRecording(tabId, title) {
    chrome.tabCapture.capture({audio: true, video: false}, stream => {
        if (!stream) return console.error("Cannot capture tab audio");
        startRecorder(stream, `tab-${tabId}`, `Tab: ${title}`);
        statusDiv.innerText = `Recording Tab: ${title}`;
        startTimer();
    });
}

async function startMicRecording() {
    const stream = await navigator.mediaDevices.getUserMedia({audio: true});
    startRecorder(stream, "mic", "Microphone");
    statusDiv.innerText = "Recording Microphone";
    startTimer();
}

function startRecorder(stream, sourceKey, label) {
    const recorder = new MediaRecorder(stream);
    const buffer = [];
    recorders[sourceKey] = recorder;
    audioBuffers[sourceKey] = buffer;

    recorder.ondataavailable = e => buffer.push(e.data);
    recorder.start();

    setInterval(() => processChunk(sourceKey, label), CHUNK_MS);
}

function stopAllRecordings() {
    Object.values(recorders).forEach(r => r.stop());
    recorders = {};
    stopTimer();
    statusDiv.innerText = "Stopped";
}

// --- CHUNK PROCESS ---
async function processChunk(sourceKey, label) {
    const buffer = audioBuffers[sourceKey];
    if (!buffer.length) return;

    let chunkBlob = new Blob(buffer, {type: "audio/webm"});
    if (overlapBuffers[sourceKey]) {
        chunkBlob = new Blob([overlapBuffers[sourceKey], chunkBlob], {type: "audio/webm"});
    }

    overlapBuffers[sourceKey] = chunkBlob.slice(-OVERLAP_MS); // simple slice last 1 sec
    audioBuffers[sourceKey] = [];

    // send to service worker
    chrome.runtime.sendMessage({
        action: "transcribeChunk",
        chunk: chunkBlob,
        source: sourceKey
    });
}

// --- RECEIVE TRANSCRIPT ---
chrome.runtime.onMessage.addListener(message => {
    if (message.action === "transcriptionUpdate") {
        const timestamp = new Date().toLocaleTimeString();
        const label = message.source.startsWith("tab") ? "Tab Audio" : "Microphone";
        transcriptDiv.innerText += `[${timestamp}] [${label}] ${message.text}\n`;
        transcriptDiv.scrollTop = transcriptDiv.scrollHeight;
    }
});

// --- TIMER ---
function startTimer() {
    startTime = Date.now();
    timerInterval = setInterval(() => {
        const elapsed = Date.now() - startTime;
        timerDiv.innerText = `Recording: ${formatTime(elapsed)}`;
    }, 1000);
}

function stopTimer() {
    clearInterval(timerInterval);
    timerDiv.innerText = '';
}

function formatTime(ms) {
    const totalSec = Math.floor(ms / 1000);
    const min = String(Math.floor(totalSec / 60)).padStart(2, '0');
    const sec = String(totalSec % 60).padStart(2, '0');
    return `${min}:${sec}`;
}

// --- EXPORT ---
exportBtn.addEventListener("click", () => {
    const blob = new Blob([transcriptDiv.innerText], {type: "text/plain"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "transcript.txt";
    a.click();
    URL.revokeObjectURL(url);
});
