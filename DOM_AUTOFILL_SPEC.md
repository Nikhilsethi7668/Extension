# DOM-Level Automation Engine (The "Filer")

## Objectives
- Reliably fill the Facebook Marketplace Create Listing flow with human-like behavior.
- Resist UI changes via semantic element discovery.

## Strategy
- Dynamic Selectors: Identify inputs via semantic search of surrounding labels and roles (e.g., parent/ancestor text contains "Price").
- Human-Mimicry Typing: randomized per-char delays (40–140ms), bursts + hesitations, occasional click-away and refocus.
- Robust Waiting: await visible + enabled; scroll-into-view; intersection observer fallback.
- Error Signatures: capture selector debug info and minimal DOM excerpt on failure.

## Workflow Steps
1) Open/Create Listing URL (agent already in correct profile)
2) Title, Price, Category, Location, Condition, Description
3) Upload Images (monitor upload completion; retry failed files)
4) Validate required fields; fix missing/invalid states
5) Submit; wait for publish confirmation; scrape listing URL

## Data Mapping
- Input: Normalized Vehicle JSON (with `ai_title`, `ai_description`, images)
- Variation: choose random variant from `ai_variants` to improve uniqueness

## Telemetry
- `runtime.sendMessage` per step with timestamps
- Include selector chosen, latency per field, retries

## Resilience
- Heuristic fallback selector sets
- Form-reset detection and resubmission
- Structured backoff for FB-side rate limits
