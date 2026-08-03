# Greenville CAD — Dispatch Console

A modern **Computer Aided Dispatch (CAD)** system for Greenville. Dispatcher-only — no login, no map, no MDT/officer portal.

## Quick Start (Windows)

1. Install [Node.js 18+](https://nodejs.org)
2. Double-click **`Start.bat`**
3. The dispatch console opens at **http://localhost:3000**

## Deploy to Render

This repo is ready to deploy as a single Node.js web service on [Render](https://render.com).

1. Push this repo to GitHub (see below).
2. In Render, click **New → Blueprint** and connect [Dispatch-website](https://github.com/hamburger445/Dispatch-website).
3. Render uses `render.yaml` automatically:
   - **Build:** `npm install && npm run build`
   - **Start:** `npm start`
   - **Health check:** `/api/health`
4. After deploy, open your Render URL (e.g. `https://dispatch-website.onrender.com`).

**Data persistence:** `render.yaml` mounts a 1 GB disk at `/var/data` for the SQLite database. Persistent disks require a **Starter** plan or higher on Render. On the free plan, remove the `disk` section from `render.yaml` — the app will still run, but data resets on redeploy.

**Manual setup (without Blueprint):**

| Setting | Value |
|---------|--------|
| Runtime | Node |
| Build Command | `npm install && npm run build` |
| Start Command | `npm start` |
| Environment | `NODE_ENV=production` |
| Optional | `DATABASE_PATH=/var/data/cad.db` (with persistent disk) |

## Features

- **Dashboard** — Active, pending, and closed calls; online, available, and busy units; live clock; recent activity
- **Unit management** — Create, edit, remove units; one-click status changes
- **Call management** — Create, edit, delete, close, cancel incidents with full location and notes fields
- **Unit assignment** — Attach/detach units to calls with time-assigned tracking
- **Traffic stops** — Dedicated workflow with location, plate, vehicle, reason, notes; stored in history
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
├── Start.bat
├── backend/          Server, API, SQLite
├── frontend/         React dispatch UI
├── database/         cad.db (auto-created)
├── logs/             startup.log
└── README.md
```

## Departments

WSP · OCSO · GVFD · WISDOT

## Unit Statuses

10-8 · 10-6 · 10-7 · 10-15 · 10-97 · 10-23 · Traffic Stop · Report Writing · Returning · Signal 11 · Custom

## Data

All data persists in `database/cad.db` between restarts. Delete that file to reset the database.

## Stopping

Close the **Greenville CAD Server** window.
