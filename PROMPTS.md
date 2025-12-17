# AI Studio Prompt Pack

Use these in order to bootstrap services with clear contracts and testable outputs.

## Prompt 1 — Backend & Database (Supabase)
"""
Build a Node.js (Fastify + TypeScript) API for a multi-tenant dealership app. Use Supabase Postgres for data and Supabase Storage for images. Implement tables from DB_SCHEMA.sql (organizations, users, memberships, api_keys, scrape_sources, scrape_jobs, vehicles, vehicle_images, postings, fb_accounts, activity_logs) with RLS per organization.

Add endpoints from API_SPEC.md (Auth, Users, Keys, Sources/Jobs, Vehicles, Postings, Activity, Webhooks). Validate inputs with Zod. Return RFC7807 errors. Add a local docker-compose for Redis and reference Supabase. Include seed scripts for a demo org with an admin and agent.
"""

## Master Instruction — NextGen Auto Lister
"""
Build a multi-tenant automotive SaaS. Backend: Node.js, Express/Fastify, Supabase. Extension: Manifest V3, SidePanel API, Content Scripts.

Instructions:
1) Create a DB schema where vehicles are linked to organizations with strict RLS. Include `organizations` (fields: gemini_api_key, custom_watermark_url, domain_to_scrape), `users` with roles (SuperAdmin, DealerAdmin, SalesAgent), `chrome_profiles` mapping agent_id → profile_name and facebook_id, `vehicles` with raw JSONB and AI-optimized fields (ai_title, ai_description, ai_variants), `postings`, and `activity_logs`.
2) Build a Playwright scraper that extracts car data and uses Gemini to normalize it into JSON. Use stealth plugins + rotating residential proxies; schedule sold-detection every 6 hours to mark vehicles as SOLD_PENDING_REMOVAL.
3) Implement a Chrome SidePanel that fetches 'Available Vehicles' (status=ready) from the API, with a Profile Manager and a 'Launch Profile' button (Desktop Bridge).
4) Write a Content Script that fills the Facebook Marketplace Create form by mapping JSON fields to DOM elements via semantic selectors and randomized human-like typing speeds.
5) Integrate Gemini Nano Banana for on-the-fly background removal and lighting cleanup; watermark images with dealer logo and consultant phone. Store refined images as new versions.
"""

## Prompt 2 — Scraping Engine (Playwright)
"""
Create a Node.js/Playwright worker that consumes a BullMQ queue (Redis) named `queue:scrape`. Given an input URL, crawl inventory pages, extract VIN, price, year/make/model, mileage, color, location, and images. Save raw HTML for the first page for debugging. Normalize to the Vehicle JSON shape in SCRAPER_SPEC.md and POST to backend `/v1/vehicles` or upsert via an idempotent key (vin or external_id).

Design an adapter pattern so site-specific selectors can be added. Include retries, timeouts, and exponential backoff. Produce structured logs.
"""

## Prompt 3 — Extension Side Panel (MV3)
"""
Build a Manifest V3 extension that uses the Side Panel API to render a grid of "Ready to Post" vehicles from `/v1/vehicles?status=ready`. Include login (JWT saved to `chrome.storage.session`). Each card has a "Post to FB" button that sends a message to the background script to inject a content script into the current FB Marketplace tab.

Follow EXTENSION_SPEC.md for permissions and flows.
"""

## Prompt 4 — Automation Logic (Content Script)
"""
Write a content script that maps normalized Vehicle JSON to the selectors on the Facebook Marketplace create-listing form (title, price, description, location, category, images). Wait for each field to be present, set values, and handle asynchronous image uploads. Expose step logs back to the background script via `chrome.runtime.sendMessage`.
"""

## Prompt 5 — AI Image Integration
"""
Integrate the Gemini Nano Banana (or equivalent) API into the dashboard inventory review page. Add a "Refine Photo" action that sends an image with an operation list (remove background, add watermark, adjust exposure). Save the returned image as a new `vehicle_images` record with kind `refined` or `watermarked`.
"""
