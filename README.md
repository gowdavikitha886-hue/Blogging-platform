# BlogSphere AI

A modern, responsive, **AI-powered blogging platform** — upgraded from a single-page editor into a complete writing and publishing product with authentication, full blog CRUD, an AI assistant, SEO tooling and writing analytics.

> Architecture note: per project requirements this build stays **client-side** — no server, no build step, no npm dependencies. Just open it and write.

---

## Features

**UI/UX**
- Refined dark **and** light themes (charcoal surfaces, purple→cyan gradient accents) with a working toggle + system-default option.
- Consistent components (buttons, inputs, selects, cards, modals, chips, chips, tables), hover effects, transitions, skeletons and toasts.
- Fully responsive (desktop / tablet / mobile), keyboard accessible, reduced-motion friendly.

**Editor**
- Compact nav (logo, Explore, Dashboard, Saved, Write, profile menu, theme toggle).
- Editor header with back button, draft status and last-saved time.
- Title with live character count; excerpt with a 120–160 char meter.
- Category select + tag chips, featured image (URL or upload).
- Rich text: bold, italic, H2, H3, bullet/numbered lists, blockquote, link, image, undo, redo, clear formatting.
- Distraction-free focus mode, live preview drawer, sticky Save Draft / Publish bar.
- Stats: words, characters, reading time + a completion progress ring. Autosave.
- Sidebar widgets: Publishing, SEO (live score + checklist), AI assistant.

**Auth & users**
- Register, login, logout, change password, security-question password recovery.
- **PBKDF2-SHA256** password hashing (random salt, 150k iterations) via WebCrypto — never plaintext.
- 7-day session tokens; protected routes; ownership checks on every mutation.
- Profile pages (name, avatar, bio) and settings (profile, account, appearance, AI, data).

**CRUD**
- Create, save draft, edit, view, publish/unpublish, archive/restore, delete (with confirmation).
- Search by title/content/author/tag; filter by category/tag/status; sort; pagination.
- Likes, bookmarks (Saved library), comments; dashboard analytics; export/import/reset.

**AI (optional)**
- Built-in **offline** assistant: titles, excerpt, TL;DR, tags, outline, improve, SEO, proofread.
- Optional **live** mode: any OpenAI-compatible `/chat/completions` endpoint (base URL + key + model).

---

## Getting started

No install required.

**Option A — just open it**
Double-click `index.html`.

**Option B — local server (recommended)**
```powershell
python -m http.server 5500
# open http://localhost:5500
```
or
```powershell
npx serve .
```

**First run**
1. Click **Start writing** and register.
2. Open **Write**, add a title and body — stats and SEO score update live.
3. Try the AI sidebar, then **Save draft** or **Publish**.
4. Optional: Home → **Load sample articles**.
5. Optional: **Settings → AI assistant** to connect a live endpoint.

---

## Project structure

```
Blogging-platform/
├─ index.html               # App shell
├─ css/styles.css           # Design system (tokens, components, responsive, print)
├─ js/
│  ├─ core.js               # window.BS — store, migrations, crypto/auth, CRUD, AI
│  └─ app.js                # Router, views, editor, settings, events
├─ docs/documentation.html  # Full technical docs (print to PDF)
└─ README.md
```

---

## Documentation

Open `docs/documentation.html` in a browser and click **Print / Save as PDF** (or `Ctrl+P`) for a complete technical manual covering architecture, the data model, the auth/security design, the `BS` JavaScript API, keyboard shortcuts, setup and limitations.

## Deployment

The project is deployed to GitHub Pages whenever a commit is pushed to `main`. After the first deployment completes, open:

https://gowdavikitha886-hue.github.io/Blogging-platform/

The deployment workflow is in `.github/workflows/deploy.yml`. GitHub Pages must use **GitHub Actions** as its build and deployment source (in **Settings → Pages**) if it is not configured automatically on the first run.

---

## Data & privacy

- All data is stored locally in your browser (`localStorage`, key `blogsphere.ai.v2`).
- Passwords are stored only as salted PBKDF2 hashes.
- AI keys (if used) are stored locally and sent only to the endpoint you configure.
- Export/import and an erase-all option are available in **Settings → Data**.

> Because this is intentionally a client-side build, it is best suited to personal use, demos and prototypes. For production multi-user deployments, move auth and data to a server.

---

## Keyboard shortcuts (editor)

| Shortcut | Action |
| --- | --- |
| `Ctrl+B` | Bold |
| `Ctrl+I` | Italic |
| `Ctrl+K` | Insert link |
| `Ctrl+S` | Save draft |
| `Enter` / `,` | Add tag |
| `Esc` | Exit focus / close preview |

---

## Tech

Plain HTML, CSS and JavaScript. No frameworks, no bundler, no dependencies.
