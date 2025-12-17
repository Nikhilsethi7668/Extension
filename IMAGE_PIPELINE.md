# Image Pipeline (AI-First)

## Goals
- Turn dealer images into studio-quality assets suitable for FB Marketplace.
- One-click refinements with reproducible, auditable steps.

## Operations
- Background Removal: remove lot/background, replace with branded backdrop.
- Lighting/Cleanup: adjust exposure/contrast; remove glare/reflections.
- Watermarking: overlay dealer logo + consultant phone in bottom-right.

## API
- POST /v1/vehicles/:id/refine-image { image_id, operations: [ 'bg_remove', 'exposure', 'watermark' ], watermark_text? }
- Result: new `vehicle_images` row with `kind` = 'refined' or 'watermarked'.

## Implementation
- Provider: Gemini Nano Banana (image_edit) or pluggable provider adapter
- Processing: stream-based; Sharp/GM for compositing and watermark
- Storage: Supabase Storage or S3; signed URLs to extension/dashboard

## UX
- Inventory Review: "Refine Photo" per image; batch refine; progress indicator
- Non-destructive: keep originals; allow revert
- Audit: record operation list and params in `activity_logs.meta`
