# Project Roadmap

This roadmap turns the vision into a sequence of concrete, testable milestones. Each milestone lists acceptance criteria and demo targets.

## Phase 1 — Multi‑Tenant Admin & User Dashboard (DMS Core)
- Auth & Tenancy
  - Multi-tenant data model (Organizations, Users, Memberships, Roles)
  - SSO-ready auth surface (email/password first; SSO optional later)
  - Row-Level Security (RLS) policies to isolate org data
- User Management
  - Admins create Dealers (tenants) and Agents (users)
  - Invite flow with role assignment and status toggles
- Scraping Hub
  - Submit source URL(s); create a scrape job per URL
  - Queue + workers (Playwright) to fetch inventory, VINs, images
  - Normalization pipeline → standard Vehicle JSON
- Inventory Review
  - Vehicles land in "Ready to Review" state before posting
  - Gemini/LLM prompt to fix titles/descriptions
  - Image Refine: background cleanup, watermark, exposure fix
- API Key Management
  - Admin UI to manage provider keys per tenant (OpenAI/Gemini/Anthropic)
  - Provider abstraction on backend (pluggable adapter)
- Audit Trail
  - Who did what, when: jobs, edits, posts, deletions

Deliverable: Dashboard running on prod-like env with job execution, review UI, key management, auditing.

## Phase 2 — Pinned Chrome Extension (Action Layer)
- Side Panel UX
  - MV3 + `chrome.sidePanel` with tiled cards from backend
  - "Post to FB" action per vehicle
- Session/Profile Strategy
  - Map user → FB account via dashboard-managed Chrome profile records
  - Launch profile instances from dashboard (deep link / command) as a workaround; extension reads active profile context
- DOM Auto‑Fill
  - Content script maps Vehicle JSON → FB Marketplace selectors
  - Pre-processed LLM description (“human-like”, FB-friendly)

Deliverable: Agent can open FB Marketplace, see tiles in side panel, and auto-fill a listing reliably.

## Phase 3 — Feedback Loop & Tracking
- Post Detection
  - Detect "Listing Published" confirmation in DOM
  - Capture listing URL, time, agent, profile
- Pushback & Sync
  - Send listing metadata to backend; mark Vehicle as Posted
  - Sold detection (source site): notify to remove FB listing

Deliverable: Closed-loop telemetry with real-time status on dashboard.

---

## Milestones & Acceptance

M1: Core Tenancy + Auth + Schema
- Can create orgs, users, roles; RLS enforced; health checks.

M2: Scraping Hub MVP
- Submit URL → job runs in worker → normalized Vehicles stored.

M3: Inventory Review + AI Integration
- Vehicles visible for review; refine photo + LLM copy works; keys per tenant.

M4: Extension Side Panel MVP
- Side panel shows ready-to-post vehicles; auth/session sane; profile mapping visible.

M5: Auto-Fill Automation
- From tile → FB listing form filled end-to-end across key fields.

M6: Feedback Loop
- Detect publish, capture URL, sync to dashboard, mark posted.

M7: Hardening & Ops
- Rate limits, retries, monitoring, logging, error budgets, E2E tests.

---

## Environments & Tooling
- Local: Docker (Redis, Postgres/Supabase), dev backend, workers, dashboard
- Staging: Same as prod but with test providers/keys
- Prod: Managed Postgres (Supabase), Redis, storage (Supabase/S3), CI/CD

## Success Metrics
- Time-to-post per vehicle, success rate of auto-fill, scrape coverage, moderation pass rate, re-list latency, and overall throughput per agent.
