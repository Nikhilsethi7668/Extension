# Scraping Hub & Workers

## Goals
- Submit dealership URLs → extract inventory (VINs, images, pricing)
- Normalize to standard Vehicle JSON
- Handle dynamic sites, pagination, anti-bot friction

## Architecture
- Queue: Redis + BullMQ (`queue:scrape`, `queue:refine`, `queue:sold-check`)
- Worker: Node + Playwright Chromium
  - Stealth: playwright-extra with stealth plugin; navigator/UA spoofing
  - Proxies: rotating residential proxies configurable per tenant
  - Headless or headed (debug); anti-bot mitigations; fingerprinting controls
  - Robust navigation with timeouts, retries, jitter/backoff
  - Extraction strategies: site-specific adapters + generic fallbacks
- Pipeline
  1) Fetch pages, capture HTML + screenshots (debug)
  2) Extract raw fields
  3) Normalize (schema mapping + LLM cleaning for text)
  4) Upload images to storage, record metadata
  5) Upsert Vehicles; emit activity logs

## Vehicle JSON (normalized)
{
  "vin": "...",
  "year": 2021,
  "make": "Toyota",
  "model": "Camry",
  "trim": "SE",
  "mileage": 23000,
  "price": 21990,
  "color": "White",
  "location": "City, ST",
  "description": "AI-normalized text...",
  "images": [{ "url": "https://...", "kind": "original" }]
}

## Operability
- Configurable concurrency per org; per-domain and per-IP rate limits
- Structured logs, per-job artifacts for debugging (HTML, screenshots)
- Health checks and dead-letter queue for failures

## AI Normalization (Gemini)
- Prompt: Extract final selling price, exact mileage, and trim into a clean JSON format; reject marketing fluff.
- Input: raw text blocks scraped from detail pages; VIN blocks
- Output merged back into `normalized` with confidence scores

## Sold Detection
- Runner every 6 hours enqueues `queue:sold-check` per org/source
- Strategy: recheck detail URLs or sitemap; if VIN missing → mark `sold_pending_removal`
- Emits activity and notifies assigned agents via API
