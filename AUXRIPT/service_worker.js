chrome.runtime.onInstalled.addListener(() => {
  console.log("Extension Installed");
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "startCapture") {
    startTabCapture(sendResponse);
    return true; // keeps the message channel open for async response
  }
});

async function startTabCapture(sendResponse) {
  try {
    const stream = await chrome.tabCapture.capture({ audio: true, video: false });
    console.log("Tab audio captured:", stream);
    sendResponse({ success: true });
    // You can now send `stream` to your transcription API
  } catch (error) {
    console.error("Error capturing tab audio:", error);
    sendResponse({ success: false, error: error.message });
  }
}
