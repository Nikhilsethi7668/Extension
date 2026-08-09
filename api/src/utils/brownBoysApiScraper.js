import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import axios from 'axios';
import * as cheerio from 'cheerio';
import fs from 'fs';

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
        const exePath = fs.existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined;
        browser = await puppeteer.launch({
            headless: 'new',
            executablePath: exePath,
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
        
        const extractedUrls = [];

        while (hasMore && extractedUrls.length < targetCount) {
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

            const apiResult = await page.evaluate(async (url, body) => {
                try {
                    const res = await fetch(url, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(body)
                    });
                    if (!res.ok) throw new Error(`API returned ${res.status}`);
                    const json = await res.json();
                    return {
                        vehicles: json.data?.data || [],
                        meta: json.data?.meta
                    };
                } catch (err) {
                    return { error: err.message };
                }
            }, apiUrl, requestBody);

            if (apiResult.error || !apiResult.vehicles || apiResult.vehicles.length === 0) {
                console.log('[Puppeteer] ⚠️ API returned no more vehicles or error:', apiResult.error);
                hasMore = false;
                break;
            }

            console.log(`[Puppeteer] 📦 API returned ${apiResult.vehicles.length} items on page ${currentPage}`);

            for (const item of apiResult.vehicles) {
                if (extractedUrls.length >= targetCount) break;
                
                const info = item.Vehicle || {};
                const year = Number(info.model_year) || Number(item.year) || 0;
                const make = info.make || item.make || 'Unknown';
                const model = info.model || item.model || 'Unknown';

                let sourceUrl;
                if (vehicleSlugMap.has(item.id)) {
                    const slug = vehicleSlugMap.get(item.id);
                    sourceUrl = `https://www.brownboysauto.com${slug}`;
                } else if (item.slug) {
                    const slug = item.slug.startsWith('/') ? item.slug : `/${item.slug}`;
                    sourceUrl = `https://www.brownboysauto.com${slug}`;
                } else {
                    const makeSlug = make.replace(/\s+/g, '-');
                    const modelSlug = model.replace(/\s+/g, '-');
                    sourceUrl = `https://www.brownboysauto.com/cars/used/${year}-${makeSlug}-${modelSlug}-${item.id}`;
                }

                if (!extractedUrls.includes(sourceUrl)) {
                    extractedUrls.push(sourceUrl);
                }
            }

            // Pagination logic
            if (apiResult.meta) {
                const current = apiResult.meta.current_page;
                const last = apiResult.meta.last_page;
                if (current >= last) {
                    hasMore = false;
                } else {
                    currentPage++;
                }
            } else {
                hasMore = false;
            }
        }

        console.log(`[Puppeteer] 🏁 Complete! Extracted ${extractedUrls.length} vehicle URLs.`);

        return {
            type: 'expanded_search',
            urls: extractedUrls
        };

    } catch (error) {
        console.error('[Puppeteer] ❌ Error:', error.message);
        return {
            type: 'expanded_search',
            urls: [],
            error: error.message
        };
    } finally {
        if (browser) {
            console.log('[Puppeteer] 🔒 Closing browser...');
            await browser.close();
        }
    }
}
