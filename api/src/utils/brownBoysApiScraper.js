import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import axios from 'axios';
import * as cheerio from 'cheerio';

// Add stealth plugin to bypass Cloudflare
puppeteer.use(StealthPlugin());

// ScraperAPI key (free tier: 1000 requests/month)
// Users can get their own key at https://www.scraperapi.com/
const SCRAPER_API_KEY = process.env.SCRAPER_API_KEY || '';

/**
 * Scrapes Brown Boys Auto vehicles using multiple approaches
 * 1. First tries ScraperAPI if key is configured (bypasses Cloudflare)
 * 2. Falls back to direct Puppeteer if no API key
 */
export async function scrapeBrownBoysViaAPI(options = {}) {
    const {
        targetCount = 50,
        existingVins = new Set(),
        filters = {}
    } = options;

    console.log(`[HTML Scraper] 🚀 Starting scraping for ${targetCount} NEW vehicles`);
    console.log(`[HTML Scraper] 📋 Existing VINs to skip: ${existingVins.size}`);

    // Build the URL with filters
    const urlParams = new URLSearchParams();
    if (filters.make) urlParams.set('make', filters.make);
    if (filters.model) urlParams.set('model', filters.model);
    if (filters.year_start) urlParams.set('Minyear', filters.year_start);
    if (filters.year_end) urlParams.set('Maxyear', filters.year_end);

    const listingUrl = `https://www.brownboysauto.com/cars?${urlParams.toString()}`;
    console.log(`[HTML Scraper] 🔗 Target URL: ${listingUrl}`);

    // Fallback chain
    try {
        console.log('[HTML Scraper] 🔹 Strategy 1: Direct Puppeteer (API Injection)');
        return await scrapeWithPuppeteer(listingUrl, targetCount, existingVins, filters);
    } catch (error) {
        console.warn(`[HTML Scraper] ⚠️ Strategy 1 Failed: ${error.message}`);
    }

    // Strategy 2: ScraperAPI (if key exists)
    if (SCRAPER_API_KEY) {
        try {
            console.log('[HTML Scraper] 🔹 Strategy 2: ScraperAPI');
            return await scrapeWithScraperAPI(listingUrl, targetCount, existingVins);
        } catch (error) {
            console.warn(`[HTML Scraper] ⚠️ Strategy 2 Failed: ${error.message}`);
        }
    } else {
        console.log('[HTML Scraper] ℹ️ Strategy 2 Skipped (No SCRAPER_API_KEY)');
    }

    // Strategy 3: Google Translate Proxy
    try {
        console.log('[HTML Scraper] 🔹 Strategy 3: Google Translate Proxy');
        return await scrapeWithGoogleTranslate(listingUrl, targetCount, existingVins);
    } catch (error) {
        console.warn(`[HTML Scraper] ⚠️ Strategy 3 Failed: ${error.message}`);
    }

    // Strategy 4: Free Proxies
    try {
        console.log('[HTML Scraper] 🔹 Strategy 4: Free Proxies');
        return await scrapeWithFreeProxy(listingUrl, targetCount, existingVins);
    } catch (error) {
        console.warn(`[HTML Scraper] ⚠️ Strategy 4 Failed: ${error.message}`);
        throw new Error('All scraping strategies failed for Brown Boys Auto');
    }
}

/**
 * Scrape using Google Translate as a proxy to bypass IP blocks
 */
async function scrapeWithGoogleTranslate(listingUrl, targetCount, existingVins) {
    console.log('[GTranslate] 🌐 Attempting to fetch via Google Translate...');

    // Construct Google Translate URL
    // Pattern: https://www-brownboysauto-com.translate.goog/cars?minyear=2017...
    const urlObj = new URL(listingUrl);
    const hostPart = urlObj.hostname.replace(/\./g, '-');
    const translateUrl = `https://${hostPart}.translate.goog${urlObj.pathname}${urlObj.search}&_x_tr_sl=auto&_x_tr_tl=en&_x_tr_hl=en&_x_tr_pto=wapp`;

    console.log(`[GTranslate] 🔗 Proxy URL: ${translateUrl}`);

    const response = await axios.get(translateUrl, {
        timeout: 30000,
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
    });

    // Check for success
    if (!response.data || response.data.includes('Cloudflare') && response.data.includes('blocked')) {
        throw new Error('Google Translate blocked by Cloudflare');
    }

    console.log('[GTranslate] ✅ Successfully fetched content');

    // Parse with cheerio
    const $ = cheerio.load(response.data);
    const scrapedVehicles = [];
    let totalSkipped = 0;

    // In translated pages, domains might be rewritten, so checking hrefs needs care
    // Also, Google sometimes injects iframes, so we need to be robust

    const vehicleCards = $('.special-vehicle');
    console.log(`[GTranslate] 📦 Found ${vehicleCards.length} vehicle cards`);

    if (vehicleCards.length === 0) {
        // Debug: Dump part of body if no cards found
        console.log(`[GTranslate] 📝 Body preview: ${$('body').text().substring(0, 200).replace(/\n/g, ' ')}`);
        throw new Error('No vehicles found in translated page');
    }

    vehicleCards.each((index, card) => {
        if (scrapedVehicles.length >= targetCount) return false;

        try {
            const $card = $(card);

            // Link might be rewritten to translate.goog
            let detailLink = $card.find('a[href*="/cars/used/"]').attr('href');
            if (!detailLink) return;

            // Clean up the link (remove google translate parts if present)
            // It might look like: https://www-brownboysauto-com.translate.goog/cars/used/...?_x_tr...
            // We just need the path part usually

            // Extract the original vehicle ID and year/make/model from the URL structure
            // Look for pattern: /cars/used/2020-volkswagen-passat-513643
            const urlMatch = detailLink.match(/\/cars\/used\/(\d{4})-(.+)-(\d+)/);
            if (!urlMatch) return;

            const year = parseInt(urlMatch[1]);
            const vehicleId = urlMatch[3];
            const makeModelPart = urlMatch[2];

            const parts = makeModelPart.split('-');
            const make = parts[0] ? parts[0].charAt(0).toUpperCase() + parts[0].slice(1) : '';
            const model = parts.slice(1).map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');

            // Image source might also be rewritten
            const img = $card.find('img');
            let imageUrl = img.attr('src') || '';
            // If it's a google translate image proxy, try to extract original or use it
            // usually it just works or points to original domain

            const priceText = $card.find('.main-bg').text().replace(/[^0-9.]/g, '');
            const price = parseFloat(priceText) || 0;
            const title = $card.find('.font-weight-bold').last().text().trim() || `${year} ${make} ${model}`;

            const vin = `BROWNBOYS-${vehicleId}`;

            if (existingVins.has(vin)) {
                totalSkipped++;
                return;
            }

            // Reconstruct original valid URL
            const sourceUrl = `https://www.brownboysauto.com/cars/used/${year}-${makeModelPart}-${vehicleId}`;

            scrapedVehicles.push({
                vehicleId,
                vin,
                year,
                make,
                model,
                title,
                price,
                mileage: 0,
                sourceUrl,
                images: imageUrl ? [imageUrl.replace('thumb-', '')] : []
            });

            console.log(`[GTranslate] ✅ Scraped: ${title} (${scrapedVehicles.length}/${targetCount})`);
        } catch (err) {
            console.log(`[GTranslate] ⚠️ Error parsing card: ${err.message}`);
        }
    });

    console.log(`[GTranslate] 🏁 Complete! Scraped ${scrapedVehicles.length} vehicles`);

    return {
        vehicles: scrapedVehicles,
        totalScraped: scrapedVehicles.length,
        totalSkipped,
        pagesProcessed: 1
    };
}

/**
 * Scrape using free proxy services (AllOrigins, etc.)
 */
async function scrapeWithFreeProxy(listingUrl, targetCount, existingVins) {
    console.log('[FreeProxy] 🌐 Attempting to fetch via free proxy...');

    // Try multiple free proxy services
    const proxies = [
        `https://api.allorigins.win/raw?url=${encodeURIComponent(listingUrl)}`,
        `https://corsproxy.io/?${encodeURIComponent(listingUrl)}`,
    ];

    let html = null;

    for (const proxyUrl of proxies) {
        try {
            console.log(`[FreeProxy] 📡 Trying: ${proxyUrl.substring(0, 50)}...`);
            const response = await axios.get(proxyUrl, {
                timeout: 30000,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                }
            });

            // Check if we got actual content (not Cloudflare block)
            if (response.data && !response.data.includes('Cloudflare') && !response.data.includes('blocked')) {
                html = response.data;
                console.log('[FreeProxy] ✅ Successfully fetched via proxy');
                break;
            }
        } catch (err) {
            console.log(`[FreeProxy] ⚠️ Proxy failed: ${err.message}`);
        }
    }

    if (!html) {
        throw new Error('All free proxies failed');
    }

    // Parse with cheerio
    const $ = cheerio.load(html);
    const scrapedVehicles = [];
    let totalSkipped = 0;

    const vehicleCards = $('.special-vehicle');
    console.log(`[FreeProxy] 📦 Found ${vehicleCards.length} vehicle cards`);

    if (vehicleCards.length === 0) {
        throw new Error('No vehicles found - proxy may have been blocked');
    }

    vehicleCards.each((index, card) => {
        if (scrapedVehicles.length >= targetCount) return false;

        try {
            const $card = $(card);
            const detailLink = $card.find('a[href*="/cars/used/"]').attr('href');
            if (!detailLink) return;

            const urlMatch = detailLink.match(/\/cars\/used\/(\d{4})-(.+)-(\d+)$/);
            if (!urlMatch) return;

            const year = parseInt(urlMatch[1]);
            const vehicleId = urlMatch[3];
            const parts = urlMatch[2].split('-');
            const make = parts[0] ? parts[0].charAt(0).toUpperCase() + parts[0].slice(1) : '';
            const model = parts.slice(1).map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');

            const imageUrl = $card.find('img').attr('src') || '';
            const priceText = $card.find('.main-bg').text().replace(/[^0-9.]/g, '');
            const price = parseFloat(priceText) || 0;
            const title = $card.find('.font-weight-bold').last().text().trim() || `${year} ${make} ${model}`;

            const vin = `BROWNBOYS-${vehicleId}`;

            if (existingVins.has(vin)) {
                totalSkipped++;
                return;
            }

            scrapedVehicles.push({
                vehicleId,
                vin,
                year,
                make,
                model,
                title,
                price,
                mileage: 0,
                sourceUrl: `https://www.brownboysauto.com${detailLink}`,
                images: imageUrl ? [imageUrl.replace('thumb-', '')] : []
            });

            console.log(`[FreeProxy] ✅ Scraped: ${title} (${scrapedVehicles.length}/${targetCount})`);
        } catch (err) {
            console.log(`[FreeProxy] ⚠️ Error: ${err.message}`);
        }
    });

    console.log(`[FreeProxy] 🏁 Complete! Scraped ${scrapedVehicles.length} vehicles`);

    return {
        vehicles: scrapedVehicles,
        totalScraped: scrapedVehicles.length,
        totalSkipped,
        pagesProcessed: 1
    };
}

/**
 * Scrape using ScraperAPI (handles Cloudflare automatically)
 */
async function scrapeWithScraperAPI(listingUrl, targetCount, existingVins) {
    console.log('[ScraperAPI] 🌐 Fetching page via ScraperAPI...');

    const scraperApiUrl = `http://api.scraperapi.com?api_key=${SCRAPER_API_KEY}&url=${encodeURIComponent(listingUrl)}&render=true&country_code=us`;

    const response = await axios.get(scraperApiUrl, { timeout: 120000 });
    const html = response.data;

    console.log('[ScraperAPI] ✅ Page fetched successfully');

    // Parse HTML with cheerio
    const $ = cheerio.load(html);
    const scrapedVehicles = [];
    let totalSkipped = 0;

    // Find all vehicle cards
    const vehicleCards = $('.special-vehicle');
    console.log(`[ScraperAPI] 📦 Found ${vehicleCards.length} vehicle cards`);

    vehicleCards.each((index, card) => {
        if (scrapedVehicles.length >= targetCount) return false;

        try {
            const $card = $(card);

            // Get detail link
            const detailLink = $card.find('a[href*="/cars/used/"]').attr('href');
            if (!detailLink) return;

            const sourceUrl = `https://www.brownboysauto.com${detailLink}`;

            // Parse URL: /cars/used/2020-volkswagen-passat-513643
            const urlMatch = detailLink.match(/\/cars\/used\/(\d{4})-(.+)-(\d+)$/);
            if (!urlMatch) return;

            const year = parseInt(urlMatch[1]);
            const vehicleId = urlMatch[3];
            const makeModelPart = urlMatch[2];

            // Split make/model
            const parts = makeModelPart.split('-');
            const make = parts[0] ? parts[0].charAt(0).toUpperCase() + parts[0].slice(1) : '';
            const model = parts.slice(1).map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');

            // Get image
            const imageUrl = $card.find('img').attr('src') || '';

            // Get price
            const priceText = $card.find('.main-bg').text().replace(/[^0-9.]/g, '');
            const price = parseFloat(priceText) || 0;

            // Get title
            const title = $card.find('.font-weight-bold').last().text().trim() || `${year} ${make} ${model}`;

            // Generate placeholder VIN
            const vin = `BROWNBOYS-${vehicleId}`;

            // Skip if exists
            if (existingVins.has(vin)) {
                totalSkipped++;
                return;
            }

            scrapedVehicles.push({
                vehicleId,
                vin,
                year,
                make,
                model,
                title,
                price,
                mileage: 0,
                sourceUrl,
                images: imageUrl ? [imageUrl.replace('thumb-', '')] : []
            });

            console.log(`[ScraperAPI] ✅ Scraped: ${title} (${scrapedVehicles.length}/${targetCount})`);
        } catch (err) {
            console.log(`[ScraperAPI] ⚠️ Error parsing card: ${err.message}`);
        }
    });

    console.log(`[ScraperAPI] 🏁 Scraping complete!`);
    console.log(`[ScraperAPI] 📦 Total scraped: ${scrapedVehicles.length}`);

    return {
        vehicles: scrapedVehicles,
        totalScraped: scrapedVehicles.length,
        totalSkipped,
        pagesProcessed: 1
    };
}

/**
 * Scrape using direct Puppeteer (may be blocked by Cloudflare)
 */
/**
 * Scrape using direct Puppeteer (migrated to US server)
 * Now navigates to detail pages and extracts full data from __NEXT_DATA__ JSON
 */
async function scrapeWithPuppeteer(listingUrl, targetCount, existingVins, filters, existingUrls) {
    const scrapedVehicles = [];
    let totalSkipped = 0;
    let browser = null;

    try {
        console.log('[Puppeteer] 🌐 Launching stealth browser...');

        // Launch browser
        browser = await puppeteer.launch({
            headless: 'new',
            executablePath: '/usr/bin/chromium',
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu',
                '--disable-web-security',
                '--disable-features=IsolateOrigins,site-per-process',
                '--disable-blink-features=AutomationControlled',
                '--window-size=1920,1080'
            ],
            ignoreDefaultArgs: ['--enable-automation']
        });

        const page = await browser.newPage();
        await page.setViewport({ width: 1920, height: 1080 });
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

        // 1. Navigate to Listing Page to establish context/cookies
        console.log(`[Puppeteer] 🔗 Navigating to Context: https://www.brownboysauto.com/cars`);
        await page.goto('https://www.brownboysauto.com/cars', { waitUntil: 'networkidle2', timeout: 60000 });

        // 2. Fetch cars.json to get valid vehicle IDs with slugs
        console.log('[Puppeteer] 📥 Fetching cars.json for slug validation...');
        const buildId = await page.evaluate(() => window.__NEXT_DATA__?.buildId);

        let vehicleSlugMap = new Map(); // Map of id -> slug
        if (buildId) {
            const dataUrl = `https://www.brownboysauto.com/_next/data/${buildId}/cars.json`;
            console.log(`[Puppeteer] 🔑 Build ID: ${buildId}`);

            const carsData = await page.evaluate(async (url) => {
                try {
                    const res = await fetch(url);
                    if (!res.ok) return null;
                    return await res.json();
                } catch (e) {
                    return null;
                }
            }, dataUrl);

            // Debug: Log structure to find fullIds
            if (carsData) {
                console.log('[Puppeteer] 📊 cars.json keys:', Object.keys(carsData));
                if (carsData.pageProps) {
                    console.log('[Puppeteer] 📊 pageProps keys:', Object.keys(carsData.pageProps));
                    if (carsData.pageProps.preFetchedData) {
                        const prefData = carsData.pageProps.preFetchedData;
                        console.log('[Puppeteer] 📊 preFetchedData keys:', Object.keys(prefData));

                        // FULL DATA DUMP (first 3000 chars) to visually inspect
                        console.log('[Puppeteer] 📊 FULL preFetchedData structure (first 3000 chars):');
                        console.log(JSON.stringify(prefData, null, 2).substring(0, 3000));

                        // Check if fullIds is directly in preFetchedData
                        if (prefData.fullIds) {
                            console.log('[Puppeteer] 📍 fullIds found directly in preFetchedData!');
                            console.log('[Puppeteer] 📊 fullIds length:', prefData.fullIds.length);
                        }

                        // Check vehiclesData
                        console.log('[Puppeteer] 📊 vehiclesData type:', typeof prefData.vehiclesData);
                        if (prefData.vehiclesData) {
                            if (Array.isArray(prefData.vehiclesData)) {
                                console.log('[Puppeteer] 📊 vehiclesData is array, length:', prefData.vehiclesData.length);
                                if (prefData.vehiclesData.length > 0) {
                                    console.log('[Puppeteer] 📊 vehiclesData[0] sample:', JSON.stringify(prefData.vehiclesData[0]).substring(0, 200));
                                }
                            } else {
                                console.log('[Puppeteer] 📊 vehiclesData keys:', Object.keys(prefData.vehiclesData));
                                // Check if fullIds is inside vehiclesData object
                                if (prefData.vehiclesData.fullIds) {
                                    console.log('[Puppeteer] 📍 fullIds found in vehiclesData!');
                                }
                            }
                        }

                        // Check dealerData
                        if (prefData.dealerData) {
                            console.log('[Puppeteer] 📊 dealerData type:', typeof prefData.dealerData);
                            if (typeof prefData.dealerData === 'object' && !Array.isArray(prefData.dealerData)) {
                                console.log('[Puppeteer] 📊 dealerData keys:', Object.keys(prefData.dealerData));
                                if (prefData.dealerData.fullIds) {
                                    console.log('[Puppeteer] 📍 fullIds found in dealerData!');
                                }
                            }
                        }
                    }
                }
            }
            // Try ALL possible paths for fullIds
            let fullIds = null;
            const prefData = carsData?.pageProps?.preFetchedData;

            // Correct path: vehiclesData[0].fullIds
            if (Array.isArray(prefData?.vehiclesData) && prefData.vehiclesData.length > 0 && prefData.vehiclesData[0].fullIds) {
                fullIds = prefData.vehiclesData[0].fullIds;
                console.log('[Puppeteer] 📍 Using fullIds from vehiclesData[0].fullIds');
            } else if (prefData?.fullIds) {
                fullIds = prefData.fullIds;
                console.log('[Puppeteer] 📍 Using fullIds from preFetchedData');
            } else if (prefData?.vehiclesData?.fullIds) {
                fullIds = prefData.vehiclesData.fullIds;
                console.log('[Puppeteer] 📍 Using fullIds from vehiclesData');
            } else if (prefData?.dealerData?.fullIds) {
                fullIds = prefData.dealerData.fullIds;
                console.log('[Puppeteer] 📍 Using fullIds from dealerData');
            }

            if (fullIds && Array.isArray(fullIds)) {
                fullIds.forEach(item => {
                    if (item.id && item.slug) {
                        vehicleSlugMap.set(item.id, item.slug);
                    }
                });
                console.log(`[Puppeteer] ✅ Found ${vehicleSlugMap.size} vehicles with valid slugs`);
            } else {
                console.log('[Puppeteer] ⚠️ Could not extract fullIds from cars.json, proceeding without slug filter');
            }
        } else {
            console.log('[Puppeteer] ⚠️ Could not extract Build ID, proceeding without slug filter');
        }

        // API Pagination Loop
        let currentPage = 1;
        let hasMore = true;
        const BATCH_SIZE = 10; // API default seems to be 10

        console.log('[Puppeteer] 🔄 Starting API-based Pagination...');

        while (hasMore && scrapedVehicles.length < targetCount) {
            console.log(`[Puppeteer] 📄 Fetching Page ${currentPage}...`);

            // Construct API URL (base URL with pagination only)
            const apiUrl = `https://api.hillzusers.com/api/dealership/advance/search/vehicles/www.brownboysauto.com?page=${currentPage}&limit=${BATCH_SIZE}`;

            // Build request body matching the exact API format
            // Only use defaults when filter value is null/undefined
            const requestBody = {
                fuel_type: filters.fuel_type || "",
                body_style: filters.body_style || "",
                engine_cylinders: filters.engine_cylinders || "",
                year_end: filters.year_end !== null ? filters.year_end : 2027,
                price_low: filters.price_low ? filters.price_low : 0,
                price_high: filters.price_high || "",
                odometer_type: 2,
                make: filters.make || "",
                model: filters.model || "",
                transmission: filters.transmission || "",
                drive_train: "",
                doors: filters.doors || "",
                interior_color: filters.interior_color || "",
                Exterior_color: filters.exterior_color || "",
                sortKind: {
                    kind: "",
                    type: null,
                    order: 0
                },
                kind: "",
                type: "null",
                order: 0,
                sold: "",
                is_coming_soon: "",
                is_it_special: null,
                year_start: filters.year_start !== null ? filters.year_start : 0,
                odometer_low: filters.odometer_low !== null ? filters.odometer_low : 0,
                odometer_high: filters.odometer_high !== null ? filters.odometer_high : 162000,
                keywords: ""
            };

            console.log(`[Puppeteer] 🔍 Request Body:`, JSON.stringify(requestBody, null, 2));

            // Fetch data inside page context (bypasses CORS/Cloudflare)
            const apiResult = await page.evaluate(async (url, body) => {
                try {
                    const res = await fetch(url, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(body)
                    });

                    const responseText = await res.text();
                    let data;
                    try {
                        data = JSON.parse(responseText);

                    } catch (e) {
                        return { error: `Invalid JSON response: ${responseText.substring(0, 200)}` };
                    }

                    if (!res.ok) {
                        return { error: `Status ${res.status}`, response: data };
                    }

                    return { data, status: res.status };
                } catch (e) {
                    return { error: e.toString() };
                }
            }, apiUrl, requestBody);

            console.log(`[Puppeteer] 📡 API Response Status:`, apiResult.status || 'error');
            if (apiResult.error) {
                console.log(`[Puppeteer] ❌ API Error:`, apiResult.error);
                if (apiResult.response) {
                    console.log(`[Puppeteer] 📄 Response Body:`, JSON.stringify(apiResult.response, null, 2));
                }
            }

            if (apiResult.error) {
                console.log(`[Puppeteer] ❌ Error fetching API page ${currentPage}: ${apiResult.error}`);
                break;
            }

            const vehicles = apiResult.data;
            if (!vehicles || !Array.isArray(vehicles) || vehicles.length === 0) {
                console.log(`[Puppeteer] 🛑 No more vehicles returned on page ${currentPage}.`);
                hasMore = false;
                break;
            }

            console.log(`[Puppeteer] 📦 API returned ${vehicles.length} items on page ${currentPage}`);

            for (const item of vehicles) {
                if (scrapedVehicles.length >= targetCount) break;

                try {
                    // Normalize Data
                    // Structure: item -> { id, sell_price, special_price, comment, Vehicle: { ... }, MidVDSMedia: [...] }
                    const info = item.Vehicle || {};

                    const vin = info.vin_number || item.vin || Object.values(item).find(v => typeof v === 'string' && v.length === 17) || `BROWNBOYS-${item.id}`;

                    // Check duplicates
                    if (existingVins.has(vin)) {
                        totalSkipped++;
                        continue;
                    }

                    // Check if vehicle has valid slug (from cars.json)
                    if (vehicleSlugMap.size > 0 && !vehicleSlugMap.has(item.id)) {
                        console.log(`[Puppeteer] ⏭️ Skipping vehicle ${item.id} - no valid slug found in cars.json`);
                        totalSkipped++;
                        continue;
                    }

                    // Extract Details from Nested 'Vehicle' Object
                    const year = Number(info.model_year) || Number(item.year) || 0;
                    const make = info.make || item.make || 'Unknown';
                    const model = info.model || item.model || 'Unknown';
                    const trim = info.trim || item.trim || '';

                    // Construct URL - prioritize slug from cars.json
                    let sourceUrl;
                    if (vehicleSlugMap.has(item.id)) {
                        // BEST: Use exact slug from cars.json
                        const slug = vehicleSlugMap.get(item.id);
                        sourceUrl = `https://www.brownboysauto.com${slug}`;
                        console.log(`[Puppeteer] ✅ Using cars.json slug for vehicle ${item.id}`);
                    } else if (item.slug) {
                        // Fallback 1: Use slug from API
                        const slug = item.slug.startsWith('/') ? item.slug : `/${item.slug}`;
                        sourceUrl = `https://www.brownboysauto.com${slug}`;
                    } else {
                        // Fallback 2: Construct URL from Make/Model
                        const makeSlug = make.replace(/\s+/g, '-');
                        const modelSlug = model.replace(/\s+/g, '-');
                        sourceUrl = `https://www.brownboysauto.com/cars/used/${year}-${makeSlug}-${modelSlug}-${item.id}`;
                    }

                    // --- DETAIL PAGE SCRAPING (For Full Images) ---
                    if (sourceUrl) {
                        let detailBrowser = null; // Renamed to avoid conflict with outer browser
                        let detailPage = null; // Renamed to avoid conflict with outer page
                        try {
                            detailBrowser = await puppeteer.launch({
                                headless: 'new',
                                executablePath: '/usr/bin/chromium',
                                args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--window-size=1920,1080']
                            });
                            detailPage = await detailBrowser.newPage();

                            // Mobile Emulation for BrownBoysAuto
                            const isBrownBoys = sourceUrl.includes('brownboysauto.com'); // Use sourceUrl here
                            if (isBrownBoys) {
                                await detailPage.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15E148 Safari/604.1');
                                await detailPage.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
                            } else {
                                await detailPage.setViewport({ width: 1920, height: 1080 });
                            }

                            console.log(`[Puppeteer] 📸 Visits Detail Page for Images: ${sourceUrl}`);
                            try {
                                await detailPage.goto(sourceUrl, { waitUntil: 'networkidle2', timeout: 45000 });
                            } catch (err) {
                                console.warn(`[Detailed Page] Navigation warning: ${err.message}`);
                            }

                            // Wait for gallery
                            try {
                                await detailPage.waitForSelector('.image-gallery-image, .image-gallery-slide img, .image-gallery-thumbnail-image', { timeout: 15000 });
                            } catch (e) {
                                console.log('Timeout waiting for gallery selectors, trying extraction anyway...');
                            }

                            const images = await detailPage.evaluate(() => {
                                const imgSrcs = new Set();

                                // 1. Standard Gallery
                                document.querySelectorAll('.image-gallery-image').forEach(img => {
                                    if (img.src) imgSrcs.add(img.src);
                                });

                                // 2. User Reported Selectors (Mobile/Responsive)
                                // The user's snippet showed images in .image-gallery-slide AND .image-gallery-thumbnail-image
                                document.querySelectorAll('.image-gallery-slide img').forEach(img => {
                                    if (img.src) imgSrcs.add(img.src);
                                });
                                document.querySelectorAll('.image-gallery-thumbnail-image').forEach(img => {
                                    if (img.src) imgSrcs.add(img.src);
                                });

                                // 3. Fallback: Azure Edge (Host specific)
                                document.querySelectorAll('img[src*="azureedge"]').forEach(img => {
                                    if (img.src) imgSrcs.add(img.src);
                                });

                                return Array.from(imgSrcs);
                            });

                            console.log(`[Detailed Page] Found ${images.length} images for ${sourceUrl}`);
                            if (images.length > 0) {
                                item.images = images;
                            } else if (item.MidVDSMedia) {
                                // Keep API images if scrape failed
                                item.images = item.MidVDSMedia.map(m => m.media_src || m.src).filter(Boolean);
                            }

                        } catch (error) {
                            console.error(`[Detailed Page] Error scraping ${sourceUrl}:`, error);
                        } finally {
                            if (detailBrowser) await detailBrowser.close();
                        }
                    }

                    // Extract Preview Images (Fallback)
                    // Priority 1: MidVDSMedia array
                    let previewImages = [];
                    if (item.MidVDSMedia && Array.isArray(item.MidVDSMedia)) {
                        previewImages = item.MidVDSMedia.map(img => img.media_src || img.src).filter(Boolean);
                    }
                    // Priority 2: info.images (if any)
                    else if (info.images && Array.isArray(info.images)) {
                        previewImages = info.images.map(img => img.media_src || img.src).filter(Boolean);
                    }

                    // Priority 3: cover_image
                    if (previewImages.length === 0 && item.cover_image) {
                        previewImages.push(item.cover_image);
                    } else if (previewImages.length === 0 && item.thumbnail_cover_image) {
                        previewImages.push(item.thumbnail_cover_image);
                    }

                    // Fix Preview URLs
                    previewImages = previewImages.map(src => {
                        if (!src) return '';
                        let cleanSrc = src;
                        if (!cleanSrc.startsWith('http')) {
                            const prefix = 'https://image123.azureedge.net';
                            cleanSrc = `${prefix}${cleanSrc.startsWith('/') ? '' : '/'}${cleanSrc}`;
                        }
                        return cleanSrc;
                    });

                    // MERGE IMAGES: Prefer Detail Page images, fall back to Preview
                    const detailImages = item.images || [];
                    let images = detailImages.length > previewImages.length ? detailImages : previewImages;
                    // Ensure we have at least something
                    if (images.length === 0 && previewImages.length > 0) images = previewImages;


                    // Extract Features
                    // Found in 'more_option' array: ["$0$Dual Air Conditioning", ...]
                    let features = [];
                    if (item.more_option && Array.isArray(item.more_option)) {
                        features = item.more_option.map(opt => opt.replace(/^\$[0-9]+\$/, '').trim());
                    } else if (info.standard && typeof info.standard === 'object') {
                        Object.values(info.standard).forEach(v => {
                            if (Array.isArray(v)) features.push(...v);
                        });
                    }

                    // Price prioritization
                    const price = Number(item.special_price || item.sell_price || item.internet_price || info.price || 0);

                    const scrapedVehicle = {
                        vehicleId: String(item.id),
                        vin: vin,
                        year: year,
                        make: make,
                        model: model,
                        trim: trim,
                        title: `${year} ${make} ${model} ${trim}`.trim(),
                        price: price,
                        mileage: Number(info.odometer || item.odometer || 0), // Odometer seems to be on top level item too
                        description: item.comment ? item.comment.replace(/<[^>]*>/g, '').trim() : (info.comment || ''),
                        images: images,
                        sourceUrl: sourceUrl,
                        features: features,

                        // Detailed Specs
                        transmission: info.transmission || (info.Transmission ? info.Transmission.name : '') || 'Automatic',
                        engine: info.engine_type || info.engine_cylinders || info.engine || '',
                        engineSize: info.engine_size,
                        fuelType: info.fuel_type,
                        drivetrain: info.drive_type || '', // sometimes object {label, value}, handle if needed but schema expects string
                        bodyStyle: info.body_style || (info.BodyStyle ? info.BodyStyle.name : '') || '',
                        doors: info.doors,
                        passengers: info.passenger,
                        stockNumber: item.stock_NO || info.stock_NO || '',
                        exteriorColor: info.exterior_color ? info.exterior_color.name : '',
                        interiorColor: info.interior_color ? info.interior_color.name : ''
                    };

                    // Specific fix for drivetrain object if it comes as {label: 'AWD', value: 1}
                    if (typeof scrapedVehicle.drivetrain === 'object' && scrapedVehicle.drivetrain.label) {
                        scrapedVehicle.drivetrain = scrapedVehicle.drivetrain.label;
                    }

                    scrapedVehicles.push(scrapedVehicle);
                    console.log(`[Puppeteer] ✅ Scraped via API + Detail: ${scrapedVehicle.title} (${images.length} imgs)`);

                } catch (err) {
                    console.log(`[Puppeteer] ⚠️ Error parsing API item: ${err.message}`);
                }
            }

            currentPage++;
            // Random delay between API calls to be polite
            await new Promise(r => setTimeout(r, 1000 + Math.random() * 2000));
        }

        console.log(`[Puppeteer] 🏁 Complete! Scraped ${scrapedVehicles.length} vehicles`);

        return {
            vehicles: scrapedVehicles,
            totalScraped: scrapedVehicles.length,
            totalSkipped,
            pagesProcessed: currentPage - 1
        };

    } catch (error) {
        console.error('[Puppeteer] ❌ Error:', error.message);
        return {
            vehicles: scrapedVehicles,
            totalScraped: scrapedVehicles.length,
            totalSkipped,
            pagesProcessed: 0,
            error: error.message
        };
    } finally {
        if (browser) {
            console.log('[Puppeteer] 🔒 Closing browser...');
            await browser.close();
        }
    }
}
