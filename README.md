# Aura Next — Premium Enterprise Workspace

Aura Next is a generative, secure, offline-first, and highly integrated note-taking platform designed for deep thinkers and enterprise teams. Built with a compact and elegant design inspired by Apple Notes, Aura integrates Google Gemini AI models directly into your workspace workflow.

---

## 🚀 Key Features

* **🧠 Gemini-Powered Intelligence**: Instantly summarize strategy specs, draft strategic OKRs, extract task checklists, or compose paragraphs using context-aware Gemini AI smart actions.
* **📂 Hybrid Sync Database Layer**: Combines an Express server connected to MongoDB with local JSON files (`notes-db.json`/`folders-db.json`) as a fail-safe fallback when offline or database is unconfigured.
* **⚡ Offline-First Redundancy**: Aura uses browser `localStorage` to cache modifications. When connection is restored, drafts are synchronized and reconciled back to the workspace database automatically.
* **🔒 Firebase Auth & Persistent Guests**: Complete Firebase auth integration (Sign In, Sign Up, Profile updates, password reset) alongside persistent simulated guest sessions for testing.
* **🎨 Elegant Apple Notes Aesthetic**: Tight card spacing, unified typography (Outfit & Inter), responsive split/preview modes, tag filters, locked notes, and customizable light, dark, or system-integrated themes.

---

## 🛠️ Technology Stack

* **Frontend**: React 19, TypeScript, Vite, Tailwind CSS v4, Motion (for animations), Lucide React
* **Backend**: Express, Node.js, Mongoose/MongoDB, Esbuild (bundle compiler)
* **Authentication**: Firebase Authentication
* **GenAI**: Google Gemini API via custom stateless server endpoints

---

## 💻 Getting Started

### 1. Prerequisites
Ensure you have [Node.js](https://nodejs.org/) installed (LTS version recommended).

### 2. Installation
Clone the repository and install the dependencies:
```bash
npm install
```

### 3. Environment Configuration
Create a `.env` file in the root directory by copying the example:
```bash
cp .env.example .env
```
Fill in the credentials in your `.env` file:
```env
# Server Configuration
MONGODB_URI="mongodb://localhost:27017/aura-notes"
GEMINI_API_KEY="YOUR_GEMINI_API_KEY"

# Client Firebase Configuration
VITE_FIREBASE_API_KEY="YOUR_FIREBASE_API_KEY"
VITE_FIREBASE_AUTH_DOMAIN="YOUR_FIREBASE_AUTH_DOMAIN"
VITE_FIREBASE_PROJECT_ID="YOUR_FIREBASE_PROJECT_ID"
VITE_FIREBASE_STORAGE_BUCKET="YOUR_FIREBASE_STORAGE_BUCKET"
VITE_FIREBASE_MESSAGING_SENDER_ID="YOUR_FIREBASE_MESSAGING_SENDER_ID"
VITE_FIREBASE_APP_ID="YOUR_FIREBASE_APP_ID"
```

### 4. Running the Application
Start both the Vite dev server and the Express API server concurrently:
```bash
npm run dev
```

### 5. Production Build
To build and package both the frontend Vite build and the backend server bundle:
```bash
npm run build
```
The output will be placed in the `dist/` directory.

---

## 🛡️ Privacy & Terms
* Read our complete [Privacy Policy](src/pages/PrivacyPage.tsx) for details on zero-knowledge note replication and Gemini API stateless processing.
* Read our [Terms of Service](src/pages/TermsPage.tsx) regarding workspace boundaries and client storage quotas.
