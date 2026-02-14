# 🎙️ Real-Time Audio Transcriber

<div align="center">

![Chrome Extension](https://img.shields.io/badge/Chrome-Extension-4285F4?style=for-the-badge&logo=googlechrome&logoColor=white)
![Version](https://img.shields.io/badge/version-2.0.0-blue?style=for-the-badge)
![License](https://img.shields.io/badge/license-MIT-green?style=for-the-badge)

**A modern Chrome extension that captures and transcribes audio in real-time using AI**

[Features](#-features) • [Installation](#-installation) • [Usage](#-usage) • [Tech Stack](#-tech-stack) • [Screenshots](#-screenshots)

</div>

---

## 📖 Overview

Real-Time Audio Transcriber is a powerful Chrome extension that captures audio from browser tabs and microphone input, then transcribes it in real-time using advanced AI models. Perfect for meetings, lectures, podcasts, videos, and any audio content you want to convert to text instantly.

### 🎯 Key Highlights

- **Multi-Source Audio Capture**: Record from browser tabs and microphone simultaneously
- **AI-Powered Transcription**: Support for multiple AI providers (Gemini, OpenAI Whisper, Deepgram, Fireworks)
- **Real-Time Processing**: See transcriptions appear as audio plays
- **Offline Queue**: Automatically queues chunks when offline and processes when connection returns
- **Modern UI**: Beautiful glassmorphism design with smooth animations
- **Export Options**: Download as .txt or .json, or copy to clipboard
- **Smart Chunking**: Configurable chunk size with overlap for better accuracy

---

## ✨ Features

### 🎧 Audio Capture
- **Tab Audio**: Capture audio from any browser tab (YouTube, meetings, podcasts, etc.)
- **Microphone Input**: Include your voice in the transcription
- **Dual Source**: Record both tab and microphone simultaneously
- **High Quality**: 48kHz sample rate with PCM audio processing

### 🤖 AI Transcription
- **Multiple Providers**: 
  - Google Gemini (Flash & Pro models)
  - OpenAI Whisper
  - Deepgram Nova
  - Fireworks AI
- **Provider Fallback**: Automatically tries alternative providers if primary fails
- **Customizable Models**: Choose specific AI models for your needs
- **Smart Chunking**: 30-second chunks with 3-second overlap for context continuity

### 💾 Data Management
- **Real-Time Display**: See transcriptions appear instantly
- **Offline Queue**: Audio chunks queued when offline, processed when back online
- **Persistent Storage**: Transcripts saved locally
- **Export Formats**:
  - Plain text (.txt)
  - JSON with timestamps (.json)
  - Clipboard copy

### 🎨 User Experience
- **Modern UI**: Glassmorphism design with vibrant gradients
- **Smooth Animations**: Polished transitions and micro-interactions
- **Recording Indicators**: Pulsing status with color-coded states
- **Toast Notifications**: Non-intrusive feedback messages
- **Fully Responsive**: Works perfectly at any sidepanel width
- **Dark Theme**: Eye-friendly gradient background

### ⚙️ Configuration
- **Provider Selection**: Choose your preferred AI service
- **API Key Management**: Secure local storage of credentials
- **Chunk Settings**: Adjust duration and overlap
- **Fallback Options**: Enable/disable automatic provider switching

---

## 🚀 Installation

### Prerequisites
- Google Chrome browser (latest version recommended)
- API key from at least one transcription provider

### Steps

1. **Clone the repository**
   ```bash
   git clone https://github.com/BhaskarTheCoder/chrome-realtime-transcriber.git
   cd chrome-realtime-transcriber
   ```

2. **Load the extension**
   - Open Chrome and navigate to `chrome://extensions/`
   - Enable "Developer mode" (toggle in top right)
   - Click "Load unpacked"
   - Select the `AUXRIPT` directory from the cloned repository

3. **Get API Keys** (choose one or more)
   - **Gemini**: [Google AI Studio](https://makersuite.google.com/app/apikey) (Free tier available)
   - **OpenAI**: [OpenAI Platform](https://platform.openai.com/api-keys)
   - **Deepgram**: [Deepgram Console](https://console.deepgram.com/)
   - **Fireworks**: [Fireworks AI](https://fireworks.ai/)

4. **Configure the extension**
   - Click the extension icon in Chrome toolbar
   - Open Settings (⚙️)
   - Select your provider
   - Enter your API key
   - Click "Save Settings"

---

## 📱 Usage

### Quick Start

1. **Grant Microphone Permission** (if using mic)
   - Click "Grant Microphone Access" when prompted
   - Allow permission in Chrome's dialog

2. **Select Audio Source**
   - Choose a tab from the dropdown or use "Current Tab"
   - Check "Microphone" if you want to include your voice

3. **Start Recording**
   - Click the **START** button
   - The extension begins capturing and transcribing

4. **Control Recording**
   - **Pause/Resume**: Temporarily pause transcription
   - **Stop**: End the recording session

5. **Export Transcript**
   - **Copy**: Copy to clipboard
   - **Download .txt**: Save as plain text
   - **Download .json**: Save with timestamps and metadata

### Advanced Configuration

**Chunk Settings**
- **Duration**: 5-120 seconds (default: 30s)
- **Overlap**: 0-10 seconds (default: 3s)
- Longer chunks = fewer API calls but slower real-time feedback
- Overlap ensures context continuity between chunks

**Provider Fallback**
- Enable to automatically try alternative providers if primary fails
- Useful for reliability and handling rate limits

---

## 🛠️ Tech Stack

### Core Technologies
- **Manifest V3**: Latest Chrome extension architecture
- **Web Audio API**: High-quality audio capture and processing
- **AudioWorklet**: Real-time PCM audio processing
- **Offscreen Documents**: Background audio processing
- **Service Workers**: Efficient background operations

### Frontend
- **HTML5**: Semantic structure
- **CSS3**: Modern styling with custom properties
- **JavaScript (ES6+)**: Async/await, modules
- **Google Fonts**: Inter font family

### Design
- **Glassmorphism**: Frosted glass aesthetic
- **CSS Animations**: Smooth transitions
- **Responsive Layout**: Flexbox-based
- **Color System**: CSS custom properties

### AI Integration
- **Google Gemini API**: Multimodal AI transcription
- **OpenAI Whisper API**: Speech-to-text
- **Deepgram API**: Real-time transcription
- **Fireworks AI API**: Fast inference

---

## 📸 Screenshots

### Main Interface
Beautiful glassmorphism UI with real-time transcription display

### Recording States
- 🔴 **Recording**: Pulsing red indicator
- 🟡 **Paused**: Yellow indicator
- ⚫ **Stopped**: Gray indicator

### Settings Panel
Comprehensive configuration options for providers, models, and chunking

### Permission Banner
Clear microphone permission request with one-click access

---

## 🏗️ Architecture

```
AUXRIPT/
├── manifest.json          # Extension configuration (Manifest V3)
├── service_worker.js      # Background service worker
├── offscreen.html         # Offscreen document for audio
├── offscreen.js           # Audio capture & transcription logic
├── pcm-worklet.js         # AudioWorklet processor
├── sidepanel/
│   ├── sidepanel.html     # UI structure
│   ├── sidepanel.css      # Modern styling
│   └── sidepanel.js       # UI logic & event handlers
└── icons/                 # Extension icons (16/48/128px)
```

### Data Flow

1. **Audio Capture**: Tab/mic audio → AudioWorklet → PCM processing
2. **Chunking**: Audio buffered into 30s chunks with 3s overlap
3. **Transcription**: Chunks sent to AI provider API
4. **Display**: Results shown in real-time in sidepanel
5. **Storage**: Transcripts saved locally, queue persisted

---

## 🔒 Security & Privacy

- **No Hardcoded Keys**: Users provide their own API keys
- **Local Storage**: All data stored locally in Chrome
- **Direct API Calls**: Audio sent directly to chosen provider (no intermediary)
- **Minimal Permissions**: Only requests necessary Chrome permissions
- **No Tracking**: No analytics or user tracking
- **Open Source**: Full code transparency

---

## 🎓 Use Cases

- **Online Meetings**: Transcribe Zoom, Google Meet, Teams calls
- **Educational Content**: Convert lectures and tutorials to text
- **Podcasts**: Create transcripts of podcast episodes
- **YouTube Videos**: Generate captions for videos
- **Accessibility**: Help hearing-impaired users
- **Note-Taking**: Capture important audio content
- **Content Creation**: Transcribe interviews and recordings
- **Language Learning**: See transcriptions while listening

---

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

### Development Setup

```bash
# Clone the repository
git clone https://github.com/BhaskarTheCoder/chrome-realtime-transcriber.git

# Install dev dependencies (optional, for linting)
npm install

# Run linter
npm run lint
```

### Guidelines
- Follow existing code style
- Test thoroughly before submitting
- Update documentation as needed
- Keep commits focused and descriptive

---

## 📝 Version History

### v2.0.0 (Current) - February 2026
- ✨ Complete UI modernization with glassmorphism design
- 🔒 Removed hardcoded API keys for security
- ✅ Added input validation and error handling
- 🎨 Implemented smooth animations and transitions
- 📱 Made fully responsive for all sidepanel widths
- 🎤 Added microphone permission handling
- 📦 Enhanced export with timestamped filenames
- 🐛 Fixed chrome.storage access in offscreen documents
- 💾 Improved offline queue management

### v1.1.0 - Initial Release
- Basic transcription functionality
- Single provider support
- Simple UI

---

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

---

## 🙏 Acknowledgments

- **Google Gemini** - Advanced AI transcription
- **OpenAI Whisper** - High-quality speech-to-text
- **Deepgram** - Real-time transcription service
- **Fireworks AI** - Fast inference platform
- **Chrome Extensions Team** - Excellent documentation
- **Open Source Community** - Inspiration and support

---

## 💡 Tips & Best Practices

### For Best Results
- Use headphones to prevent audio feedback when recording with microphone
- Keep chunk size at 30 seconds for optimal balance
- Enable provider fallback for reliability
- Ensure stable internet connection for real-time transcription
- Check API provider pricing and rate limits

### Troubleshooting

**Extension won't start recording:**
- Verify API key is entered and saved
- Check microphone permission if using mic
- Ensure you're on a tab with audio content

**No transcription appearing:**
- Check internet connection
- Verify API key is valid and has credits
- Check browser console for errors (F12)

**Audio quality issues:**
- Ensure system audio is not muted
- Verify browser tab audio is playing
- Try adjusting chunk size settings

---

## 📧 Contact & Support

- **GitHub Issues**: [Report bugs or request features](https://github.com/BhaskarTheCoder/chrome-realtime-transcriber/issues)
- **Developer**: Uday Bhaskar Valapadasu
- **LinkedIn**: [Connect on LinkedIn](https://www.linkedin.com/in/udaybhaskarvalapadasu)

---

<div align="center">

**⭐ Star this repository if you find it helpful!**

Made with ❤️ for better accessibility and productivity

</div>
