# reitrn Print Agent Lite

A lightweight, local-only thermal printer driver for reitrn.com. Runs in your Windows system tray and prints labels via a simple HTTP API.

## Features

- 🖨️ **Local printing only** — no cloud connectivity, prints go straight to your USB printer
- 🎯 **Single printer support** — simplified for label printing
- 📡 **HTTP API** — localhost:3010 for instant printing from the web app
- 🚀 **Fast startup** — no remote connections or registration needed
- 🔧 **Simple configuration** — just select your printer and go
- ✅ **Test print** — verify your printer setup with a test label

## Installation

1. Download `reitrn-print-agent-lite-setup.exe`
2. Run the installer
3. Agent launches in your system tray
4. Select your thermal printer from the list
5. Click "Test Print" to verify

## Usage

**From reitrn.com:**
- Click the "Print Agent" button on any inspection
- If the agent is running, prints go directly to your local printer
- Recent print jobs appear in the agent window

**Manual HTTP requests:**
```bash
POST http://localhost:3010/print
Content-Type: application/json

{
  "data": "SIZE 4 x 6\nDENSITY 8\n...",
  "zpl": "^XA^XZ"
}
```

## Printer Support

Works with any thermal printer that supports:
- **TSPL** (TSC, Zebra GK430, etc.)
- **ZPL** (Zebra thermal printers)
- Raw text formats

## Requirements

- Windows 10 or later
- USB thermal printer
- 64-bit system

## Troubleshooting

**Printer not showing in the list?**
- Click the "↻ Refresh" button
- Ensure printer is connected and powered on
- Try restarting the agent

**Test print not working?**
- Verify printer is selected
- Check if printer has paper loaded
- Try a different USB port

## Technical

- Built with Electron
- No external cloud dependencies
- Stores configuration locally
- ~30MB installer

---

Made with ❤️ by reitrn. for faster return processing.
