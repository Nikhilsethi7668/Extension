// Simple Backend Server without Firebase
// For development and testing

const express = require('express');
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const axios = require('axios');
const cheerio = require('cheerio');
const sharp = require('sharp');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();
const PORT = process.env.PORT || 3001;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

app.use(cors());
app.use(express.json());

// In-memory storage (replace with database in production)
const users = [
  {
    userId: 'admin',
    email: 'admin@shifty.com',
    password: 'admin', // Simple password for testing
    role: 'admin',
    status: 'active',
    createdAt: new Date().toISOString()
  },
  {
    userId: 'demo',
    email: 'demo@shifty.com',
    password: 'demo',
    role: 'user',
    status: 'active',
    createdAt: new Date().toISOString()
  }
];

const activityLogs = [];
const scrapeJobs = [];

const JWT_SECRET = 'dev-secret-key-change-in-production';

// Middleware
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ success: false, message: 'No token provided' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(403).json({ success: false, message: 'Invalid token' });
  }
}

function requireAdmin(req, res, next) {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ success: false, message: 'Admin access required' });
  }
  next();
}

// Routes

// Root route
app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    message: 'AutoBridge Backend API',
    version: '1.0.0',
    endpoints: {
      health: '/api/health',
      login: '/api/auth/login',
      users: '/api/users (admin)',
      logs: '/api/logs/activity',
      stats: '/api/stats/dashboard (admin)'
    },
    adminDashboard: `http://localhost:${PORT === 3001 ? 3001 : PORT}`,
    credentials: {
      admin: 'admin / admin',
      demo: 'demo / demo'
    }
  });
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Server is running' });
});

// Register new user (admin only)
app.post('/api/auth/register', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { userId, email, password, role } = req.body;
    
    // Check if user exists
    const existingUser = users.find(u => u.userId === userId);
    if (existingUser) {
      return res.status(400).json({ success: false, message: 'User already exists' });
    }

    const newUser = {
      userId,
      email,
      password, // Simple password storage
      role: role || 'user',
      status: 'active',
      createdAt: new Date().toISOString()
    };

    users.push(newUser);

    res.json({
      success: true,
      message: 'User created successfully',
      user: {
        userId: newUser.userId,
        email: newUser.email,
        role: newUser.role,
        status: newUser.status
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
});

// Delete user (admin only)
app.delete('/api/users/:userId', authenticateToken, requireAdmin, (req, res) => {
  const { userId } = req.params;
  
  const userIndex = users.findIndex(u => u.userId === userId);
  if (userIndex === -1) {
    return res.status(404).json({ success: false, message: 'User not found' });
  }

  // Don't allow deleting yourself
  if (userId === req.user.userId) {
    return res.status(400).json({ success: false, message: 'Cannot delete your own account' });
  }

  users.splice(userIndex, 1);
  res.json({ success: true, message: 'User deleted successfully' });
});

// Login
app.post('/api/auth/login', async (req, res) => {
  try {
    const { userId, password } = req.body;

    const user = users.find(u => u.userId === userId);
    if (!user) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    if (user.status !== 'active') {
      return res.status(403).json({ success: false, message: 'Account is inactive' });
    }

    // Simple password comparison for demo
    const validPassword = (user.password === password);

    if (!validPassword) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { userId: user.userId, role: user.role },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    // Log activity
    activityLogs.push({
      userId: user.userId,
      action: 'login',
      timestamp: new Date().toISOString(),
      success: true
    });

    res.json({
      success: true,
      token,
      userId: user.userId,
      role: user.role,
      email: user.email
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
});

// Validate session
app.post('/api/auth/validate', authenticateToken, (req, res) => {
  res.json({ success: true, userId: req.user.userId, role: req.user.role });
});

// Logout
app.post('/api/auth/logout', authenticateToken, (req, res) => {
  activityLogs.push({
    userId: req.user.userId,
    action: 'logout',
    timestamp: new Date().toISOString()
  });
  res.json({ success: true, message: 'Logged out' });
});

// Get all users (admin only)
app.get('/api/users', authenticateToken, requireAdmin, (req, res) => {
  const userList = users.map(u => ({
    userId: u.userId,
    email: u.email,
    role: u.role,
    status: u.status,
    createdAt: u.createdAt,
    totalPosts: activityLogs.filter(log => log.userId === u.userId && log.action === 'post').length,
    lastLogin: activityLogs.filter(log => log.userId === u.userId && log.action === 'login').pop()?.timestamp
  }));

  res.json({ success: true, users: userList });
});

// Update user status (admin only)
app.patch('/api/users/:userId/status', authenticateToken, requireAdmin, (req, res) => {
  const { userId } = req.params;
  const { status } = req.body;

  const user = users.find(u => u.userId === userId);
  if (!user) {
    return res.status(404).json({ success: false, message: 'User not found' });
  }

  user.status = status;
  res.json({ success: true, message: 'User status updated' });
});

// Log activity
app.post('/api/logs/activity', authenticateToken, (req, res) => {
  const logEntry = {
    userId: req.user.userId,
    action: req.body.action,
    timestamp: new Date().toISOString(),
    metadata: req.body.metadata || {},
    success: req.body.success !== false
  };

  activityLogs.push(logEntry);
  res.json({ success: true, message: 'Activity logged' });
});

// Queue scrape jobs (stub; in-memory only)
app.post('/api/scrape/queue', authenticateToken, async (req, res) => {
  const { source = 'unknown', urls = [], options = {}, geminiApiKey } = req.body || {};
  if (!Array.isArray(urls) || urls.length === 0) {
    return res.status(400).json({ success: false, message: 'No URLs provided' });
  }
  const created = [];
  const enqueueOne = async (theUrl) => {
    let scraped = null;
    try {
      scraped = await smartScrape(theUrl, { source, geminiApiKey: geminiApiKey || GEMINI_API_KEY });
    } catch (err) {
      console.error('Smart scrape error (queue item):', err.message);
    }
    const job = {
      id: 'job_' + Date.now() + '_' + Math.random().toString(36).slice(2,7),
      source,
      urls: [theUrl],
      url: theUrl,
      options,
      geminiApiKey: geminiApiKey ? '***provided***' : undefined,
      status: scraped ? 'ready' : 'queued',
      createdAt: new Date().toISOString(),
      scraped,
      assignedTo: options && options.assignedTo ? options.assignedTo : null
    };
    scrapeJobs.push(job);
    activityLogs.push({ userId: req.user.userId, action: 'scrape_queued', timestamp: new Date().toISOString(), metadata: { source, url: theUrl, scraped: Boolean(scraped) }, success: true });
    created.push(job);
  };

  for (const inUrl of urls) {
    const domain = safeDomain(inUrl);
    const isInventory = options.expandInventory || (domain.includes('brownboysauto.com') && !inUrl.includes('/cars/used/'));
    if (isInventory) {
      try {
        const links = await expandInventoryUrls(inUrl);
        for (const link of links) {
          // Keep it bounded to avoid explosion
          if (created.length >= 50) break;
          await enqueueOne(link);
        }
      } catch (e) {
        console.error('Inventory expand failed:', e.message);
        // enqueue the inventory URL itself as a fallback
        await enqueueOne(inUrl);
      }
    } else {
      await enqueueOne(inUrl);
    }
  }

  res.json({ success: true, created: created.length, first: created[0] || null });
});

// On-demand smart scrape (fetch and parse immediately)
app.post('/api/scrape/fetch', authenticateToken, async (req, res) => {
  const { url, source = 'auto', geminiApiKey } = req.body || {};
  if (!url) return res.status(400).json({ success: false, message: 'URL is required' });
  try {
    const data = await smartScrape(url, { source, geminiApiKey: geminiApiKey || GEMINI_API_KEY });
    activityLogs.push({
      userId: req.user.userId,
      action: 'scrape_fetched',
      timestamp: new Date().toISOString(),
      metadata: { url, source },
      success: true
    });
    res.json({ success: true, data });
  } catch (err) {
    console.error('Smart scrape error (fetch):', err);
    res.status(500).json({ success: false, message: err.message || 'Scrape failed' });
  }
});

// List scrape jobs (in-memory)
app.get('/api/scrape/jobs', authenticateToken, (req, res) => {
  const { status, assignedTo } = req.query;
  let jobs = scrapeJobs.slice(-100).reverse();
  if (status) {
    jobs = jobs.filter(j => (j.status || '').toLowerCase() === status.toLowerCase());
  }
  // Admin can optionally filter by assignedTo; non-admins only see their assigned jobs
  if (req.user.role !== 'admin') {
    jobs = jobs.filter(j => (j.assignedTo || '').toLowerCase() === (req.user.userId || '').toLowerCase());
  } else if (assignedTo) {
    jobs = jobs.filter(j => (j.assignedTo || '') === assignedTo);
  }
  res.json({ success: true, jobs });
});

// Update job status or data (e.g., mark ready for extension)
app.patch('/api/scrape/jobs/:id', authenticateToken, (req, res) => {
  const job = scrapeJobs.find(j => j.id === req.params.id);
  if (!job) return res.status(404).json({ success: false, message: 'Job not found' });

  const { status, scraped, assignedTo } = req.body || {};
  if (status) job.status = status;
  if (scraped) job.scraped = { ...(job.scraped || {}), ...scraped };

  if (typeof assignedTo !== 'undefined') {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Admin required to assign jobs' });
    }
    job.assignedTo = assignedTo || null;
  }

  res.json({ success: true, job });
});

// Get activity logs
app.get('/api/logs/activity', authenticateToken, (req, res) => {
  let logs = [...activityLogs];

  // If not admin, only show own logs
  if (req.user.role !== 'admin') {
    logs = logs.filter(log => log.userId === req.user.userId);
  }

  // Optional user filter
  if (req.query.userId) {
    logs = logs.filter(log => log.userId === req.query.userId);
  }

  // Sort by newest first
  logs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

  res.json({ success: true, logs });
});

// Get dashboard stats (admin only)
app.get('/api/stats/dashboard', authenticateToken, requireAdmin, (req, res) => {
  const stats = {
    totalUsers: users.length,
    totalPosts: activityLogs.filter(log => log.action === 'post').length,
    todayPosts: activityLogs.filter(log => {
      const today = new Date().toDateString();
      return log.action === 'post' && new Date(log.timestamp).toDateString() === today;
    }).length,
    last7DaysPosts: []
  };

  // Calculate posts per day for last 7 days
  for (let i = 6; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    const dateStr = date.toISOString().split('T')[0];
    
    const count = activityLogs.filter(log => {
      return log.action === 'post' && log.timestamp.startsWith(dateStr);
    }).length;

    stats.last7DaysPosts.push({
      date: dateStr,
      posts: count
    });
  }

  res.json({ success: true, stats });
});

// Image edit for scraped jobs (per-image or batch) using basic prompt-driven transforms
app.post('/api/scrape/edit-images', authenticateToken, async (req, res) => {
  const { urls = [], prompt = '', jobId, indices } = req.body || {};
  if (!Array.isArray(urls) || urls.length === 0) {
    return res.status(400).json({ success: false, message: 'No image URLs provided' });
  }

  try {
    const targetIndexes = Array.isArray(indices) ? new Set(indices) : null;
    const results = [];

    for (let i = 0; i < urls.length; i++) {
      if (targetIndexes && !targetIndexes.has(i)) {
        results.push({ originalUrl: urls[i], skipped: true });
        continue;
      }

      try {
        const edited = await editImageWithPrompt(urls[i], prompt);
        results.push({ originalUrl: urls[i], editedImage: edited, prompt, success: true });
      } catch (err) {
        results.push({ originalUrl: urls[i], error: err.message, success: false });
      }
    }

    // Optionally attach edited info back to job for review surfaces
    if (jobId) {
      const job = scrapeJobs.find(j => j.id === jobId);
      if (job) {
        job.edits = results;
        job.status = job.status || 'ready';
      }
    }

    res.json({ success: true, results });
  } catch (err) {
    console.error('Edit images error:', err);
    res.status(500).json({ success: false, message: 'Image edit failed' });
  }
});

// ============ Smart Scrape Helpers ============

async function smartScrape(url, { source = 'auto', geminiApiKey } = {}) {
  const html = await fetchHtml(url);
  const $ = cheerio.load(html);
  const domain = safeDomain(url);

  const base = {
    source,
    url,
    scrapedAt: new Date().toISOString()
  };

  const fromJsonLd = extractJsonLd($);
  const fromOg = extractOpenGraph($);

  let domainData = {};
  if (domain.includes('autotrader')) domainData = extractAutotrader($);
  else if (domain.includes('cars.com')) domainData = extractCars($);
  else if (domain.includes('cargurus')) domainData = extractCarGurus($);
  else if (domain.includes('brownboysauto.com')) domainData = extractBrownboys($);

  let merged = {
    ...base,
    ...fromJsonLd,
    ...fromOg,
    ...domainData,
    images: dedupeArray([...(fromJsonLd.images || []), ...(fromOg.images || []), ...(domainData.images || []), ...collectImages($)])
  };

  merged.price = merged.price || extractPriceText($);
  merged.mileage = merged.mileage || extractMileageText($);
  merged.vin = merged.vin || extractVinText($);

  // Use Gemini AI to refine and organize data if API key available
  const key = geminiApiKey || GEMINI_API_KEY;
  if (key && Object.keys(merged).length > 3) {
    try {
      merged = await refineWithGemini(merged, html, key);
    } catch (err) {
      console.warn('Gemini refinement skipped:', err.message);
    }
  }

  return cleanScraped(merged);
}

async function fetchHtml(url) {
  try {
    const res = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36'
      },
      timeout: 15000,
      validateStatus: () => true // allow non-200 for parsing
    });
    return res.data;
  } catch (err) {
    if (err.response?.data) return err.response.data;
    throw err;
  }
}

function safeDomain(url) {
  try {
    return new URL(url).hostname || '';
  } catch (_e) {
    return '';
  }
}

async function expandInventoryUrls(url) {
  const html = await fetchHtml(url);
  const $ = cheerio.load(html);
  const links = new Set();
  const baseUrl = new URL(url).origin;

  // Primary patterns: vehicle links, detail pages
  $('a[href*="/cars/"], a[href*="detail"], a.vehicle-link, a.listing-link').each((_, a) => {
    const href = $(a).attr('href') || '';
    if (href && (href.includes('/cars/') || href.includes('detail'))) {
      try {
        const abs = href.startsWith('http') ? href : new URL(href, url).toString();
        if (abs && !abs.includes('#')) links.add(abs);
      } catch (_e) {}
    }
  });

  // Secondary: any link with "view" or "detail" text
  if (links.size === 0) {
    $('a[href]').each((_, a) => {
      const href = $(a).attr('href') || '';
      const text = ($(a).text() || '').toLowerCase().trim();
      if ((href.includes('/cars/') || text === 'view detail' || text === 'view' || text === 'details') && href.startsWith('/')) {
        try {
          const abs = new URL(href, baseUrl).toString();
          if (abs && !abs.includes('#')) links.add(abs);
        } catch (_e) {}
      }
    });
  }

  // Fallback: scan for any URL path containing /cars/ or /used/
  if (links.size === 0) {
    const urlMatches = html.match(/href=["']([^"']*\/cars\/[^"']*)['"]/gi) || [];
    urlMatches.forEach(match => {
      const href = match.match(/href=["']([^"']*)["']/)[1];
      try {
        const abs = new URL(href, baseUrl).toString();
        if (!abs.includes('#')) links.add(abs);
      } catch (_e) {}
    });
  }

  const result = Array.from(links).slice(0, 100);
  console.log(`[expandInventoryUrls] Found ${result.length} vehicle links from ${url}`);
  return result;
}

function extractJsonLd($) {
  const payload = {};
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const json = JSON.parse($(el).text());
      const items = Array.isArray(json) ? json : [json];
      for (const item of items) {
        const type = (item['@type'] || '').toLowerCase();
        if (type.includes('vehicle') || type.includes('product')) {
          payload.year = payload.year || item.modelDate || item.productionDate;
          payload.make = payload.make || item.brand?.name;
          payload.model = payload.model || item.model || item.name;
          payload.trim = payload.trim || item.modelTrim;
          payload.price = payload.price || item.offers?.price || item.price;
          payload.mileage = payload.mileage || item.mileage?.value;
          payload.vin = payload.vin || item.vehicleIdentificationNumber || item.vin;
          payload.exteriorColor = payload.exteriorColor || item.color;
          payload.description = payload.description || item.description;
          if (item.image) {
            payload.images = payload.images || [];
            payload.images.push(...(Array.isArray(item.image) ? item.image : [item.image]));
          }
        }
      }
    } catch (_e) {
      // ignore bad JSON
    }
  });
  return payload;
}

function extractOpenGraph($) {
  const get = (prop) => $(`meta[property="${prop}"]`).attr('content') || null;
  const images = [];
  $('meta[property="og:image"]').each((_, el) => {
    const c = $(el).attr('content');
    if (c) images.push(c);
  });
  return {
    title: get('og:title') || undefined,
    description: get('og:description') || undefined,
    price: get('product:price:amount') || undefined,
    images
  };
}

function extractAutotrader($) {
  return {
    year: pickText($, ['[data-cmp="year"]']),
    make: pickText($, ['[data-cmp="make"]']),
    model: pickText($, ['[data-cmp="model"]']),
    trim: pickText($, ['[data-cmp="trim"]']),
    price: pickText($, ['[data-cmp="vdpPrice"]']),
    mileage: pickText($, ['[data-cmp="mileage"]', '[data-cmp="vehicleMileage"]']),
    vin: pickText($, ['[data-cmp="vin"]']),
    exteriorColor: pickText($, ['[data-cmp="exteriorColor"]']),
    interiorColor: pickText($, ['[data-cmp="interiorColor"]']),
    drivetrain: pickText($, ['[data-cmp="drivetrain"]']),
    transmission: pickText($, ['[data-cmp="transmission"]']),
    engine: pickText($, ['[data-cmp="engine"]']),
    dealerName: pickText($, ['[data-cmp="dealerName"]']),
    dealerPhone: pickText($, ['[data-cmp="phoneNumber"]']),
    dealerAddress: pickText($, ['[data-cmp="dealerAddress"]']),
    description: pickText($, ['[data-cmp="vdpComments"]']),
    stockNumber: pickText($, ['[data-cmp="stockNumber"]']),
    images: collectImages($)
  };
}

function extractCars($) {
  return {
    year: pickFromTitle($),
    make: pickFromTitle($, 'make'),
    model: pickFromTitle($, 'model'),
    price: pickText($, ['span.primary-price']),
    mileage: pickText($, ['[data-qa="mileage"]']),
    vin: pickText($, ['[data-qa="vin"]']),
    exteriorColor: pickText($, ['[data-qa="exterior-color"]']),
    interiorColor: pickText($, ['[data-qa="interior-color"]']),
    drivetrain: pickText($, ['[data-qa="drivetrain"]']),
    transmission: pickText($, ['[data-qa="transmission"]']),
    engine: pickText($, ['[data-qa="engine"]']),
    description: pickText($, ['[data-qa="description"]']),
    dealerName: pickText($, ['[data-qa="dealer-name"]']),
    dealerPhone: pickText($, ['[data-qa="phone-number"]']),
    dealerAddress: pickText($, ['[data-qa="dealer-address"]']),
    stockNumber: pickText($, ['[data-qa="stock-number"]']),
    images: collectImages($)
  };
}

function extractCarGurus($) {
  return {
    year: pickFromTitle($),
    make: pickFromTitle($, 'make'),
    model: pickFromTitle($, 'model'),
    price: pickText($, ['.price-section span']),
    mileage: pickText($, ['dt:contains("Mileage") + dd']),
    vin: pickText($, ['dt:contains("VIN") + dd']),
    exteriorColor: pickText($, ['dt:contains("Exterior") + dd']),
    interiorColor: pickText($, ['dt:contains("Interior") + dd']),
    drivetrain: pickText($, ['dt:contains("Drivetrain") + dd']),
    transmission: pickText($, ['dt:contains("Transmission") + dd']),
    engine: pickText($, ['dt:contains("Engine") + dd']),
    description: pickText($, ['div[class*="description"]']),
    dealerName: pickText($, ['h2[class*="dealer"]', 'div[class*="seller-name"]']),
    dealerPhone: pickText($, ['a[href^="tel:"]']),
    dealerAddress: pickText($, ['address', 'div[class*="dealer-address"]']),
    stockNumber: pickText($, ['dt:contains("Stock") + dd']),
    images: collectImages($)
  };
}

function extractBrownboys($) {
  const getLabel = (label) => {
    const text = $('body').html() || '';
    // Try HTML-aware regex
    const regex = new RegExp(`${label}\\s*:?\\s*<[^>]*>([^<]+)<`, 'i');
    const m = text.match(regex);
    if (m) return m[1].trim();
    
    // Try plain text
    const plainText = $('body').text();
    const m2 = plainText.match(new RegExp(label + "\\s*:?\\s*([^\\n\\r:]+)", 'i'));
    return m2 ? m2[1].trim() : null;
  };

  // Extract from structured fields (specs rows)
  const specs = {};
  $('[class*="spec"], [class*="detail"], [class*="info"], dt, [class*="field"]').each((_, el) => {
    const $el = $(el);
    const text = $el.text().trim();
    const nextText = $el.next().text().trim() || $el.next().next().text().trim();
    if (text && nextText && text.length < 30 && nextText.length < 100) {
      specs[text.toLowerCase()] = nextText;
    }
  });

  const year = getLabel('Year') || pickFromTitle($) || specs.year || specs['model year'];
  const make = getLabel('Make') || pickFromTitle($, 'make') || specs.make || specs['brand'];
  const model = getLabel('Model') || pickFromTitle($, 'model') || specs.model || specs['model name'];
  const trim = getLabel('Trim') || specs.trim || specs['body style'];
  const price = extractPriceText($) || specs.price || getLabel('Price');
  const mileage = (getLabel('Odometer') || getLabel('Mileage') || specs.mileage || specs.odometer || '').replace(/[^\d,]/g, '');
  const vin = getLabel('Vin') || getLabel('VIN') || extractVinText($) || specs.vin;
  const exteriorColor = getLabel('Exterior Color') || getLabel('Color') || specs['exterior color'] || specs['color'];
  const interiorColor = getLabel('Interior Color') || specs['interior color'];
  const transmission = getLabel('Transmission') || specs.transmission || specs['trans'];
  const drivetrain = getLabel('Drivetrain') || specs.drivetrain || specs['drive type'];
  const engine = getLabel('Engine') || specs.engine || specs['engine type'];
  const fuelType = getLabel('Fuel') || specs['fuel type'] || specs.fuel;
  const body = getLabel('Body') || specs['body type'] || specs.body;
  const description = ($('h3:contains("Description"), h2:contains("Description"), [class*="description"]').nextAll('p').text() || '').trim() || getLabel('Description');

  return {
    year, make, model, trim, price, mileage, vin,
    exteriorColor, interiorColor, transmission, drivetrain, engine, fuelType, body,
    description,
    images: collectImages($)
  };
}

function pickText($, selectors = []) {
  for (const sel of selectors) {
    const node = $(sel).first();
    const text = node && (node.text() || '').trim();
    if (text) return text;
  }
  return null;
}

function pickFromTitle($, part) {
  const t = $('h1').first().text().trim();
  const match = t.match(/(\d{4})\s+([A-Za-z]+)\s+([A-Za-z0-9\s-]+)/);
  if (!match) return null;
  if (!part) return match[1];
  if (part === 'make') return match[2];
  if (part === 'model') return match[3];
  return null;
}

function collectImages($) {
  const imgs = [];
  $('meta[property="og:image"]').each((_, el) => {
    const c = $(el).attr('content');
    if (c) imgs.push(c);
  });
  $('img').each((_, el) => {
    const src = $(el).attr('src') || $(el).attr('data-src');
    if (src && src.startsWith('http')) imgs.push(src);
  });
  return dedupeArray(imgs).slice(0, 20);
}

function extractPriceText($) {
  const body = $('body').text();
  const m = body.match(/\$[\d,]+/);
  return m ? m[0] : null;
}

function extractMileageText($) {
  const body = $('body').text();
  const m = body.match(/([\d,]+)\s*(?:mi|miles)/i);
  return m ? m[1] : null;
}

function extractVinText($) {
  const body = $('body').text();
  const m = body.match(/\b([A-HJ-NPR-Z0-9]{17})\b/);
  return m ? m[1] : null;
}

async function refineWithGemini(data, html, apiKey) {
  try {
    if (!apiKey) return data;
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

    // Prepare HTML excerpt for Gemini
    const textContent = html.slice(0, 8000);
    const prompt = `You are a data extraction expert. Analyze this vehicle listing HTML and extract ALL key data.

Return ONLY valid JSON (no markdown, no code blocks, no explanation).

JSON fields to extract (use null if not found):
{
  "year": number or null,
  "make": string or null,
  "model": string or null,
  "trim": string or null,
  "price": number or null,
  "mileage": number or null,
  "vin": string or null,
  "transmission": string or null,
  "drivetrain": string or null,
  "engine": string or null,
  "fuelType": string or null,
  "exteriorColor": string or null,
  "interiorColor": string or null,
  "body": string or null,
  "description": string or null
}

Current extracted data: ${JSON.stringify(data)}

HTML excerpt: ${textContent}

IMPORTANT: Return ONLY the JSON object, nothing else.`;

    const result = await model.generateContent(prompt);
    const text = result.response.text().trim();
    
    // Clean up markdown code blocks if present
    let json = text.replace(/^```json\n/i, '').replace(/\n```$/i, '').replace(/^```\n/i, '').replace(/\n```$/i, '').trim();
    
    const parsed = JSON.parse(json);
    
    const refined = { ...data };
    Object.keys(parsed).forEach(key => {
      if (parsed[key] !== null && parsed[key] !== undefined && parsed[key] !== '') {
        refined[key] = parsed[key];
      }
    });
    
    console.log(`[Gemini] Refined ${Object.keys(parsed).filter(k => parsed[k]).length} fields for ${data.url?.slice(0, 50)}`);
    return refined;
  } catch (err) {
    console.warn('[Gemini refinement] Error:', err.message);
    return data;
  }
}

function dedupeArray(arr = []) {
  return Array.from(new Set(arr.filter(Boolean)));
}

function cleanScraped(obj) {
  const cleaned = { ...obj };
  Object.keys(cleaned).forEach((k) => {
    if (cleaned[k] === null || cleaned[k] === undefined || cleaned[k] === '') delete cleaned[k];
  });
  return cleaned;
}

async function editImageWithPrompt(imageUrl, prompt = '') {
  const resp = await axios.get(imageUrl, { responseType: 'arraybuffer', timeout: 10000 });
  let img = sharp(Buffer.from(resp.data));
  const lower = (prompt || '').toLowerCase();

  if (lower.includes('bright') || lower.includes('lighten') || lower.includes('enhance')) {
    img = img.modulate({ brightness: 1.1, saturation: 1.1 });
  }
  if (lower.includes('contrast')) {
    img = img.linear(1.1, -12);
  }
  if (lower.includes('sharp')) {
    img = img.sharpen();
  }
  if (lower.includes('remove background') || lower.includes('white background')) {
    img = img.flatten({ background: { r: 255, g: 255, b: 255 } });
  }

  const buffer = await img.jpeg({ quality: 90 }).toBuffer();
  const base64 = buffer.toString('base64');
  return `data:image/jpeg;base64,${base64}`;
}

// Start server
app.listen(PORT, () => {
  console.log(`\n🚀 AutoBridge Backend Running`);
  console.log(`📡 Server: http://localhost:${PORT}`);
  console.log(`🔐 Demo Login: demo / demo`);
  console.log(`👑 Admin Setup: POST /api/auth/setup-admin\n`);
});
