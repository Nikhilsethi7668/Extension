import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

puppeteer.use(StealthPlugin());

const TARGET_URL = 'https://www.brownboysauto.com/cars/used/2021-LandRover-RangeRover-509760';

(async () => {
    let browser = null;
    try {
        browser = await puppeteer.launch({
            headless: 'new',
            executablePath: '/usr/bin/chromium',
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
        });
        const page = await browser.newPage();

        // --- KEY FIX: Mobile Emulation ---
        await page.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15E148 Safari/604.1');
        await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });

        console.log(`Navigating to URL (Mobile Mode): ${TARGET_URL}`);
        await page.goto(TARGET_URL, { waitUntil: 'networkidle2', timeout: 60000 });

        // Wait for user-reported class
        try {
            await page.waitForSelector('.image-gallery-slide', { timeout: 10000 });
            console.log('✅ Found .image-gallery-slide!');
        } catch (e) {
            console.log('❌ Timeout waiting for .image-gallery-slide');
        }

        const images = await page.evaluate(() => {
            const srcs = new Set();
            document.querySelectorAll('.image-gallery-slide img').forEach(img => srcs.add(img.src));
            return Array.from(srcs);
        });

        console.log('Images Found:', JSON.stringify(images, null, 2));

    } catch (e) {
        console.error('Error:', e);
    } finally {
        if (browser) await browser.close();
    }
})();
