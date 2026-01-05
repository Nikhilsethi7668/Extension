import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { scrapeVehicleDetailImages } from './puppeteerScraper.js';

// Add stealth plugin to bypass Cloudflare
puppeteer.use(StealthPlugin());

/**
 * Scrapes Brown Boys Auto vehicles using Puppeteer to bypass Cloudflare
 * @param {Object} options - Scraping options
 * @param {number} options.targetCount - Number of NEW vehicles to scrape
 * @param {Set<string>} options.existingVins - VINs already scraped (to skip)
 * @param {Object} options.filters - Search filters (year, make, model, etc.)
 * @returns {Promise<Object>} { vehicles: [...], totalScraped: N, skipped: M }
 */
export async function scrapeBrownBoysViaAPI(options = {}) {
    const {
        targetCount = 50,
        existingVins = new Set(),
        filters = {}
    } = options;

    console.log(`[API Scraper] 🚀 Starting Puppeteer-based scraping for ${targetCount} NEW vehicles`);
    console.log(`[API Scraper] 📋 Existing VINs to skip: ${existingVins.size}`);

    const API_BASE = 'https://api.hillzusers.com/api/dealership/advance/search/vehicles/www.brownboysauto.com';
    const LIMIT_PER_PAGE = 10;
    const MAX_RETRIES = 2;
    const REQUEST_DELAY = 500;

    // Default filter payload
    const payload = {
        fuel_type: filters.fuel_type || '',
        body_style: filters.body_style || '',
        engine_cylinders: filters.engine_cylinders || '',
        year_start: filters.year_start || 2017,
        year_end: filters.year_end || 2026,
        price_low: filters.price_low || '',
        price_high: filters.price_high || '',
        make: filters.make || '',
        model: filters.model || '',
        doors: filters.doors || '',
        drive_train: filters.drive_train || '',
        transmission: filters.transmission || '',
        exterior_color: filters.exterior_color || '',
        interior_color: filters.interior_color || '',
        odometer_low: filters.odometer_low || null,
        odometer_high: filters.odometer_high || null,
        odometer_type: 2,
        sortKind: { kind: '', type: null, order: 0 },
        sold: '',
        is_coming_soon: '',
        is_it_special: null
    };

    console.log(`[API Scraper] 🔍 Filters:`, JSON.stringify(payload, null, 2));

    const scrapedVehicles = [];
    let currentPage = 1;
    let totalSkipped = 0;
    let consecutiveEmptyPages = 0;
    let browser = null;

    try {
        // Launch browser with stealth mode
        console.log('[API Scraper] 🌐 Launching stealth browser...');
        browser = await puppeteer.launch({
            headless: true,
            executablePath: '/usr/bin/chromium',
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu',
                '--disable-web-security',
                '--disable-features=IsolateOrigins,site-per-process'
            ]
        });

        const page = await browser.newPage();
        await page.setViewport({ width: 1280, height: 800 });

        // Set realistic headers
        await page.setExtraHTTPHeaders({
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept': 'application/json, text/plain, */*'
        });

        // Helper: Make API request using Puppeteer (bypasses Cloudflare)
        const fetchPage = async (pageNum, retryCount = 0) => {
            try {
                const url = `${API_BASE}?page=${pageNum}&limit=${LIMIT_PER_PAGE}&keywords=`;
                console.log(`[API Scraper] 📡 Requesting page ${pageNum} via Puppeteer...`);

                // Use page.evaluate to make fetch request from browser context
                const result = await page.evaluate(async (apiUrl, postPayload) => {
                    try {
                        const response = await fetch(apiUrl, {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                'Accept': 'application/json'
                            },
                            body: JSON.stringify(postPayload)
                        });

                        if (!response.ok) {
                            return { error: `HTTP ${response.status}`, status: response.status };
                        }

                        return await response.json();
                    } catch (err) {
                        return { error: err.message };
                    }
                }, url, payload);

                if (result.error) {
                    throw new Error(result.error);
                }

                return result;
            } catch (error) {
                if (retryCount < MAX_RETRIES) {
                    console.log(`[API Scraper] ⚠️  Request failed, retry ${retryCount + 1}/${MAX_RETRIES}`);
                    await new Promise(resolve => setTimeout(resolve, 1000));
                    return fetchPage(pageNum, retryCount + 1);
                } else {
                    console.error(`[API Scraper] ❌ Page ${pageNum} failed after ${MAX_RETRIES} retries:`, error.message);
                    throw error;
                }
            }
        };

        // Helper: Fetch detailed vehicle data from detail API
        const fetchVehicleDetail = async (vehicleSlug, vehicleId, retryCount = 0) => {
            try {
                // Extract slug base (e.g., "2023-dodge-charger-472652")
                const slugBase = vehicleSlug.replace('/cars/used/', '');

                // The detail API URL pattern
                const detailUrl = `https://www.brownboysauto.com/_next/data/gNJs5Fyke9OUBzREyDpky/cars/used/${slugBase}.json`;

                console.log(`[API Scraper] 🔍 Fetching detail for: ${slugBase}`);

                const response = await axios.get(detailUrl, {
                    params: { vehicleBase: slugBase },
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
                        'Accept': 'application/json'
                    },
                    timeout: 10000
                });

                return response.data?.pageProps || null;
            } catch (error) {
                if (retryCount < MAX_RETRIES) {
                    console.log(`[API Scraper] ⚠️  Detail fetch failed, retry ${retryCount + 1}/${MAX_RETRIES}`);
                    await new Promise(resolve => setTimeout(resolve, 500));
                    return fetchVehicleDetail(vehicleSlug, vehicleId, retryCount + 1);
                } else {
                    console.error(`[API Scraper] ❌ Failed to fetch detail for ${vehicleSlug}:`, error.message);
                    return null;
                }
            }
        };

        // Helper: Validate if an image URL is likely a real vehicle photo
        const isValidVehicleImage = (url) => {
            if (!url || typeof url !== 'string') return false;
            const lower = url.toLowerCase();

            // 1. Strict Blocklist (Files known to be junk)
            if (lower.includes('16487202666893896-12.png')) return false; // The main logo
            if (lower.includes('contact_us-banner')) return false;
            if (lower.includes('welcme_- home')) return false;
            if (lower.includes('finch_banner')) return false;

            // 2. Keyword Blocklist
            if (lower.includes('logo')) return false;
            if (lower.includes('icon')) return false;
            if (lower.includes('avatar')) return false;
            if (lower.includes('banner')) return false;
            if (lower.includes('map')) return false;
            if (lower.includes('button')) return false;

            // 3. Extension Blocklist
            if (lower.endsWith('.svg')) return false;
            if (lower.endsWith('.gif')) return false; // Cars are usually JPG/PNG/WEBP

            // Prioritize JPG/WEBP for vehicles
            return true;
        };

        // Helper: recursively find all image URLs in an object
        const findImagesDeep = (obj, found = new Set()) => {
            if (!obj) return found;

            if (typeof obj === 'string') {
                if (obj.match(/\.(jpg|jpeg|png|webp|gif)/i) && obj.startsWith('http')) {
                    if (isValidVehicleImage(obj)) found.add(obj);
                }
            } else if (Array.isArray(obj)) {
                obj.forEach(item => findImagesDeep(item, found));
            } else if (typeof obj === 'object') {
                Object.keys(obj).forEach(key => {
                    const val = obj[key];
                    // Check keys for image hints
                    if (key.match(/(image|img|photo|media|gallery|src|url)/i)) {
                        if (typeof val === 'string' && val.startsWith('http')) {
                            if (isValidVehicleImage(val)) found.add(val);
                        }
                    }
                    findImagesDeep(val, found);
                });
            }
            return found;
        };

        // Helper: Extract vehicle data from API response
        const extractVehicleData = async (item) => {
            const vehicle = item.Vehicle || {};
            const vehicleId = item.id;

            // Use slug from API if available, otherwise construct it
            let slug = item.slug;
            if (!slug) {
                const slugBase = `${vehicle.model_year}-${vehicle.make}-${vehicle.model}-${vehicleId}`
                    .toLowerCase()
                    .replace(/\s+/g, '-')
                    .replace(/[^a-z0-9-]/g, '');
                slug = `/cars/used/${slugBase}`;
            }

            // Ensure slug starts with /
            if (!slug.startsWith('/')) {
                slug = `/${slug}`;
            }

            const detailUrl = `https://www.brownboysauto.com${slug}`;

            // Basic data from listing API
            const basicData = {
                vin: vehicle.vin_number,
                year: vehicle.model_year,
                make: vehicle.make,
                model: vehicle.model,
                trim: vehicle.trim,
                bodyStyle: vehicle.body_style || vehicle.BodyStyle?.name,
                fuelType: vehicle.fuel_type,
                transmission: vehicle.Transmission?.name || vehicle.transmission,
                drivetrain: vehicle.drive_type,
                mileage: item.odometer || 0,
                price: item.sell_price || 0,
                specialPrice: item.special_price || 0,
                msrp: 0,
                location: 'Surrey, British Columbia',
                stockNumber: item.stock_NO || item.stock_no_cast,
                exteriorColor: vehicle.exterior_color?.name || vehicle.exterior_color,
                interiorColor: vehicle.interior_color?.name || vehicle.interior_color,
                engine: vehicle.engine_cylinders,
                engineSize: vehicle.engine_size,
                engineCylinders: vehicle.engine_cylinders,
                doors: vehicle.doors,
                passengers: vehicle.passenger,
                cityFuel: vehicle.city_fuel,
                hwyFuel: vehicle.hwy_fuel,
                description: item.comment || '',
                features: [],
                images: [],
                carfaxLink: '',
                sourceUrl: detailUrl,
                imageSource: 'none'
            };

            // Fetch comprehensive detail data
            const detailData = await fetchVehicleDetail(slug, vehicleId);

            if (detailData) {
                const data = detailData.data || {};
                const data2 = detailData.data2 || [];
                const vehicleDetail = data.Vehicle || {};

                // Merge detail data
                if (vehicleDetail.low_msrp || vehicleDetail.high_msrp) {
                    basicData.msrp = vehicleDetail.low_msrp || vehicleDetail.high_msrp;
                }
                if (vehicleDetail.engine_cylinders) {
                    basicData.engineCylinders = vehicleDetail.engine_cylinders;
                }
                if (vehicleDetail.carfax_link) {
                    basicData.carfaxLink = typeof vehicleDetail.carfax_link === 'string' ? vehicleDetail.carfax_link : 'Available';
                }
                if (data.stock_NO) {
                    basicData.stockNumber = data.stock_NO;
                }
                if (vehicleDetail.drive_type) {
                    basicData.drivetrain = typeof vehicleDetail.drive_type === 'string' ? vehicleDetail.drive_type : vehicleDetail.drive_type.label;
                }

                // Extract features from standard object
                if (vehicleDetail.standard) {
                    const allFeatures = [];
                    Object.entries(vehicleDetail.standard).forEach(([category, features]) => {
                        if (Array.isArray(features)) {
                            allFeatures.push(...features);
                        }
                    });
                    basicData.features = allFeatures;
                }

                // --- IMAGE EXTRACTION STRATEGY ---
                const prefixUrl = detailData.dealerData?.prefixUrl || 'https://image123.azureedge.net';

                // PHASE 1: Standard API Extraction (data2)
                if (Array.isArray(data2) && data2.length > 0) {
                    data2.forEach(img => {
                        if (img.media_type === 1 && img.media_src) {
                            let imgUrl = img.media_src;
                            // Fix trailing space bug if present in API data
                            imgUrl = imgUrl.trim();
                            // Add prefix if not absolute URL
                            if (!imgUrl.startsWith('http')) {
                                imgUrl = `${prefixUrl}${imgUrl}`;
                            }
                            if (isValidVehicleImage(imgUrl)) {
                                basicData.images.push(imgUrl);
                            }
                        }
                    });
                }

                // PHASE 2: Deep Search if Phase 1 failed or yielded few images
                if (basicData.images.length === 0) {
                    console.log(`[API Scraper] ⚠️  Standard images missing/invalid for ${basicData.vin}, trying Deep Search...`);
                    const deepImages = findImagesDeep(detailData);
                    // Filter and add relevant images (e.g. large ones from CDN)
                    deepImages.forEach(url => {
                        if (isValidVehicleImage(url)) {
                            basicData.images.push(url);
                        }
                    });
                    if (basicData.images.length > 0) basicData.imageSource = 'api_deep_search';
                } else {
                    basicData.imageSource = 'api_standard';
                }

                // Use detailed description if available
                if (data.comment && data.comment.trim()) {
                    basicData.description = data.comment;
                }
            }

            // PHASE 3: Puppeteer Fallback (GUI Scrape)
            // Trigger if 0 images found OR if we only found very few images which might be wrong (e.g. < 2)
            // Just empty check is safest to avoid overwriting good single photos, but user said "only getting logo"
            // isValidVehicleImage should have caught the logo, so length should be 0.
            // PHASE 3: Puppeteer Fallback (GUI Scrape)
            // Aggressive Trigger: If we have fewer than 4 images, it's likely just junk/logos that slipped through.
            // A real car listing usually has 10+ images.
            if (basicData.images.length < 4) {
                console.log(`[API Scraper] 🛑 Found only ${basicData.images.length} images (likely junk) for ${basicData.vin}. Initiating Puppeteer fallback...`);
                try {
                    const fallbackImages = await scrapeVehicleDetailImages(detailUrl);
                    if (fallbackImages.length > 0) {
                        basicData.images = fallbackImages;
                        basicData.imageSource = 'puppeteer_fallback';
                        console.log(`[API Scraper] ✅ Puppeteer recovered ${fallbackImages.length} images!`);
                    } else {
                        console.log(`[API Scraper] ❌ Puppeteer also failed to find images.`);
                    }
                } catch (err) {
                    console.error(`[API Scraper] ❌ Puppeteer fallback error:`, err.message);
                }
            }

            return basicData;
        };

        // Main pagination loop
        console.log(`[API Scraper] 📜 Starting pagination loop...`);

        while (scrapedVehicles.length < targetCount) {
            try {
                // Fetch current page
                const data = await fetchPage(currentPage);

                // Handle different response formats
                let vehicles = [];
                if (Array.isArray(data)) {
                    vehicles = data;
                } else if (data.vehicles && Array.isArray(data.vehicles)) {
                    vehicles = data.vehicles;
                } else if (data.results && Array.isArray(data.results)) {
                    vehicles = data.results;
                } else {
                    console.log(`[API Scraper] ⚠️  Unexpected response format on page ${currentPage} `);
                    break;
                }

                console.log(`[API Scraper] 📊 Page ${currentPage}: Received ${vehicles.length} vehicles`);

                // Stop if empty page
                if (vehicles.length === 0) {
                    consecutiveEmptyPages++;
                    if (consecutiveEmptyPages >= 2) {
                        console.log(`[API Scraper] 🛑 Empty pages detected, end of inventory`);
                        break;
                    }
                } else {
                    consecutiveEmptyPages = 0;
                }

                // Process vehicles
                let newInThisPage = 0;
                for (const item of vehicles) {
                    const vin = item.Vehicle?.vin_number;

                    // Skip if no VIN
                    if (!vin) {
                        console.log(`[API Scraper] ⚠️  Skipping vehicle without VIN(ID: ${item.id})`);
                        continue;
                    }

                    // Skip if VIN already exists
                    if (existingVins.has(vin)) {
                        console.log(`[API Scraper] ⏭️  Skipping duplicate VIN: ${vin} `);
                        totalSkipped++;
                        continue;
                    }

                    // Extract and store
                    const vehicleData = await extractVehicleData(item);
                    scrapedVehicles.push(vehicleData);
                    newInThisPage++;

                    console.log(`[API Scraper] ✅ Scraped: ${vehicleData.year} ${vehicleData.make} ${vehicleData.model} (VIN: ${vin})`);

                    // Stop if we've reached target
                    if (scrapedVehicles.length >= targetCount) {
                        console.log(`[API Scraper] 🎯 Target count of ${targetCount} reached!`);
                        break;
                    }
                }

                console.log(`[API Scraper] 📈 Page ${currentPage} summary: +${newInThisPage} new, ${totalSkipped} skipped total, ${scrapedVehicles.length}/${targetCount} collected`);

                // Stop if we've reached target
                if (scrapedVehicles.length >= targetCount) {
                    break;
                }

                // Stop if page returned fewer than limit (last page)
                if (vehicles.length < LIMIT_PER_PAGE) {
                    console.log(`[API Scraper] 🏁 Last page detected (${vehicles.length} < ${LIMIT_PER_PAGE})`);
                    break;
                }

                // Move to next page
                currentPage++;

                // Add delay between requests
                await new Promise(resolve => setTimeout(resolve, REQUEST_DELAY));

            } catch (error) {
                console.error(`[API Scraper] ❌ Error on page ${currentPage}:`, error.message);
                break;
            }
        }

        console.log(`[API Scraper] 🏁 Scraping complete!`);
        console.log(`[API Scraper] 📦 Total scraped: ${scrapedVehicles.length} NEW vehicles`);
        console.log(`[API Scraper] ⏭️  Total skipped: ${totalSkipped} duplicate VINs`);
        console.log(`[API Scraper] 📄 Pages processed: ${currentPage}`);

        return {
            vehicles: scrapedVehicles,
            totalScraped: scrapedVehicles.length,
            totalSkipped,
            pagesProcessed: currentPage
        };
    } catch (error) {
        console.error('[API Scraper] ❌ Fatal error:', error.message);
        return {
            vehicles: scrapedVehicles,
            totalScraped: scrapedVehicles.length,
            totalSkipped,
            pagesProcessed: currentPage
        };
    } finally {
        if (browser) {
            console.log('[API Scraper] 🔒 Closing browser...');
            await browser.close();
        }
    }
}
