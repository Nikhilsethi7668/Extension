# Desktop Bridge (Profile Launcher)

## Purpose
- Launch Chrome with a specific OS-level profile and target URL since MV3 cannot switch profiles.

## Implementation
- App: Node.js/Electron minimal tray app
- IPC: Local HTTP (localhost:53721) or named pipe for commands from dashboard or extension
- Command: `chrome.exe --profile-directory="<ProfileName>" --new-window "https://www.facebook.com/marketplace/create/item"`

## API (Local)
- POST /launch { profile_name: "Profile 4", url?: "https://..." }
  - 200: { launched: true }
- GET /profiles → optional helper to list discovered profile directories

## Security
- Bind only to localhost, random auth token in header
- Rate limit and simple allowlist of URLs

## Flow
1) Agent selects a profile in dashboard → clicks "Launch Profile"
2) Dashboard calls Desktop Bridge → opens Chrome with the correct profile
3) Extension reads context (selected profile mapping) to tag telemetry and postings
