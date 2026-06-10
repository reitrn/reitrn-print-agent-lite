# reitrn Print Agent Lite

Lightweight, **local-only** Electron tray app that prints thermal labels for
reitrn.com (the Lite product). No cloud connectivity — just an HTTP API on
localhost. Repo: github.com/reitrn/reitrn-print-agent-lite. Windows-only.

## Git: use `main`

History is unusual — record for future sessions:
- Remote `main` originally held only the initial commit; a local `master` held
  only the printer.js Windows 11 fix ("add PowerShell fallback for Get-Printer").
- On 2026-06-10 the full working tree was committed on `master` and merged into
  `main`. **`main` is now canonical — always branch from and push to `main`.**

## Stack

- Electron 28 + electron-builder (NSIS + portable, x64)
- `electron-store` only — no Firebase, no remote registration, fast startup
- Single printer (vs the full agent's courier/barcode pair)

## How it fits in

- Companion to **reitrn.com Lite** (the `../reitrn-lite/` app), not
  ReturnHub. Web app POSTs to the agent; if unreachable it falls back elsewhere.
- HTTP (not HTTPS) server on `127.0.0.1:3010` — same port as the full agent, so
  **don't run both on one PC**. Endpoints: `/ping`, `/status`, `POST /print`
  (body: `{ data }` or `{ zpl }` / `{ tspl }` — used as-is, no rendering).

## Commands

- `npm start` — run locally
- `npm run build` — installer + portable (`reitrn-print-agent-lite-setup.exe`)

## Key files

- `main.js` — tray/window, localhost server, IPC (`getState`, `testPrint`, …)
- `printer.js` — printer listing + raw print fallback chain
- `renderer/` — plain HTML/JS settings UI

## Decisions & gotchas

- **Windows 11 printer listing**: `wmic` is removed on Win 11 22H2+. `printer.js`
  tries native module → `wmic` → **PowerShell `Get-Printer` fallback** (the fix
  that lived on `master`). Don't regress this when touching `getInstalledPrinters`.
- Raw print fallback chain: direct Node `fs` write to `\\.\USBxxx` (port via wmic,
  cached per printer) → PowerShell CreateFile P/Invoke → `copy /b` to
  `\\localhost\<printer>` → WinSpool P/Invoke.
- PowerShell scripts go to temp `.ps1` files written as **UTF-16 LE with BOM**;
  inline `-Command` broke on escaping/encoding.
- `/print` responds `202` immediately, prints in background; job history (last 50)
  persists via electron-store.
- No secrets in this repo and none should be added — it is intentionally
  cloud-free.
