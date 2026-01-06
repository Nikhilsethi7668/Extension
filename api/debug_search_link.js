import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

puppeteer.use(StealthPlugin());

const VINS_TO_CHECK = [
    'SALWS2RU3MA767985',
    'SALGS2RU5LA408978'
];

(async () => {
    const browser = await puppeteer.launch({
        headless: 'new',
        executablePath: '/usr/bin/chromium',
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--window-size=1920,1080']
    });
    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });

    for (const vin of VINS_TO_CHECK) {
        console.log(`\n--- Searching Website for VIN: ${vin} ---`);

        // Use the public search page
        // Note: URL structure for search might need encoding or specific params.
        // Trying simple query param first.
        const searchUrl = `https://www.brownboysauto.com/cars/used?keyword=${vin}`;
        console.log(`Navigating to Search: ${searchUrl}`);

        try {
            await page.goto(searchUrl, { waitUntil: 'networkidle2', timeout: 60000 });

            // Wait for results
            try {
                // Wait for any vehicle card or "no results"
                await page.waitForSelector('.vehicle-card a, .car_item a, a[href*="/cars/used/"]', { timeout: 10000 });
            } catch (e) {
                console.log('Timeout waiting for vehicle cards on search page.');
            }

            // Extract Links
            const results = await page.evaluate((targetVin) => {
                const links = [];
                // Look for anchor tags that likely point to details
                // Selector needs to be broad enough to catch whatever they use
                const anchors = Array.from(document.querySelectorAll('a'));

                anchors.forEach(a => {
                    const href = a.getAttribute('href');
                    if (href && href.includes('/cars/used/') && !href.includes('?')) {
                        // Check if it matches our VIN if possible, but since we searched BY VIN, 
                        // any result is likely our car.
                        // We can also check innerText for Year/Make matches if needed.
                        links.push({
                            text: a.innerText.replace(/\n/g, ' ').trim(),
                            href: href
                        });
                    }
                });

                // Deduplicate
                const unique = [...new Set(links.map(l => l.href))];
                return unique;
            }, vin);

            console.log(`Found ${results.length} unique detail links:`);
            results.forEach(l => console.log(` - https://www.brownboysauto.com${l.startsWith('/') ? l : '/' + l}`));

            if (results.length > 0) {
                const bestHref = results[0];
                const fullUrl = `https://www.brownboysauto.com${bestHref.startsWith('/') ? bestHref : '/' + bestHref}`;
                console.log(`\nTesting Navigation to Extracted Link: ${fullUrl}`);

                await page.goto(fullUrl, { waitUntil: 'networkidle2', timeout: 45000 });

                // Check Gallery
                const domMetric = await page.evaluate(() => {
                    return {
                        galleryCount: document.querySelectorAll('.image-gallery-image').length,
                        azureCount: document.querySelectorAll('img[src*="azureedge"]').length
                    };
                });
                console.log(`Page Metrics: Gallery=${domMetric.galleryCount}, Azure=${domMetric.azureCount}`);

                if (domMetric.galleryCount > 0) {
                    console.log('✅ CONFIRMED: This link works!');
                } else {
                    console.log('❌ Link loaded but gallery is empty.');
                }
            } else {
                console.log('❌ No links found on search results page.');
                await page.screenshot({ path: `debug_search_fail_${vin}.png` });
            }

        } catch (e) {
            console.log(`Error processing VIN ${vin}:`, e.message);
        }
    }

    await browser.close();
})();
