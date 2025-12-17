# System Architecture

## Overview
Modular, multi-tenant platform with four pillars:
- Admin Dashboard (Next.js/React) — DMS, inventory review, keys, auditing
- API (Node.js/Fastify) — Auth, tenancy, Vehicles, Jobs, Images, Posts
- Workers (Node + Playwright) — Scraping, normalization, AI image tasks
- Chrome Extension (MV3) — Side panel UI, auto-fill, telemetry

## Components
- Backend API
  - Fastify/Express, TypeScript, Zod validation, JWT or Supabase Auth
  - Adapter layer: AI providers (OpenAI, Gemini, Anthropic)
  - Storage: Supabase Postgres + Storage (or S3)
  - Queue: Redis + BullMQ for jobs (scrape, refine, post, sync)
- Scraper Workers
  - Playwright Chromium (stealth, proxy support)
  - Robust selectors, retries, anti-bot mitigation
  - Normalization pipeline → standard Vehicle JSON
- Admin Dashboard
  - Next.js + MUI; role-based routes; audit and metrics
- Chrome Extension (MV3)
  - `chrome.sidePanel` UI; content scripts for FB Marketplace
  - Messaging: side panel ↔ background SW ↔ content scripts ↔ backend

## Data Flow (Happy Path)
1) Admin configures tenant provider keys and source URLs
2) Scrape Job created → queued → worker runs → Vehicles upserted
3) Reviewer refines description/images and approves vehicle
4) Extension pulls "Ready to Post" list for assigned agent/profile
5) Agent clicks Post → content script fills FB form → publish detected
6) Extension pushes listing URL back → backend marks Vehicle Posted

## Security & Tenancy
- RLS per Org on all tenant-owned tables
- Roles: `owner`, `admin`, `agent` with granular permissions
- API keys stored per tenant, encrypted at rest
- Rate limiting per org/user; audit logs for every critical action

## Observability
- Structured logs (pino), job and scrape metrics, error traces
- Admin dashboard widgets for throughput and success rates

## Tech Choices
- Node 20+, TS; Fastify; Zod; Prisma (optional) or SQL
- Supabase Postgres (RLS, Storage); Redis (BullMQ)
- Playwright for scraping; Sharp/GM for images; Cloudflare Images optional
- Next.js for dashboard; MV3 + sidePanel for extension
