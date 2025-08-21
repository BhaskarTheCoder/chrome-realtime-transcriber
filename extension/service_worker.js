const GEMINI_API_KEY = "AIzaSyBGHcSU4GHV8Jxt0YrTUTy7lEwwlb4W04w";
let retryQueue = [];

// Receive audio chunks from sidepanel
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "transcribeChunk") {
        transcribeAudio(message.chunk, message.source)
            .then(transcript => {
                chrome.runtime.sendMessage({
                    action: "transcriptionUpdate",
                    text: transcript,
                    source: message.source
                });
            })
            .catch(err => {
                console.error("Transcription failed, queued for retry", err);
                retryQueue.push({chunk: message.chunk, source: message.source, retries: 0});
            });
    }
    return true;
});

// --- TRANSCRIBE FUNCTION ---
async function transcribeAudio(blob, source) {
    const arrayBuffer = await blob.arrayBuffer();
    const base64Audio = arrayBufferToBase64(arrayBuffer);

    const response = await fetch("https://gemini.googleapis.com/v1/assistants:transcribe", {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${GEMINI_API_KEY}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            audio: base64Audio,
            config: { languageCode: "en-US" }
        })
    });

    const data = await response.json();
    return data.transcript || "";
}

// --- UTILITY ---
function arrayBufferToBase64(buffer) {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
}
