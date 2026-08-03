# Greenville CAD — Dispatch Console

A modern **Computer Aided Dispatch (CAD)** system for Greenville. Dispatcher-only — no login, no map, no MDT/officer portal. Hosted on [Render](https://render.com) via [GitHub](https://github.com/hamburger445/Dispatch-website).

## Deploy & Updates

All changes are deployed through GitHub:

1. Commit and push to `main` on [Dispatch-website](https://github.com/hamburger445/Dispatch-website)
2. Render auto-deploys from the latest push (if auto-deploy is enabled)

```bash
git add -A
git commit -m "Describe your change"
git push origin main
```

### First-time Render setup

1. In Render, click **New → Blueprint**
2. Connect [hamburger445/Dispatch-website](https://github.com/hamburger445/Dispatch-website)
3. Render reads `render.yaml`:
   - **Build:** `npm install && npm run build`
   - **Start:** `npm start`
   - **Health check:** `/api/health`

| Setting | Value |
|---------|--------|
| Runtime | Node |
| Build Command | `npm install && npm run build` |
| Start Command | `npm start` |
| Environment | `NODE_ENV=production` |

**Data persistence:** On Render’s free plan, data resets on redeploy. For persistent SQLite storage, upgrade to Starter and set `DATABASE_PATH=/var/data/cad.db` with a mounted disk.

## Features

- **Dashboard** — Active, pending, and closed calls; online, available, and busy units; live clock; recent activity
- **Unit management** — Create, edit, remove units; one-click status changes
- **Call management** — Create, edit, delete, close, cancel incidents with full location and notes fields
- **Unit assignment** — Attach/detach units to calls with time-assigned tracking
- **Traffic stops** — Dedicated workflow with location, plate, vehicle, notes; stored in history
- **Activity log** — Automatic audit trail with timestamps
- **Search** — Incident #, callsign, officer, department, address
- **Reports** — Incident reports, active/closed calls, activity log — export to **PDF** and **CSV**
- **Dark theme** by default with optional light theme

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| Ctrl+N | New call |
| Ctrl+U | Add unit |
| Ctrl+F | Search |
| Esc | Close dialogs |

## Project Structure

```
dispatch/
├── backend/          Server, API, SQLite
├── frontend/         React dispatch UI
├── database/         cad.db (auto-created on server)
├── render.yaml       Render deployment config
└── README.md
```

## Departments

WSP · OCSO · GVFD · WISDOT

## Unit Statuses

10-8 · 10-6 · 10-7 · 10-15 · 10-97 · 10-23 · Traffic Stop · Report Writing · Returning · Signal 11 · Custom
