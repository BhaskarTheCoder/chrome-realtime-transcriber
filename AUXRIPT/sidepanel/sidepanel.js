let isRecording = false;
let timerInterval;
let seconds = 0;

// DOM elements
const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const recordingStatus = document.getElementById('recordingStatus');
const connectionStatus = document.getElementById('connectionStatus');
const errorStatus = document.getElementById('errorStatus');
const timer = document.getElementById('timer');
const transcriptDiv = document.getElementById('transcript');
const copyBtn = document.getElementById('copyBtn');
const downloadBtn = document.getElementById('downloadBtn');

startBtn.addEventListener('click', startRecording);
stopBtn.addEventListener('click', stopRecording);
copyBtn.addEventListener('click', copyTranscript);
downloadBtn.addEventListener('click', downloadTranscript);

chrome.action.onClicked.addListener((tab) => {
  chrome.windows.create({
    url: chrome.runtime.getURL("sidepanel.html"),
    type: "popup",
    width: 400,
    height: 600
  });
});


function startRecording() {
  isRecording = true;
  startBtn.disabled = true;
  stopBtn.disabled = false;
  recordingStatus.textContent = "Status: Recording";
  connectionStatus.textContent = "Connection: Online";
  errorStatus.textContent = "";

  // Start timer
  seconds = 0;
  timerInterval = setInterval(() => {
    seconds++;
    timer.textContent = formatTime(seconds);
  }, 1000);

  // Simulate live transcription (replace with actual API call)
  simulateTranscription();
}

function stopRecording() {
  isRecording = false;
  startBtn.disabled = false;
  stopBtn.disabled = true;
  recordingStatus.textContent = "Status: Stopped";
  connectionStatus.textContent = "Connection: Offline";

  clearInterval(timerInterval);
}

// Format time in MM:SS
function formatTime(sec) {
  const m = String(Math.floor(sec / 60)).padStart(2, '0');
  const s = String(sec % 60).padStart(2, '0');
  return `${m}:${s}`;
}

// Simulate transcription updates
function simulateTranscription() {
  if (!isRecording) return;

  const fakeText = ["Hello,", "this is a live", "transcription example.", "You can replace it", "with API results."];
  let i = 0;

  const interval = setInterval(() => {
    if (!isRecording || i >= fakeText.length) {
      clearInterval(interval);
      return;
    }

    const p = document.createElement('p');
    p.textContent = fakeText[i];
    transcriptDiv.appendChild(p);

    // Auto-scroll
    transcriptDiv.scrollTop = transcriptDiv.scrollHeight;

    i++;
  }, 1500);
}

// Copy transcript
function copyTranscript() {
  const text = transcriptDiv.innerText;
  navigator.clipboard.writeText(text)
    .then(() => alert("Copied to clipboard!"))
    .catch(err => errorStatus.textContent = "Error copying: " + err);
}

// Download transcript
function downloadTranscript() {
  const text = transcriptDiv.innerText;
  const blob = new Blob([text], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'transcript.txt';
  a.click();
  URL.revokeObjectURL(url);
}

document.getElementById('startBtn').addEventListener('click', async () => {
  chrome.runtime.sendMessage({ action: "startCapture" }, (response) => {
    if (response.success) {
      startRecordingUI();
    } else {
      document.getElementById('errorStatus').textContent = response.error;
    }
  });
});

function startRecordingUI() {
  // Existing UI logic from previous code
  const startBtn = document.getElementById('startBtn');
  const stopBtn = document.getElementById('stopBtn');
  startBtn.disabled = true;
  stopBtn.disabled = false;
  document.getElementById('recordingStatus').textContent = "Status: Recording";
  document.getElementById('connectionStatus').textContent = "Connection: Online";
  // Timer and transcription simulation logic here...
}
