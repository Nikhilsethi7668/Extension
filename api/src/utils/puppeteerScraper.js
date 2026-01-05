import puppeteer from 'puppeteer';

/**
 * Scrapes Brown Boys Auto listing page with infinite scroll
 * Scrolls until all required vehicles are loaded or page bottom is reached
 * @param {string} url - Listing page URL
 * @param {number} targetCount - Target number of NEW unique vehicles to collect
 * @returns {Promise<string[]>} Array of vehicle URLs
 */
export async function scrapeBrownBoysListingWithScroll(url, targetCount = 50) {
    console.log(`[Puppeteer] 🚀 Starting browser-based scraping for ${targetCount} vehicles`);

    const browser = await puppeteer.launch({
        headless: true,
        executablePath: '/usr/bin/chromium',
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--disable-web-security'
        ]
    });

    try {
        const page = await browser.newPage();
        await page.setViewport({ width: 1280, height: 1024 });

        console.log(`[Puppeteer] 📡 Navigating to: ${url}`);
        await page.goto(url, { waitUntil: 'networkidle0', timeout: 45000 });

        // Wait for initial content
        await page.waitForSelector('a[href^="/cars/used/"]', { timeout: 10000 });
        console.log(`[Puppeteer] ✓ Initial content loaded`);

        const vehicleUrls = new Set();
        let scrollAttempt = 0;
        let consecutiveNoChangeCount = 0;
        let stallRetryCount = 0;
        const maxScrollAttempts = 30;
        const maxStallRetries = 3;
        const maxConsecutiveNoChange = 3;

        console.log(`[Puppeteer] 📜 Starting auto-scroll loop...`);

        while (scrollAttempt < maxScrollAttempts) {
            scrollAttempt++;

            // Extract current vehicle links
            const currentUrls = await page.evaluate(() => {
                const links = Array.from(document.querySelectorAll('a[href^="/cars/used/"]'));
                return [...new Set(links.map(a => a.getAttribute('href')))];
            });

            const previousSize = vehicleUrls.size;

            // Add new URLs
            currentUrls.forEach(href => {
                if (href) vehicleUrls.add(`https://www.brownboysauto.com${href}`);
            });

            const newVehiclesAdded = vehicleUrls.size - previousSize;

            console.log(`[Puppeteer] 📊 Scroll #${scrollAttempt}: ${vehicleUrls.size} unique vehicles (+${newVehiclesAdded} new)`);

            // ✅ STOP CONDITION 1: Target count reached
            if (vehicleUrls.size >= targetCount) {
                console.log(`[Puppeteer] ✅ Target count of ${targetCount} reached!`);
                break;
            }

            // Track consecutive no-change
            if (newVehiclesAdded === 0) {
                consecutiveNoChangeCount++;
                console.log(`[Puppeteer] ⚠️  No new vehicles loaded (${consecutiveNoChangeCount}/${maxConsecutiveNoChange})`);

                // ✅ STOP CONDITION 2: Page bottom reached (no new vehicles after multiple scrolls)
                if (consecutiveNoChangeCount >= maxConsecutiveNoChange) {
                    console.log(`[Puppeteer] 🛑 No new vehicles after ${maxConsecutiveNoChange} scrolls - reached bottom`);
                    break;
                }

                // Retry scrolling if stalled
                if (stallRetryCount < maxStallRetries) {
                    stallRetryCount++;
                    console.log(`[Puppeteer] 🔄 Retry attempt ${stallRetryCount}/${maxStallRetries}`);
                    await page.waitForTimeout(2000); // Extra wait on retry
                } else {
                    console.log(`[Puppeteer] ⏹️  Max retries reached without new content`);
                    break;
                }
            } else {
                // Reset counters when new vehicles are found
                consecutiveNoChangeCount = 0;
                stallRetryCount = 0;
            }

            // Scroll to bottom
            const scrollDistance = await page.evaluate(() => {
                const beforeScroll = window.scrollY;
                window.scrollTo(0, document.body.scrollHeight);
                return document.body.scrollHeight - beforeScroll;
            });

            console.log(`[Puppeteer] ⬇️  Scrolled ${scrollDistance}px down`);

            // Wait for new content with natural delay (1.5-2s)
            const waitTime = 1500 + Math.random() * 500;
            await page.waitForTimeout(waitTime);

            // Additional wait for network to settle
            try {
                await page.waitForNetworkIdle({ timeout: 3000, idleTime: 500 });
            } catch (e) {
                // Timeout is okay, continue
            }
        }

        console.log(`[Puppeteer] 🏁 Scroll complete after ${scrollAttempt} attempts`);
        console.log(`[Puppeteer] 📦 Total unique vehicles found: ${vehicleUrls.size}`);

        // Return up to target count
        const finalUrls = Array.from(vehicleUrls).slice(0, targetCount);
        console.log(`[Puppeteer] ✨ Returning ${finalUrls.length} vehicle URLs`);

        return finalUrls;

    } catch (error) {
        console.error('[Puppeteer] ❌ Error:', error.message);
        console.error('[Puppeteer] Stack:', error.stack);
        throw error;
    } finally {
        await browser.close();
        console.log(`[Puppeteer] 🔒 Browser closed`);
    }
}

/**
 * Scrapes images from a specific vehicle detail page as a fallback
 * @param {string} url - Vehicle detail page URL
 * @returns {Promise<string[]>} Array of image URLs
 */
export async function scrapeVehicleDetailImages(url) {
    console.log(`[Puppeteer] 📸 Starting fallback image scrape for: ${url}`);

    const browser = await puppeteer.launch({
        headless: true,
        executablePath: '/usr/bin/chromium',
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--disable-web-security'
        ]
    });

    try {
        const page = await browser.newPage();
        await page.setViewport({ width: 1280, height: 1024 });

        // Block headers/fonts/css for speed
        await page.setRequestInterception(true);
        page.on('request', (req) => {
            if (['font', 'stylesheet'].includes(req.resourceType())) {
                req.abort();
            } else {
                req.continue();
            }
        });

        console.log(`[Puppeteer] 📡 Navigating to: ${url}`);
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });

        // Wait for images - try specific gallery selectors first
        try {
            await page.waitForSelector('.image-gallery-image, .image-gallery-thumbnail-image', { timeout: 15000 });
        } catch (e) {
            console.log('[Puppeteer] ⚠️ Timeout waiting for gallery selectors, trying generic img...');
            try {
                await page.waitForSelector('img', { timeout: 5000 });
            } catch (e2) {
                console.log('[Puppeteer] ⚠️ Timeout waiting for any images');
            }
        }

        // Extract all likely vehicle images
        const imageUrls = await page.evaluate(() => {
            const isValid = (src) => {
                if (!src) return false;
                const lower = src.toLowerCase();
                if (!lower.startsWith('http')) return false;
                if (lower.includes('logo')) return false;
                if (lower.includes('icon')) return false;
                if (lower.includes('avatar')) return false;
                if (lower.endsWith('.svg')) return false;
                return true;
            };

            // Priority 1: Main Gallery Slides
            const mainImages = Array.from(document.querySelectorAll('.image-gallery-image'));
            if (mainImages.length > 0) {
                return mainImages.map(img => img.src).filter(isValid);
            }

            // Priority 2: Thumbnails (if main not found/lazy loaded)
            const thumbImages = Array.from(document.querySelectorAll('.image-gallery-thumbnail-image'));
            if (thumbImages.length > 0) {
                return thumbImages.map(img => img.src).filter(isValid);
            }

            // Priority 3: Fallback to all images
            const allImages = Array.from(document.querySelectorAll('img'));
            return allImages
                .map(img => img.src)
                .filter(isValid);
        });

        // Post-processing: Dedup and Upgrade resolution
        const processedUrls = [...new Set(imageUrls)].map(url => {
            // Attempt to upgrade thumbnail to full size
            // Pattern: .../thumb-Description.jpg -> .../Description.jpg
            if (url.includes('/thumb-')) {
                return url.replace('/thumb-', '/');
            }
            return url;
        });

        console.log(`[Puppeteer] 🖼️ Found ${processedUrls.length} potential images via fallback`);
        return processedUrls;

    } catch (error) {
        console.error('[Puppeteer] ❌ Error in fallback scrape:', error.message);
        return [];
    } finally {
        await browser.close();
    }
}
