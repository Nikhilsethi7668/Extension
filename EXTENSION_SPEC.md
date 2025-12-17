# Chrome Extension (MV3) Spec — Side Panel

## Goals
- Persistent side panel that stays open while navigating Marketplace
- Show tiles for "Ready to Post" vehicles assigned to the agent/profile
- One-click Post → content script fills FB form; detect publish

## Manifest (MV3)
- Permissions: ["storage","activeTab","scripting","tabs","sidePanel","identity","cookies"]
- `side_panel.default_path`: `panel/index.html`
- Background service worker: messaging, network calls, alarms
- Content scripts: FB Marketplace create-listing routes

## Data & Auth
- Extension fetches JWT via dashboard login flow (or device code flow)
- Stores short-lived token in `chrome.storage.session`
- Includes `org_id`, `user_id`, and selected `fb_profile_id`

## Profile Manager
- Fetch list from `/v1/profiles`
- Dropdown to select active profile; persisted in session
- "Launch Profile" button calls Desktop Bridge (see DESKTOP_BRIDGE_SPEC.md)

## Profile Mapping Strategy
- Constraint: extensions cannot switch OS-level Chrome profiles
- Workaround: Dashboard maintains "FB Accounts" with `chrome_profile_dir`
- Dashboard provides launch shortcut: `chrome.exe --profile-directory="Profile 2" https://www.facebook.com/marketplace/create/item`
- Extension reads active profile context (derived mapping), associates posts with that account

## Side Panel UI
- Tiles list: image, title, price, mileage, CTA: "Post to FB"
- Filters: make, model, price range, status
- Status badges: Review, Ready, Posted

## Posting Flow
1) Agent clicks Post
2) Background injects content script into active FB tab
3) Content script maps Vehicle JSON → selectors
4) Waits for validation; attaches images; sets location/category
5) Submits; listens for publish confirmation
6) Sends webhook `/v1/hooks/fb/published` with listing_url and metadata

## Telemetry
- `runtime.sendMessage` events for each step
- Errors with selector signatures for diagnosis

## Live Audit Log
- Every significant action (click Post, upload, submit, published) sent to `/v1/activity`
- Side panel shows recent actions for transparency
