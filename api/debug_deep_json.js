import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import fs from 'fs';

puppeteer.use(StealthPlugin());

const TARGET_URL = 'https://www.brownboysauto.com/cars/used/2021-LandRover-RangeRover-509760';

(async () => {
    const browser = await puppeteer.launch({
        headless: 'new',
        executablePath: '/usr/bin/chromium',
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    });
    const page = await browser.newPage();
    console.log(`Navigating to URL: ${TARGET_URL}`);

    try {
        await page.goto(TARGET_URL, { waitUntil: 'networkidle0', timeout: 60000 });

        const deepAnalysis = await page.evaluate(() => {
            const script = document.getElementById('__NEXT_DATA__');
            if (!script) return { found: false };
            const json = JSON.parse(script.innerHTML);

            // Recursive function to find arrays containing "azureedge" strings
            const foundPaths = [];

            function search(obj, path = '') {
                if (!obj || typeof obj !== 'object') return;

                if (Array.isArray(obj)) {
                    // Check if array contains image-like things
                    const hasImage = obj.some(item =>
                        (typeof item === 'string' && item.includes('azureedge')) ||
                        (item && typeof item === 'object' && JSON.stringify(item).includes('azureedge'))
                    );
                    if (hasImage) {
                        foundPaths.push({ path, length: obj.length, sample: JSON.stringify(obj[0]).slice(0, 100) });
                    }
                }

                Object.keys(obj).forEach(key => {
                    search(obj[key], path ? `${path}.${key}` : key);
                });
            }

            search(json);
            return { found: true, paths: foundPaths, fullKeys: Object.keys(json.props.pageProps) };
        });

        console.log('Deep JSON Analysis:', JSON.stringify(deepAnalysis, null, 2));

    } catch (e) {
        console.log('Error:', e.message);
    }

    await browser.close();
})();
