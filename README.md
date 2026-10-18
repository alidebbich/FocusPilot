# FocusPilot AI

> **Privacy-conscious AI productivity and learning assistant for Windows.**

Built with Electron, React 18, TypeScript, Tailwind CSS, Vite, and SQLite (`better-sqlite3`).

---

## 🚀 Key Features

1. **AI Assistant**
   - Interactive chat with Google Gemini models (Gemini 1.5 Flash, 1.5 Pro, 2.0 Flash) and multi-provider extensibility.
   - Streaming responses with Markdown and code block syntax highlighting.
   - Full conversation history stored locally in SQLite with fast search and management.

2. **Technical Interview Practice**
   - Mock interviews across 10 technical domains: JavaScript, TypeScript, React, Angular, Node.js, Databases, APIs, System Design, Algorithms, and General Engineering.
   - Three selectable difficulty tiers (Beginner, Intermediate, Advanced).
   - Dynamic real-time interviewer persona asking adaptive follow-up questions and generating structured scorecards (clarity, depth, correctness, feedback).

3. **Coding Practice**
   - Curated coding challenges with instant hints, solution discussions, and code review.
   - Interactive prompt templates for code explanation, refactoring, complexity analysis, and edge case generation.

4. **Audio Transcription**
   - Browser Web Speech API real-time microphone capture with explicit user-controlled toggle.
   - Automatic AI post-processing: instant meeting / lecture summary, key takeaways, and action items extraction.
   - Clear visual recording indicator with privacy badge ensuring zero silent capture.

5. **Screen Analysis**
   - Explicit user-triggered desktop screen or window capture using Electron's `desktopCapturer`.
   - Real-time preview with confirmation before any image data is analyzed.
   - Multimodal image reasoning: OCR, UI review, code debugging, and step-by-step problem solving.

6. **Local Notes & History**
   - Comprehensive searchable tabbed view of notes, past conversations, interview reports, and meeting transcripts.
   - Full-text search and tag filtering.

7. **Security & Key Management**
   - API keys are **never stored in plaintext** and **never committed to Git**.
   - Keys are encrypted using AES-256-GCM with machine-derived entropy and stored in the user's OS application data directory (`%APPDATA%/focuspilot`).
   - One-click "Delete All Data" option for complete privacy control.

8. **System Diagnostics**
   - Real-time status reporting on database connectivity, encryption status, provider configurations, screen capture permissions, and speech recognition capability.

---

## 🔒 Security Architecture

- **Context Isolation & Sandboxing**: `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, and `webSecurity: true`.
- **Minimal Typed Preload**: Renderer has access only to a strictly defined, validated `window.api` bridge.
- **Safe External Navigation**: All external hyperlinks are intercepted and launched in the user's default browser via `shell.openExternal`. No arbitrary new electron windows or child frames.
- **SQL Injection Prevention**: All SQLite queries are strictly parameterized; WAL journal mode ensures data integrity.
- **Zero Background Ingestion**: Transcription and screen capture require explicit, user-initiated action.

---

## 🛠️ Getting Started

### Prerequisites
- Windows 10/11
- Node.js (v18+)
- npm

### Installation
```bash
npm install
```

### Development
Launch both the Vite dev server and Electron window simultaneously:
```bash
npm run dev
```

Or start the built app directly:
```bash
npm start
```

### Production Build
Builds both the Vite frontend bundle and TypeScript main process:
```bash
npm run build
```

### Testing
- **Unit & Logic Tests** (Vitest):
  ```bash
  npm run test
  ```
- **Electron Native SQLite Integration Test**:
  ```bash
  npm run test:electron
  ```
- **App Launch Verification**:
  ```bash
  node tests/launch.test.js
  ```

---

## 📁 Directory Structure

```
focuspilot/
├── src/
│   ├── main/
│   │   ├── database/         # SQLite schema, PRAGMA migrations, CRUD
│   │   ├── ipc/              # Typed IPC handlers (AI, keys, DB, screen, diag)
│   │   ├── providers/        # AI provider integrations (Gemini, etc.)
│   │   ├── index.ts          # Main process entry, window lifecycle, security
│   │   └── preload.ts        # Sandboxed contextBridge API
│   ├── renderer/
│   │   ├── components/       # Layout, Sidebar, Toast, Nav
│   │   ├── context/          # Settings & App context
│   │   ├── pages/            # Dashboard, Assistant, Interview, Coding,
│   │   │                     # Transcription, Screen, Notes, Settings, About
│   │   ├── App.tsx           # React routing & app root
│   │   ├── main.tsx          # React DOM entry
│   │   └── index.css         # Dark theme & Bento design styling
│   └── shared/
│       └── types.ts          # Shared TypeScript contracts & IPC channels
├── tests/
│   ├── unit.test.ts          # Vitest unit test suite
│   ├── electron-db.test.js   # Electron SQLite verification
│   └── launch.test.js        # Window startup lifecycle test
├── package.json
├── tsconfig.json
├── tsconfig.main.json
├── tailwind.config.js
└── vite.config.ts
```
