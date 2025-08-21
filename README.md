chrome-realtime-transcriber/
├─ extension/
│  ├─ manifest.json        # Chrome extension manifest (v3)
│  ├─ service_worker.js    # Background service worker
│  ├─ sidepanel.html       # Sidepanel UI
│  ├─ sidepanel.js         # Sidepanel logic (UI updates, API calls)
│  ├─ sidepanel.css        # Sidepanel styles
│  ├─ audioProcessor.js    # Handles audio capture & chunking
│  ├─ apiClient.js         # Handles transcription API integration
│  ├─ storage.js           # Manage local transcript storage
│  ├─ utils.js             # Helper functions
│  ├─ icons/               # Extension icons (16/48/128 px)
│  └─ assets/              # Any static assets
├─ scripts/
│  └─ setup.sh             # Environment setup script (optional for Linux/macOS)
├─ .eslintrc.json          # ESLint config
├─ package.json            # Node dev dependencies
├─ README.md               # Setup & usage instructions
