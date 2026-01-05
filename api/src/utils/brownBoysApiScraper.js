import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

// Add stealth plugin to bypass Cloudflare
puppeteer.use(StealthPlugin());

/**
 * Scrapes Brown Boys Auto vehicles by navigating directly to their website
 * Uses Puppeteer with stealth mode to bypass Cloudflare protection
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

    console.log(`[HTML Scraper] 🚀 Starting Puppeteer HTML scraping for ${targetCount} NEW vehicles`);
    console.log(`[HTML Scraper] 📋 Existing VINs to skip: ${existingVins.size}`);

    const scrapedVehicles = [];
    let totalSkipped = 0;
    let browser = null;

    try {
        // Launch browser with stealth mode
        console.log('[HTML Scraper] 🌐 Launching stealth browser...');
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
        await page.setViewport({ width: 1920, height: 1080 });

        // Set realistic user agent
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

        // Build the URL with filters
        const urlParams = new URLSearchParams();
        if (filters.make) urlParams.set('make', filters.make);
        if (filters.model) urlParams.set('model', filters.model);
        if (filters.year_start) urlParams.set('Minyear', filters.year_start);
        if (filters.year_end) urlParams.set('Maxyear', filters.year_end);

        const listingUrl = `https://www.brownboysauto.com/cars?${urlParams.toString()}`;
        console.log(`[HTML Scraper] 🔗 Navigating to: ${listingUrl}`);

        // Navigate to the listing page
        await page.goto(listingUrl, {
            waitUntil: 'networkidle2',
            timeout: 60000
        });

        console.log('[HTML Scraper] ✅ Page loaded successfully');

        // Extra wait for JS to render and Cloudflare to pass
        console.log('[HTML Scraper] ⏳ Waiting for page to fully render...');
        await new Promise(resolve => setTimeout(resolve, 5000));

        // Debug: Log page title and check for Cloudflare challenge
        const pageTitle = await page.title();
        console.log(`[HTML Scraper] 📄 Page title: ${pageTitle}`);

        // Check if we hit a Cloudflare challenge
        const pageContent = await page.content();
        if (pageContent.includes('cf-browser-verification') || pageContent.includes('Just a moment')) {
            console.log('[HTML Scraper] ⚠️ Cloudflare challenge detected, waiting longer...');
            await new Promise(resolve => setTimeout(resolve, 10000));
        }

        // Debug: Log first 500 chars of body to see what we got
        const bodyText = await page.evaluate(() => document.body?.innerText?.substring(0, 500) || 'NO BODY');
        console.log(`[HTML Scraper] 📝 Body preview: ${bodyText.replace(/\n/g, ' ')}`);

        // Wait for vehicle cards to load
        await page.waitForSelector('.special-vehicle, a[href*="/cars/used/"]', { timeout: 30000 }).catch(() => {
            console.log('[HTML Scraper] ⚠️ Selector not found, trying alternative...');
        });

        // Auto-scroll to load more vehicles
        console.log('[HTML Scraper] 📜 Scrolling to load more vehicles...');
        let previousHeight = 0;
        let scrollAttempts = 0;
        const maxScrollAttempts = 10;

        while (scrollAttempts < maxScrollAttempts) {
            const currentHeight = await page.evaluate(() => document.body.scrollHeight);
            if (currentHeight === previousHeight) break;

            await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
            await new Promise(resolve => setTimeout(resolve, 2000));

            previousHeight = currentHeight;
            scrollAttempts++;

            // Check how many vehicles we have
            const vehicleCount = await page.evaluate(() => {
                return document.querySelectorAll('a[href*="/cars/used/"]').length;
            });
            console.log(`[HTML Scraper] 📊 Found ${vehicleCount} vehicle links after scroll ${scrollAttempts}`);

            if (vehicleCount >= targetCount * 2) break; // We have enough
        }

        // Extract vehicle data from the page
        console.log('[HTML Scraper] 🔍 Extracting vehicle data from HTML...');

        const vehiclesFromPage = await page.evaluate(() => {
            const vehicles = [];

            // Find all vehicle cards - they have links to /cars/used/...
            const vehicleCards = document.querySelectorAll('.special-vehicle');

            vehicleCards.forEach(card => {
                try {
                    // Get the detail link
                    const detailLink = card.querySelector('a[href*="/cars/used/"]');
                    if (!detailLink) return;

                    const href = detailLink.getAttribute('href');
                    const sourceUrl = `https://www.brownboysauto.com${href}`;

                    // Parse URL to extract year, make, model, and ID
                    // Format: /cars/used/2020-volkswagen-passat-513643
                    const urlMatch = href.match(/\/cars\/used\/(\d{4})-(.+)-(\d+)$/);
                    if (!urlMatch) return;

                    const year = parseInt(urlMatch[1]);
                    const vehicleId = urlMatch[3];
                    const makeModelPart = urlMatch[2];

                    // Split make and model (first word is make, rest is model)
                    const parts = makeModelPart.split('-');
                    const make = parts[0] ? parts[0].charAt(0).toUpperCase() + parts[0].slice(1) : '';
                    const model = parts.slice(1).map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');

                    // Get image
                    const img = card.querySelector('img');
                    const imageUrl = img ? img.src : '';

                    // Get price
                    const priceEl = card.querySelector('.main-bg');
                    let price = 0;
                    if (priceEl) {
                        const priceText = priceEl.textContent.replace(/[^0-9.]/g, '');
                        price = parseFloat(priceText) || 0;
                    }

                    // Get mileage from the card content
                    const mileageLabels = card.querySelectorAll('.advance-label');
                    let mileage = 0;
                    let fuelType = '';
                    let transmission = '';

                    mileageLabels.forEach(label => {
                        const text = label.textContent.trim();
                        if (text === 'Mileage') {
                            const nextEl = label.nextElementSibling;
                            if (nextEl) {
                                mileage = parseInt(nextEl.textContent.replace(/,/g, '')) || 0;
                            }
                        }
                        if (text === 'Fuel') {
                            const nextEl = label.nextElementSibling;
                            if (nextEl) fuelType = nextEl.textContent.trim();
                        }
                        if (text === 'Trans.') {
                            const nextEl = label.nextElementSibling;
                            if (nextEl) transmission = nextEl.textContent.trim();
                        }
                    });

                    // Get the title
                    const titleEl = card.querySelector('.font-weight-bold');
                    const title = titleEl ? titleEl.textContent.trim() : `${year} ${make} ${model}`;

                    vehicles.push({
                        vehicleId,
                        year,
                        make,
                        model,
                        title,
                        price,
                        mileage,
                        fuelType,
                        transmission,
                        sourceUrl,
                        images: imageUrl ? [imageUrl.replace('thumb-', '')] : []
                    });
                } catch (err) {
                    // Skip this card
                }
            });

            return vehicles;
        });

        console.log(`[HTML Scraper] 📦 Extracted ${vehiclesFromPage.length} vehicles from HTML`);

        // Process vehicles - fetch detail pages for VIN and more images
        for (const vehicleData of vehiclesFromPage) {
            if (scrapedVehicles.length >= targetCount) {
                console.log(`[HTML Scraper] 🎯 Reached target count of ${targetCount}`);
                break;
            }

            // Try to get more details from the detail page
            try {
                console.log(`[HTML Scraper] 🔍 Fetching details for: ${vehicleData.title}`);

                await page.goto(vehicleData.sourceUrl, {
                    waitUntil: 'networkidle2',
                    timeout: 30000
                });

                // Extract VIN and more details from detail page
                const detailData = await page.evaluate(() => {
                    const data = {};

                    // Try to get VIN from __NEXT_DATA__
                    const nextDataScript = document.querySelector('#__NEXT_DATA__');
                    if (nextDataScript) {
                        try {
                            const json = JSON.parse(nextDataScript.textContent);
                            const pageProps = json.props?.pageProps?.data;
                            if (pageProps?.Vehicle) {
                                const v = pageProps.Vehicle;
                                data.vin = v.vin_number;
                                data.trim = v.trim;
                                data.bodyStyle = v.body_style;
                                data.drivetrain = v.drive_type;
                                data.exteriorColor = v.exterior_color?.name;
                                data.interiorColor = v.interior_color?.name;
                                data.engine = v.engine_cylinders;
                                data.stockNumber = pageProps.stock_NO || pageProps.stock_no_cast;

                                // Get images from the data
                                if (pageProps.dealership_vehicle_images) {
                                    data.images = pageProps.dealership_vehicle_images
                                        .map(img => img.url?.url || img.image_url?.url)
                                        .filter(Boolean)
                                        .map(url => url.replace('thumb-', ''));
                                }
                            }
                            if (pageProps) {
                                data.price = pageProps.sell_price || 0;
                                data.mileage = pageProps.odometer || 0;
                            }
                        } catch (e) {
                            // Ignore parsing errors
                        }
                    }

                    // Fallback: Try to find VIN in page content
                    if (!data.vin) {
                        const vinMatch = document.body.textContent.match(/VIN[:\s]*([A-HJ-NPR-Z0-9]{17})/i);
                        if (vinMatch) data.vin = vinMatch[1];
                    }

                    return data;
                });

                // Merge detail data
                if (detailData.vin) vehicleData.vin = detailData.vin;
                if (detailData.trim) vehicleData.trim = detailData.trim;
                if (detailData.bodyStyle) vehicleData.bodyStyle = detailData.bodyStyle;
                if (detailData.drivetrain) vehicleData.drivetrain = detailData.drivetrain;
                if (detailData.exteriorColor) vehicleData.exteriorColor = detailData.exteriorColor;
                if (detailData.interiorColor) vehicleData.interiorColor = detailData.interiorColor;
                if (detailData.engine) vehicleData.engine = detailData.engine;
                if (detailData.stockNumber) vehicleData.stockNumber = detailData.stockNumber;
                if (detailData.price) vehicleData.price = detailData.price;
                if (detailData.mileage) vehicleData.mileage = detailData.mileage;
                if (detailData.images && detailData.images.length > 0) {
                    vehicleData.images = detailData.images;
                }

                // Skip if VIN already exists
                if (vehicleData.vin && existingVins.has(vehicleData.vin)) {
                    console.log(`[HTML Scraper] ⏭️ Skipping duplicate VIN: ${vehicleData.vin}`);
                    totalSkipped++;
                    continue;
                }

            } catch (err) {
                console.log(`[HTML Scraper] ⚠️ Could not fetch detail page: ${err.message}`);
                // Use basic data from listing page
            }

            // Generate VIN fallback if not found
            if (!vehicleData.vin) {
                vehicleData.vin = `BROWNBOYS-${vehicleData.vehicleId}`;
            }

            // Add to results
            scrapedVehicles.push(vehicleData);
            console.log(`[HTML Scraper] ✅ Scraped: ${vehicleData.title} (${scrapedVehicles.length}/${targetCount})`);

            // Small delay between detail requests
            await new Promise(resolve => setTimeout(resolve, 500));
        }

        console.log(`[HTML Scraper] 🏁 Scraping complete!`);
        console.log(`[HTML Scraper] 📦 Total scraped: ${scrapedVehicles.length} NEW vehicles`);
        console.log(`[HTML Scraper] ⏭️ Total skipped: ${totalSkipped} duplicate VINs`);

        return {
            vehicles: scrapedVehicles,
            totalScraped: scrapedVehicles.length,
            totalSkipped,
            pagesProcessed: 1
        };
    } catch (error) {
        console.error('[HTML Scraper] ❌ Fatal error:', error.message);
        return {
            vehicles: scrapedVehicles,
            totalScraped: scrapedVehicles.length,
            totalSkipped,
            pagesProcessed: 0
        };
    } finally {
        if (browser) {
            console.log('[HTML Scraper] 🔒 Closing browser...');
            await browser.close();
        }
    }
}
