# Fix app.flashfender.com (Error 1033 / 530)

## Current status (checked from server)
- **api.flashfender.com** → works (HTTP 200)
- **app.flashfender.com** → Error 1033 / 530 (Cloudflare cannot route to tunnel)
- **Origin is OK**: nginx on port 8880 serves the dashboard when `Host: app.flashfender.com`

## Cause
The hostname **app.flashfender.com** is not routed to the Cloudflare Tunnel in DNS.  
api.flashfender.com works because its DNS points to the tunnel; app must use the same target.

## Fix in Cloudflare Dashboard

1. Go to **https://dash.cloudflare.com** → select the **flashfender.com** zone (or the zone that contains app.flashfender.com).

2. Open **DNS** → **Records**.

3. Find the record for **app.flashfender.com** (name might be `app` in zone flashfender.com).
   - If it is an **A** or **AAAA** record → delete it or change it as below.
   - If it is a **CNAME** to something other than the tunnel → edit it.

4. Set the record to:
   - **Type:** CNAME  
   - **Name:** `app` (so full name is app.flashfender.com)  
   - **Target:** `188d6a93-5a38-4e9e-ada9-13c7de2eb1ac.cfargotunnel.com`  
   - **Proxy status:** Proxied (orange cloud)

5. Optional: add or fix **www.app.flashfender.com** the same way:
   - **Name:** `www.app`  
   - **Target:** `188d6a93-5a38-4e9e-ada9-13c7de2eb1ac.cfargotunnel.com`  
   - **Proxy status:** Proxied

6. Save. Wait 1–2 minutes, then try https://app.flashfender.com again.

## Tunnel reference
- **Tunnel name:** flashfender-tunnel  
- **Tunnel ID:** 188d6a93-5a38-4e9e-ada9-13c7de2eb1ac  
- **CNAME target:** 188d6a93-5a38-4e9e-ada9-13c7de2eb1ac.cfargotunnel.com  
