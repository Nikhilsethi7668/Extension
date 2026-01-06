
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

puppeteer.use(StealthPlugin());

(async () => {
    console.log('Launching browser...');
    const browser = await puppeteer.launch({
        headless: 'new',
        executablePath: '/usr/bin/chromium',
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--disable-web-security',
        ]
    });

    try {
        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

        // Important: Set Referer to look like it's coming from the site
        await page.setExtraHTTPHeaders({
            'Referer': 'https://www.brownboysauto.com/',
            'Origin': 'https://www.brownboysauto.com'
        });

        // Navigate to the main site first to establish context
        console.log('Navigating to main site...');
        await page.goto('https://www.brownboysauto.com/cars', { waitUntil: 'networkidle2', timeout: 60000 });

        // Try the API URL provided by user
        const testUrl = 'https://api.hillzusers.com/api/dealership/advance/search/vehicles/www.brownboysauto.com?page=1&limit=10&keywords=';
        console.log(`\nTesting Fetch inside page context: ${testUrl}`);
        try {
            const result = await page.evaluate(async (u) => {
                try {
                    const res = await fetch(u, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' }
                    });
                    const data = await res.json();
                    if (Array.isArray(data) && data.length > 0) {
                        return {
                            status: res.status,
                            sampleKeys: Object.keys(data[0]),
                            sampleItem: data[0]
                        };
                    }
                    return { status: res.status, data };
                } catch (err) {
                    return { error: err.toString() };
                }
            }, testUrl);

            if (result.error) {
                console.log(`Fetch Error: ${result.error}`);
            } else {
                console.log(`Status: ${result.status}`);
                console.log('--- SAMPLE ITEM KEYS ---');
                console.log(JSON.stringify(result.sampleKeys, null, 2));
                console.log('--- SAMPLE ITEM DUMP ---');
                console.log(JSON.stringify(result.sampleItem, null, 2));
            }
        } catch (e) {
            console.log(`Puppeteer Error: ${e.message}`);
        }


    } catch (error) {
        console.error('Error:', error);
    } finally {
        await browser.close();
    }
})();
