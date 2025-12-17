# API Specification (v1)

All endpoints are scoped by authenticated user and organization context. JWT includes `org_id` and `role` claims. Errors use RFC7807 problem+json.

## Auth
- POST /v1/auth/login
  - body: { email, password }
  - 200: { token, user: { id, email, display_name }, orgs: [...] }
- POST /v1/auth/impersonate (owner/admin)
  - body: { user_id }
  - 200: { token }

## Organizations & Users
- GET /v1/org
  - 200: { id, name, slug }
- POST /v1/org (owner)
  - body: { name }
  - 201: { id }
- GET /v1/users (admin)
  - 200: [{ id, email, display_name, role, status }]
- POST /v1/users (admin)
  - body: { email, display_name, role }
  - 201: { id }
- PATCH /v1/users/:id (admin)
  - body: { role?, status? }
- DELETE /v1/users/:id (admin)

## Profiles (Chrome/FB)
- GET /v1/profiles (admin)
  - 200: [{ id, profile_name, facebook_id, agent_id }]
- POST /v1/profiles (admin)
  - body: { profile_name, facebook_id?, agent_id? }
  - 201: { id }
- PATCH /v1/profiles/:id (admin)
  - body: { profile_name?, facebook_id?, agent_id? }
- DELETE /v1/profiles/:id (admin)

## API Keys (per tenant)
- GET /v1/keys (admin)
  - 200: [{ id, provider, key_alias, is_default }]
- POST /v1/keys (admin)
  - body: { provider, key_alias, encrypted_key, is_default? }
- PATCH /v1/keys/:id (admin)
- DELETE /v1/keys/:id (admin)

## Scrape Sources & Jobs
- GET /v1/sources
- POST /v1/sources
  - body: { url, label }
- DELETE /v1/sources/:id
- POST /v1/scrape-jobs
  - body: { source_id } or { url }
- GET /v1/scrape-jobs?status=queued|running|succeeded|failed

## Vehicles
- GET /v1/vehicles?status=review|ready|posted
  - 200: [{ id, vin, year, make, model, normalized, status }]
- GET /v1/vehicles/:id
- PATCH /v1/vehicles/:id
  - body: { normalized?, status?, ai_title?, ai_description?, ai_variants? }
- POST /v1/vehicles/:id/refine-image
  - body: { image_id, operations: ['bg_remove','watermark','exposure'] }
- POST /v1/vehicles/:id/approve
  - transitions status → "ready"
- POST /v1/vehicles/:id/mark-sold
  - transitions status → "sold_pending_removal"; notify assigned agent(s)

## Postings
- GET /v1/postings?vehicle_id=...
- POST /v1/postings
  - body: { vehicle_id, channel: 'facebook_marketplace', agent_id?, profile_id? }
- PATCH /v1/postings/:id
  - body: { status?, listing_url?, error? }

## Activity & Metrics
- GET /v1/activity?limit=100
- GET /v1/metrics/dashboard
  - 200: { totals: {...}, last7: [...], byAgent: [...] }

## Webhooks (ingress from extension)
- POST /v1/hooks/fb/published
  - body: { vehicle_id, posting_id, listing_url, published_at, agent_id, profile }
  - effect: mark posting published; log activity
- POST /v1/hooks/vehicle/sold-detected
  - body: { vehicle_id, detected_at }
  - effect: mark vehicle sold_pending_removal; enqueue notification

## Error Format
{ "type": "https://docs.example/errors/<code>", "title": "Bad Request", "status": 400, "detail": "...", "instance": "/v1/..." }
