# Fix app.flashfender.com — Error 1033 (do this in Cloudflare)

The tunnel is **running** and has **app.flashfender.com** in its config. Cloudflare returns 1033 because the **DNS record** for app.flashfender.com does **not** point to the tunnel.

## Do this (2–3 minutes)

### 1. Open Cloudflare DNS
- Go to **https://dash.cloudflare.com**
- Click the zone that owns **app.flashfender.com** (usually **flashfender.com**)

### 2. Open DNS records
- In the left sidebar click **DNS** → **Records**

### 3. Find the record for `app`
- Look for a record whose **name** is **app** (so the full name is **app.flashfender.com**).
- It is probably **Type: A** (or AAAA) with **Proxied** (orange cloud).

### 4. Edit that record
- Click **Edit** on that record.
- **Either:**
  - **Change type to CNAME** and set:
    - **Name:** `app` (unchanged)
    - **Target:** `188d6a93-5a38-4e9e-ada9-13c7de2eb1ac.cfargotunnel.com`
    - **Proxy status:** **Proxied** (orange cloud)  
  - **Or delete** the A/AAAA record and **Add record**:
    - **Type:** CNAME  
    - **Name:** `app`  
    - **Target:** `188d6a93-5a38-4e9e-ada9-13c7de2eb1ac.cfargotunnel.com`  
    - **Proxy status:** Proxied  

### 5. Save
- Click **Save**. Wait 1–2 minutes.

### 6. (Optional) www.app.flashfender.com
- If you have a record for **www.app**, do the same: CNAME to `188d6a93-5a38-4e9e-ada9-13c7de2eb1ac.cfargotunnel.com`, Proxied.

---

**Why this works:**  
api.flashfender.com works because its DNS is a CNAME to that tunnel. app.flashfender.com must use the **same** CNAME target so Cloudflare routes it to the same tunnel.  
**Tunnel ID:** `188d6a93-5a38-4e9e-ada9-13c7de2eb1ac`  
**CNAME target:** `188d6a93-5a38-4e9e-ada9-13c7de2eb1ac.cfargotunnel.com`
