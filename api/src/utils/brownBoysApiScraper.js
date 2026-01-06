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

    // On US Server, try direct Puppeteer first
    console.log('[HTML Scraper] 🇺🇸 Running on US Sever - Attempting direct connection...');

    // Fallback to direct Puppeteer
    return await scrapeWithPuppeteer(listingUrl, targetCount, existingVins, filters);
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
async function scrapeWithPuppeteer(listingUrl, targetCount, existingVins, filters) {
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

        // 1. Navigate to Listing Page
        console.log(`[Puppeteer] 🔗 Navigating to Listing: ${listingUrl}`);
        await page.goto(listingUrl, { waitUntil: 'networkidle2', timeout: 60000 });

        // Wait for initial vehicle cards
        try {
            await page.waitForSelector('.special-vehicle', { timeout: 30000 });
        } catch (e) {
            console.log('[Puppeteer] ⚠️ No vehicle cards found initially');
            return { vehicles: [], totalScraped: 0, totalSkipped: 0, pagesProcessed: 0, error: 'No vehicles found' };
        }

        // INFINITE SCROLL LOGIC
        let previousCount = 0;
        let consecutiveNoLoad = 0;
        const MAX_NO_LOAD_RETRIES = 1; // Stop if no new cars after 1 try (per user: "stop else")

        console.log('[Puppeteer] 🔄 Starting Infinite Scroll...');

        while (true) {
            // Count current vehicles
            const currentCount = await page.evaluate(() => document.querySelectorAll('.special-vehicle').length);

            // Check if we reached user limit (if provided)
            if (targetCount && currentCount >= targetCount) {
                console.log(`[Puppeteer] 🛑 Reached target count (${currentCount} >= ${targetCount}). Stopping scroll.`);
                break;
            }

            console.log(`[Puppeteer] 🚙 Current vehicle count: ${currentCount}`);

            if (currentCount === previousCount) {
                consecutiveNoLoad++;
                if (consecutiveNoLoad > MAX_NO_LOAD_RETRIES) {
                    console.log(`[Puppeteer] 🛑 No new vehicles loaded after ${MAX_NO_LOAD_RETRIES} retries. End of list.`);
                    break;
                }
                console.log(`[Puppeteer] ⚠️ No new cars. Retrying scroll (${consecutiveNoLoad}/${MAX_NO_LOAD_RETRIES})...`);
            } else {
                consecutiveNoLoad = 0; // Reset if we found new cars
                previousCount = currentCount;
            }

            // Scroll to bottom
            await page.evaluate(() => {
                window.scrollTo(0, document.body.scrollHeight);
            });

            // Wait 7-10 seconds (User requested 7-10s)
            const waitTime = 7000 + Math.random() * 3000;
            console.log(`[Puppeteer] ⏳ Waiting ${Math.round(waitTime / 1000)}s for load...`);
            await new Promise(r => setTimeout(r, waitTime));
        }

        // 2. Extract Detail URLs (After scrolling is done)
        const detailUrls = await page.evaluate(() => {
            const urls = [];
            document.querySelectorAll('.special-vehicle a[href*="/cars/used/"]').forEach(a => {
                const href = a.getAttribute('href');
                if (href) urls.push(`https://www.brownboysauto.com${href}`);
            });
            // Unique URLs only
            return [...new Set(urls)];
        });

        console.log(`[Puppeteer] 📦 Found ${detailUrls.length} vehicle links. Starting deep scrape...`);

        // 3. Loop through Detail URLs
        for (const url of detailUrls) {
            if (scrapedVehicles.length >= targetCount) break;

            try {
                // Check if we already have this VIN from URL (optimization)
                // URL pattern: .../2020-volkswagen-passat-513643 (Last part is stock/id, not VIN)
                // So we must visit page to get VIN or check ID mapping if possible. 
                // We'll visit to be safe and get full data.

                console.log(`[Puppeteer] 🕵️‍♀️ Visiting: ${url}`);
                await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

                // 4. Extract __NEXT_DATA__ JSON
                const vehicleData = await page.evaluate(() => {
                    try {
                        const script = document.getElementById('__NEXT_DATA__');
                        if (!script) return null;
                        return JSON.parse(script.innerHTML);
                    } catch (e) {
                        return null;
                    }
                });

                if (!vehicleData || !vehicleData.props || !vehicleData.props.pageProps || !vehicleData.props.pageProps.data) {
                    console.log(`[Puppeteer] ⚠️ Failed to extract JSON data for ${url}`);
                    continue;
                }

                const data = vehicleData.props.pageProps.data;
                const vehicle = data.Vehicle;
                const dealerData = vehicleData.props.dealerData;
                const imagePrefix = dealerData.prefixUrl || 'https://image123.azureedge.net';

                // 5. Map Data to our Schema
                const vin = vehicle.vin_number;

                // Skip if exists
                if (!vin || existingVins.has(vin)) {
                    // console.log(`[Puppeteer] ⏭️ Duplicate VIN: ${vin}`);
                    totalSkipped++;
                    continue;
                }

                const title = `${vehicle.model_year} ${vehicle.make} ${vehicle.model} ${vehicle.trim || ''}`.trim();

                // Extract Images from data2 array (High Res)
                let images = [];
                const prefix = imagePrefix; // Use the one we resolved

                if (data.data2 && Array.isArray(data.data2)) {
                    console.log(`[Puppeteer] 📸 Found 'data2' with ${data.data2.length} images`);
                    images = data.data2.map(img => {
                        const src = img.media_src;
                        return src.startsWith('http') ? src : `${prefix}${src}`;
                    });
                } else {
                    console.log(`[Puppeteer] ⚠️ 'data2' missing or invalid. Keys in data: ${Object.keys(data).join(', ')}`);
                }

                // Fallback to cover image if still empty
                if (images.length === 0 && data.cover_image) {
                    console.log('[Puppeteer] 📸 Using cover_image fallback');
                    const src = data.cover_image;
                    images.push(src.startsWith('http') ? src : `${prefix}${src}`);
                }

                // SECONDARY FALLBACK: Scrape HTML if JSON images are scarce (< 2)
                if (images.length < 2) {
                    console.log('[Puppeteer] 📉 Few images found in JSON. Attempting HTML gallery scrape...');
                    const htmlImages = await page.evaluate(() => {
                        const srcs = [];
                        // Try standard gallery
                        document.querySelectorAll('.image-gallery-thumbnail-image').forEach(img => {
                            if (img.src) srcs.push(img.src);
                        });
                        // Try clean gallery slides
                        document.querySelectorAll('.image-gallery-image').forEach(img => {
                            if (img.src) srcs.push(img.src);
                        });
                        return srcs;
                    });

                    if (htmlImages.length > 0) {
                        console.log(`[Puppeteer] 📸 Found ${htmlImages.length} images via HTML`);
                        // Merge unique
                        htmlImages.forEach(src => {
                            // Clean thumb URLs
                            const fullSrc = src.replace('thumb-', '').replace('/thumb/', '/');
                            // Check existence
                            if (!images.includes(fullSrc) && !images.some(existing => existing.includes(fullSrc.split('/').pop()))) {
                                images.push(fullSrc);
                            }
                        });
                    }
                }

                console.log(`[Puppeteer] 🖼️ Final Image Count: ${images.length}`);

                // Extract Features
                let features = [];
                if (vehicle.standard) {
                    // vehicle.standard is an object where keys are categories (SAFETY, EXTERIOR, etc.) and values are arrays of strings
                    Object.values(vehicle.standard).forEach(list => {
                        if (Array.isArray(list)) features.push(...list);
                    });
                }

                const scrapedVehicle = {
                    vehicleId: data.id ? String(data.id) : '',
                    vin: vin,
                    year: Number(vehicle.model_year),
                    make: vehicle.make,
                    model: vehicle.model,
                    trim: vehicle.trim,
                    title: title,
                    price: Number(data.special_price || data.sell_price || 0),
                    mileage: Number(data.odometer || 0),
                    description: data.comment ? data.comment.replace(/<[^>]*>/g, '').trim() : '', // Strip HTML
                    images: images,
                    sourceUrl: url,
                    features: features,

                    // Detailed Specs
                    transmission: vehicle.transmission,
                    engine: vehicle.engine_type || vehicle.engine, // "4 Cylinder "
                    engineSize: vehicle.engine_size, // "2.0 L"
                    fuelType: vehicle.fuel_type,
                    drivetrain: vehicle.drive_type, // "FWD"
                    bodyStyle: vehicle.body_style, // "Sedan"
                    doors: vehicle.doors,
                    passengers: vehicle.passenger,
                    stockNumber: data.stock_NO,
                    cityFuel: vehicle.city_fuel,
                    hwyFuel: vehicle.hwy_fuel,
                    exteriorColor: vehicle.exterior_color ? vehicle.exterior_color.name : (vehicle.frk_exterior_color === 163 ? 'Gray' : 'Unknown'), // mapping backup if name missing
                    interiorColor: vehicle.interior_color ? vehicle.interior_color.name : (vehicle.frk_interior_color === 161 ? 'Black' : 'Unknown')
                };

                scrapedVehicles.push(scrapedVehicle);
                console.log(`[Puppeteer] ✅ Extracted: ${title} (VIN: ${vin})`);

                // Polite delay
                await new Promise(r => setTimeout(r, 2000 + Math.random() * 2000));

            } catch (err) {
                console.log(`[Puppeteer] ❌ Error scraping detail ${url}: ${err.message}`);
            }
        }

        console.log(`[Puppeteer] 🏁 Complete! Scraped ${scrapedVehicles.length} vehicles`);

        return {
            vehicles: scrapedVehicles,
            totalScraped: scrapedVehicles.length,
            totalSkipped,
            pagesProcessed: 1
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
