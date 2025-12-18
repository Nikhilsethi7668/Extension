# 🏢 AutoBridge Enterprise Architecture

## Phase 1: Multi-Tenant Backend (Current → Enterprise)

### Database Schema Design (Supabase/Postgres)

```sql
-- Organizations (Dealers)
CREATE TABLE organizations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  dealer_id VARCHAR(50) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  domain VARCHAR(255),
  gemini_api_key TEXT,
  openai_api_key TEXT,
  custom_watermark_url TEXT,
  domain_to_scrape TEXT[],
  branding_config JSONB DEFAULT '{}',
  subscription_tier VARCHAR(50) DEFAULT 'basic',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Users with Roles
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  user_id VARCHAR(100) UNIQUE NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role VARCHAR(50) NOT NULL CHECK (role IN ('super_admin', 'dealer_admin', 'sales_agent', 'viewer')),
  department VARCHAR(100),
  phone VARCHAR(50),
  profile_picture_url TEXT,
  last_login TIMESTAMP,
  is_active BOOLEAN DEFAULT true,
  permissions JSONB DEFAULT '{}',
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  created_by UUID REFERENCES users(id)
);

-- Chrome Profiles for Multi-Account Management
CREATE TABLE chrome_profiles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  agent_id UUID REFERENCES users(id) ON DELETE CASCADE,
  profile_name VARCHAR(100) NOT NULL,
  profile_directory VARCHAR(255),
  facebook_account_id VARCHAR(100),
  facebook_account_name VARCHAR(255),
  cookies JSONB,
  is_active BOOLEAN DEFAULT true,
  last_used TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(organization_id, profile_name)
);

-- Vehicles (Inventory)
CREATE TABLE vehicles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  vin VARCHAR(17) UNIQUE NOT NULL,
  year INTEGER NOT NULL,
  make VARCHAR(100) NOT NULL,
  model VARCHAR(100) NOT NULL,
  trim VARCHAR(100),
  price DECIMAL(12,2),
  mileage INTEGER,
  color_exterior VARCHAR(50),
  color_interior VARCHAR(50),
  body_type VARCHAR(50),
  fuel_type VARCHAR(50),
  transmission VARCHAR(50),
  drivetrain VARCHAR(50),
  engine VARCHAR(100),
  features TEXT[],
  condition VARCHAR(50) DEFAULT 'used',
  title_status VARCHAR(50) DEFAULT 'clean',
  
  -- Raw scraped data
  raw_data JSONB,
  source_url TEXT,
  source_platform VARCHAR(50),
  
  -- AI-enhanced fields
  ai_description TEXT,
  ai_title TEXT,
  ai_keywords TEXT[],
  ai_score DECIMAL(3,2),
  market_analysis JSONB,
  
  -- Images
  images JSONB DEFAULT '[]',
  processed_images JSONB DEFAULT '[]',
  
  -- Status tracking
  status VARCHAR(50) DEFAULT 'available' CHECK (status IN ('available', 'pending', 'sold', 'archived')),
  assigned_to UUID REFERENCES users(id),
  posted_to_platforms JSONB DEFAULT '[]',
  
  -- Audit
  scraped_at TIMESTAMP,
  last_updated TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW(),
  created_by UUID REFERENCES users(id)
);

-- Scraping Jobs
CREATE TABLE scrape_jobs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id),
  source VARCHAR(50) NOT NULL,
  urls TEXT[] NOT NULL,
  status VARCHAR(50) DEFAULT 'queued' CHECK (status IN ('queued', 'processing', 'completed', 'failed')),
  options JSONB DEFAULT '{}',
  results JSONB,
  error_message TEXT,
  vehicles_created INTEGER DEFAULT 0,
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Activity Logs (Audit Trail)
CREATE TABLE activity_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id),
  action VARCHAR(100) NOT NULL,
  entity_type VARCHAR(50),
  entity_id UUID,
  metadata JSONB DEFAULT '{}',
  ip_address INET,
  user_agent TEXT,
  success BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW()
);

-- API Keys Management
CREATE TABLE api_keys (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  key_name VARCHAR(100) NOT NULL,
  api_key TEXT NOT NULL,
  provider VARCHAR(50) NOT NULL CHECK (provider IN ('gemini', 'openai', 'anthropic', 'proxies')),
  is_active BOOLEAN DEFAULT true,
  usage_count INTEGER DEFAULT 0,
  last_used TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  created_by UUID REFERENCES users(id)
);

-- Row Level Security Policies
ALTER TABLE vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE scrape_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_logs ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see vehicles from their organization
CREATE POLICY "Users see own org vehicles" ON vehicles
  FOR SELECT
  USING (organization_id IN (
    SELECT organization_id FROM users WHERE id = auth.uid()
  ));

-- Policy: Admins can manage users in their org only
CREATE POLICY "Admins manage org users" ON users
  FOR ALL
  USING (
    organization_id IN (
      SELECT organization_id FROM users 
      WHERE id = auth.uid() 
      AND role IN ('dealer_admin', 'super_admin')
    )
  );

-- Indexes for Performance
CREATE INDEX idx_vehicles_org ON vehicles(organization_id);
CREATE INDEX idx_vehicles_status ON vehicles(status);
CREATE INDEX idx_vehicles_vin ON vehicles(vin);
CREATE INDEX idx_users_org ON users(organization_id);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_scrape_jobs_org ON scrape_jobs(organization_id);
CREATE INDEX idx_scrape_jobs_status ON scrape_jobs(status);
CREATE INDEX idx_activity_logs_org ON activity_logs(organization_id);
CREATE INDEX idx_activity_logs_user ON activity_logs(user_id);
CREATE INDEX idx_activity_logs_created ON activity_logs(created_at DESC);
```

## Phase 2: Deep-Crawl Scraper with Playwright

### Implementation (Node.js Service)

```javascript
// scraper-service/index.js
import { chromium } from 'playwright-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { GoogleGenerativeAI } from '@google/generative-ai';

chromium.use(StealthPlugin());

class AgenticScraper {
  constructor(geminiApiKey, proxyConfig) {
    this.browser = null;
    this.gemini = new GoogleGenerativeAI(geminiApiKey);
  }

  async initialize() {
    this.browser = await chromium.launch({
      headless: true,
      proxy: this.proxyConfig,
      args: [
        '--disable-blink-features=AutomationControlled',
        '--disable-dev-shm-usage',
        '--no-sandbox'
      ]
    });
  }

  async scrapeVehicle(url, source) {
    const page = await this.browser.newPage();
    
    // Set realistic headers
    await page.setExtraHTTPHeaders({
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)...',
      'Accept-Language': 'en-US,en;q=0.9',
    });

    await page.goto(url, { waitUntil: 'networkidle' });

    // Extract raw data based on source
    const rawData = await this.extractData(page, source);
    
    // Normalize with Gemini
    const normalized = await this.normalizeWithAI(rawData);
    
    // Download images
    const images = await this.downloadImages(rawData.imageUrls);
    
    await page.close();
    
    return { ...normalized, images, sourceUrl: url };
  }

  async normalizeWithAI(rawData) {
    const prompt = `
Extract vehicle data from this scraped content:
${JSON.stringify(rawData, null, 2)}

Return ONLY valid JSON with these exact fields:
{
  "year": number,
  "make": string,
  "model": string,
  "trim": string,
  "price": number,
  "mileage": number,
  "vin": string,
  "description": string,
  "features": string[]
}

Clean any formatting, extract only the final price if multiple are listed.
`;

    const model = this.gemini.getGenerativeModel({ model: 'gemini-2.5-flash' });
    const result = await model.generateContent(prompt);
    return JSON.parse(result.response.text());
  }

  async detectSoldVehicles(dealerUrl, knownVins) {
    // Re-crawl dealer site
    const currentVins = await this.scrapeInventoryList(dealerUrl);
    
    // Find missing VINs
    const soldVins = knownVins.filter(vin => !currentVins.includes(vin));
    
    return soldVins;
  }
}
```

## Phase 3: Image Processing with Gemini Nano Banana

### Image Studio Service

```javascript
// image-service/processor.js
import { GoogleGenerativeAI } from '@google/generative-ai';
import sharp from 'sharp';

class ImageStudioProcessor {
  constructor(geminiApiKey) {
    this.gemini = new GoogleGenerativeAI(geminiApiKey);
  }

  async removeBackground(imageBuffer) {
    const model = this.gemini.getGenerativeModel({ model: 'gemini-2.5-flash-image' });
    
    // Convert to base64
    const base64Image = imageBuffer.toString('base64');
    
    const result = await model.generateContent([
      {
        inlineData: {
          data: base64Image,
          mimeType: 'image/jpeg'
        }
      },
      { text: 'Remove the background from this vehicle image, keep only the car.' }
    ]);

    // Return processed image
    return result.image;
  }

  async enhanceLighting(imageBuffer) {
    return sharp(imageBuffer)
      .modulate({ brightness: 1.1, saturation: 1.2 })
      .sharpen()
      .toBuffer();
  }

  async addWatermark(imageBuffer, watermarkConfig) {
    const { logoUrl, dealerPhone, agentName } = watermarkConfig;
    
    const watermark = await sharp(logoUrl)
      .resize(150, 150)
      .toBuffer();

    return sharp(imageBuffer)
      .composite([
        { input: watermark, gravity: 'southeast' },
        {
          input: Buffer.from(`
            <svg width="400" height="60">
              <text x="10" y="30" font-size="20" fill="white" stroke="black" stroke-width="1">
                ${agentName} | ${dealerPhone}
              </text>
            </svg>
          `),
          gravity: 'southwest'
        }
      ])
      .toBuffer();
  }
}
```

## Phase 4: Chrome Extension Architecture (MV3)

### manifest.json (Manifest V3)

```json
{
  "manifest_version": 3,
  "name": "AutoBridge Pro",
  "version": "2.0.0",
  "permissions": [
    "storage",
    "sidePanel",
    "tabs",
    "scripting",
    "notifications"
  ],
  "host_permissions": [
    "https://www.facebook.com/*",
    "https://autobridge-backend.dchatpar.workers.dev/*"
  ],
  "background": {
    "service_worker": "background/service-worker.js",
    "type": "module"
  },
  "side_panel": {
    "default_path": "sidepanel/panel.html"
  },
  "content_scripts": [
    {
      "matches": ["https://www.facebook.com/marketplace/create*"],
      "js": ["content/facebook-autofill.js"],
      "run_at": "document_idle"
    }
  ]
}
```

### Side Panel (Command Center)

```javascript
// sidepanel/panel.js
const API_BASE = 'https://autobridge-backend.dchatpar.workers.dev/api';

class SidePanelController {
  async loadVehicles() {
    const response = await fetch(`${API_BASE}/vehicles?status=available`, {
      headers: { Authorization: `Bearer ${await this.getToken()}` }
    });
    
    const { vehicles } = await response.json();
    this.renderVehicleCards(vehicles);
  }

  async postToMarketplace(vehicleId) {
    // Get vehicle data
    const vehicle = await this.fetchVehicle(vehicleId);
    
    // Send to content script
    chrome.tabs.query({ active: true }, ([tab]) => {
      chrome.tabs.sendMessage(tab.id, {
        action: 'fillForm',
        vehicle
      });
    });
  }

  async selectProfile(profileName) {
    // Signal to desktop bridge to launch new Chrome instance
    const response = await fetch('http://localhost:3456/launch-profile', {
      method: 'POST',
      body: JSON.stringify({ profile: profileName })
    });
  }
}
```

## Phase 5: Desktop Bridge (Profile Launcher)

### Local Node.js Server

```javascript
// desktop-bridge/server.js
import express from 'express';
import { exec } from 'child_process';

const app = express();

app.post('/launch-profile', (req, res) => {
  const { profile } = req.body;
  
  const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const command = `"${chromePath}" --profile-directory="${profile}" --new-window https://www.facebook.com/marketplace/create`;
  
  exec(command, (error) => {
    if (error) {
      return res.status(500).json({ success: false });
    }
    res.json({ success: true });
  });
});

app.listen(3456);
```

## API Endpoints Summary

### Multi-Tenant Endpoints

```
POST /api/organizations - Create new dealer
GET /api/organizations/:id - Get dealer details
PATCH /api/organizations/:id/settings - Update API keys

POST /api/users - Create user with org assignment
GET /api/users - List users (RLS filtered by org)
PATCH /api/users/:id/role - Update user role

GET /api/vehicles - List vehicles (RLS filtered)
POST /api/vehicles - Add vehicle
PATCH /api/vehicles/:id/assign - Assign to agent

GET /api/chrome-profiles - List profiles for org
POST /api/chrome-profiles - Create profile mapping
```

## Security Implementation

### JWT with Organization Context

```javascript
const token = jwt.sign({
  userId: user.id,
  role: user.role,
  organizationId: user.organization_id
}, JWT_SECRET);

// Middleware
function verifyOrgAccess(req, res, next) {
  const { organizationId } = req.decoded;
  req.supabase = supabase.from('vehicles')
    .select('*')
    .eq('organization_id', organizationId);
  next();
}
```

## Deployment Architecture

```
┌─────────────────────────────────────────────────┐
│  Cloudflare Workers (API + Dashboard)          │
│  - JWT Auth                                      │
│  - Multi-tenant routing                          │
└──────────────┬──────────────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────────────┐
│  Supabase (Postgres + Storage + Auth)          │
│  - Row Level Security                            │
│  - Real-time subscriptions                       │
└──────────────┬──────────────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────────────┐
│  Scraper Service (Node.js + Playwright)        │
│  - Queue: BullMQ + Redis                        │
│  - Residential proxies                           │
└──────────────┬──────────────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────────────┐
│  Image Processing Service                        │
│  - Gemini Nano Banana API                        │
│  - Sharp for optimization                         │
└──────────────┬──────────────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────────────┐
│  Chrome Extension (Agents' Machines)            │
│  - Side Panel UI                                 │
│  - Content Scripts                               │
└─────────────────────────────────────────────────┘
```

---

**Next Steps:**
1. ✅ Current single-tenant working
2. ⏳ Add Supabase integration
3. ⏳ Implement RLS policies
4. ⏳ Build scraper service
5. ⏳ Enhance Chrome extension
