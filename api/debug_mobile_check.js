import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

puppeteer.use(StealthPlugin());

const TARGET_URL = 'https://www.brownboysauto.com/cars/used/2021-LandRover-RangeRover-509760';

(async () => {
    const browser = await puppeteer.launch({
        headless: 'new',
        executablePath: '/usr/bin/chromium',
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    });
    const page = await browser.newPage();

    // EMULATE MOBILE
    await page.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15E148 Safari/604.1');
    await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });

    console.log(`Navigating to URL (Mobile Emulation): ${TARGET_URL}`);

    try {
        await page.goto(TARGET_URL, { waitUntil: 'networkidle2', timeout: 60000 });

        // Wait for specific user-provided class or generic gallery
        try {
            await page.waitForSelector('.image-gallery-slide', { timeout: 15000 });
        } catch (e) { console.log('Wait timeout for .image-gallery-slide'); }

        const metrics = await page.evaluate(() => {
            const slides = [];
            document.querySelectorAll('.image-gallery-slide img').forEach(img => {
                if (img.src) slides.push(img.src);
            });

            const thumbs = [];
            document.querySelectorAll('.image-gallery-thumbnail-image').forEach(img => {
                if (img.src) thumbs.push(img.src);
            });

            return {
                slideCount: slides.length,
                thumbCount: thumbs.length,
                samples: slides.slice(0, 3)
            };
        });

        console.log('Mobile DOM Analysis:', JSON.stringify(metrics, null, 2));

        await page.screenshot({ path: 'debug_mobile.png', fullPage: true });

    } catch (e) {
        console.log('Error:', e.message);
    }

    await browser.close();
})();
