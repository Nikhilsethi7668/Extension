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
        await page.goto(TARGET_URL, { waitUntil: 'networkidle2', timeout: 60000 });

        // Wait briefly
        await new Promise(r => setTimeout(r, 5000));

        const html = await page.content();
        fs.writeFileSync('debug_full_page.html', html);
        console.log(`✅ HTML Dumped to debug_full_page.html (Size: ${html.length} chars)`);

        // Check for specific snippet user provided
        if (html.includes('image-gallery-slide')) {
            console.log('✅ Found "image-gallery-slide" in HTML!');
        } else {
            console.log('❌ "image-gallery-slide" NOT found in HTML.');
        }

    } catch (e) {
        console.log('Error:', e.message);
    }

    await browser.close();
})();
