<div align="center">

<img src="https://img.shields.io/badge/FocusPilot-AI%20Desktop%20Assistant-7c3aed?style=for-the-badge&logo=electron&logoColor=white" alt="FocusPilot" />

<br/><br/>

<img src="https://img.shields.io/badge/Electron-36-47848F?style=flat-square&logo=electron&logoColor=white" />
<img src="https://img.shields.io/badge/React-18-61DAFB?style=flat-square&logo=react&logoColor=black" />
<img src="https://img.shields.io/badge/TypeScript-5.8-3178C6?style=flat-square&logo=typescript&logoColor=white" />
<img src="https://img.shields.io/badge/Gemini-2.5%20Flash-4285F4?style=flat-square&logo=google&logoColor=white" />
<img src="https://img.shields.io/badge/SQLite-3-003B57?style=flat-square&logo=sqlite&logoColor=white" />
<img src="https://img.shields.io/badge/License-MIT-22c55e?style=flat-square" />

<br/><br/>

**FocusPilot** is a privacy-conscious AI productivity assistant for Windows — a floating desktop overlay that fuses real-time screen analysis, live audio transcription, and Gemini AI to answer questions, coach interviews, and explain anything on your screen without leaving your workflow.

<br/>

[✦ Features](#-features) · [⚡ Quick Start](#-quick-start) · [⚙️ Configuration](#️-configuration) · [🏗 Architecture](#-architecture) · [🤝 Contributing](#-contributing)

</div>

---

## ✦ Features

| Feature | Description |
|---------|-------------|
| 🤖 **AI Chat** | Stream responses from Gemini 2.5 Flash/Pro with full conversation history |
| 📺 **Screen Analysis** | Capture & analyze your screen — explains code, errors, UIs, and documents |
| 🎙️ **Live Transcription** | Real-time speech-to-text using Gemini multimodal audio (16kHz WAV pipeline) |
| 🔗 **Context Fusion** | Automatically merges screen + audio context into every AI query |
| 🎯 **Interview Coach** | Practice technical interviews with per-answer AI scoring & feedback |
| ⌨️ **Coding Practice** | Paste any code for instant explanation, debugging, and refactoring |
| 📝 **Notes & History** | Full conversation history with tagging, search, and export |
| 🔒 **Privacy First** | All data stays local (SQLite). API keys are AES-256-GCM encrypted on-disk. No telemetry. |
| 🖥️ **Floating Overlay** | Always-on-top transparent window with collapse, opacity, and content-protection controls |
| ⌨️ **Global Hotkey** | Toggle visibility from any application with `Ctrl+Shift+Space` |

---

## ⚡ Quick Start

### Prerequisites

- **Node.js** ≥ 18 (LTS recommended)
- **Windows** 10 / 11 (primary platform; macOS partially supported)
- A **[Google Gemini API key](https://aistudio.google.com/apikey)** (free tier available)

### Installation

```bash
# 1. Clone the repository
git clone https://github.com/alidebbich/FocusPilot.git
cd FocusPilot

# 2. Install dependencies
npm install

# 3. Start in development mode
npm run dev
```

The app will launch as a floating overlay. On first run, go to **Settings → AI Provider** and enter your Gemini API key.

### Production Build & Packaging

```bash
# 1. Compile both renderer (Vite) and main process (tsc)
npm run build

# 2. Package into Windows distributable (.exe NSIS installer & portable .exe)
npm run dist:win

# Or unpack directly to test the bundle:
npm run pack
```

Distributables are generated in the `release/` folder:
- **`FocusPilot Setup 1.0.0.exe`** — Standard Windows NSIS installer with desktop/start menu shortcuts
- **`FocusPilot 1.0.0.exe`** — Standalone portable executable (runs anywhere with zero installation)

### 🚀 CI/CD Automated Releases

A GitHub Actions workflow is included (`.github/workflows/build-and-release.yml`). To automatically build and attach Windows `.exe` installers to a GitHub Release:

```bash
git tag v1.0.0
git push origin v1.0.0
```

Or trigger manually under the **Actions** tab on GitHub via `workflow_dispatch`.

---

## ⚙️ Configuration

### API Key Setup (Required)

FocusPilot stores your API key **encrypted on-disk** — it is never stored in plain text or committed to source control.

1. Open FocusPilot
2. Click **Settings** (⚙️ icon)
3. Under **AI Provider → API Key**, paste your Gemini key
4. Click **Save** — then optionally **Test Connection** to verify

> **Get a free key:** https://aistudio.google.com/apikey

### Environment Variable (Optional)

You can also set the key via environment variable (useful for CI or headless testing):

```bash
# Create a .env file (never commit this!)
cp .env.example .env
# Edit .env and add:
GEMINI_API_KEY=your_key_here
```

### Available Settings

| Setting | Default | Description |
|---------|---------|-------------|
| Model | `gemini-2.5-flash` | AI model to use |
| Temperature | `0.7` | Response creativity (0 = precise, 1 = creative) |
| Max Tokens | `4096` | Maximum response length |
| Window Opacity | `0.95` | Overlay transparency |
| Always on Top | `false` | Keep window above all others |
| Exclude from Capture | `true` | Hide FocusPilot from screen recordings |
| Auto-Answer Questions | `true` | Automatically answer detected questions from audio |

---

## 🏗 Architecture

```
FocusPilot/
├── src/
│   ├── main/                         # Electron main process (Node.js)
│   │   ├── index.ts                  # App entry, window, global shortcuts
│   │   ├── preload.ts                # Secure context bridge
│   │   ├── database/db.ts            # SQLite schema + parameterized queries
│   │   ├── providers/geminiProvider.ts  # Gemini streaming AI + model validation
│   │   └── ipc/
│   │       ├── aiHandlers.ts         # Streaming AI + abort
│   │       ├── audioHandlers.ts      # Gemini multimodal audio STT
│   │       ├── screenHandlers.ts     # desktopCapturer + change-detection
│   │       ├── dbHandlers.ts         # CRUD for all data entities
│   │       ├── keyHandlers.ts        # AES-256-GCM encrypted key storage
│   │       └── settingsHandlers.ts   # Persistent settings
│   │
│   ├── renderer/                     # React renderer (Vite / Chromium)
│   │   ├── pages/
│   │   │   ├── AIAssistant.tsx       # Chat UI with streaming + history
│   │   │   ├── FloatingAssistant.tsx # Compact overlay mode
│   │   │   ├── ScreenAnalysis.tsx    # Screen capture + AI analysis
│   │   │   ├── Transcription.tsx     # Live audio transcription
│   │   │   ├── InterviewPractice.tsx # AI interview coach
│   │   │   ├── CodingPractice.tsx    # Code explainer / debugger
│   │   │   ├── Dashboard.tsx         # Stats & quick actions
│   │   │   ├── NotesHistory.tsx      # Saved sessions
│   │   │   └── Settings.tsx          # API key + preferences
│   │   ├── services/
│   │   │   ├── audio/
│   │   │   │   ├── AudioCaptureService.ts   # getUserMedia + VAD + WAV encoding
│   │   │   │   ├── SttAdapter.ts            # Gemini STT + Web Speech adapters
│   │   │   │   └── QuestionDetector.ts      # Question detection + dedup
│   │   │   └── fusion/
│   │   │       └── ContextFusionService.ts  # Screen + audio context merger
│   │   └── context/                  # React contexts
│   │
│   └── shared/types.ts               # IPC channel names + shared types
│
└── tests/
    ├── unit.test.ts                  # Settings, DB, IPC, window tests
    └── audio-fusion.test.ts          # Full audio pipeline (11 requirements)
```

### IPC Security Model

```
Renderer (sandboxed) ──► preload.ts (contextBridge) ──► Main Process
                              ↑ whitelisted API only
                              ↑ nodeIntegration: false
                              ↑ contextIsolation: true
                              ↑ sandbox: true
```

---

## 🧪 Testing

```bash
# Run all unit + integration tests
npm test

# Watch mode
npm run test:watch

# TypeScript type checks
npm run typecheck        # renderer
npm run typecheck:main   # main process
```

---

## 🔒 Privacy & Security

- **No telemetry** — FocusPilot never phones home
- **Local-only data** — SQLite database in your user data directory
- **Encrypted keys** — AES-256-GCM stored in app data, never in source code
- **Content protection** — Excluded from screen recordings by default (`WDA_EXCLUDEFROMCAPTURE`)
- **Sandboxed renderer** — `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`

---

## 🛠 Tech Stack

| Layer | Technology |
|-------|-----------|
| Desktop Shell | [Electron 36](https://www.electronjs.org/) |
| UI Framework | [React 18](https://react.dev/) + [TypeScript 5.8](https://www.typescriptlang.org/) |
| Bundler | [Vite 6](https://vitejs.dev/) |
| Styling | [Tailwind CSS 3](https://tailwindcss.com/) |
| AI Provider | [Google Gemini API](https://ai.google.dev/) |
| Database | [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) (WAL mode) |
| Routing | [React Router 6](https://reactrouter.com/) |
| Testing | [Vitest](https://vitest.dev/) |

---

## 🎛️ Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+Shift+Space` | Toggle FocusPilot visibility |
| `Alt+Shift+Space` | Toggle (fallback) |
| `Enter` | Send chat message |
| `Shift+Enter` | New line in chat |

---

## 📋 Known Limitations

- **Windows primary** — Tested on Windows 10/11. macOS builds should work but are not actively tested.
- **System audio loopback** — Requires a loopback device (e.g. Stereo Mix, VB-Cable) for system audio capture.
- **API key entropy** — The current encryption seed has low entropy. For stronger isolation, integrate [keytar](https://github.com/atom/node-keytar).

---

## 🤝 Contributing

1. Fork this repository
2. Create a feature branch: `git checkout -b feature/your-feature`
3. Ensure `npm test` passes and `npm run typecheck` is clean
4. Commit: `git commit -m "feat: describe your change"`
5. Push: `git push origin feature/your-feature`
6. Open a Pull Request against `main`

---

## 📄 License

MIT © [Ali Debbich](https://github.com/alidebbich)

---

<div align="center">

Built with ❤️ using Electron, React, and Google Gemini

⭐ **Star this repo if FocusPilot helps you stay in flow!**

</div>
