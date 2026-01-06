import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import fs from 'fs';

puppeteer.use(StealthPlugin());

(async () => {
    const browser = await puppeteer.launch({
        headless: 'new',
        executablePath: '/usr/bin/chromium',
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    });
    const page = await browser.newPage();

    // The failing URL from logs
    const url = 'https://www.brownboysauto.com/cars/used/2021-Tesla-Model-3-489450';

    console.log(`Navigating to ${url}...`);
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });

    // 1. Dump __NEXT_DATA__ structure
    const nextData = await page.evaluate(() => {
        try {
            const script = document.getElementById('__NEXT_DATA__');
            return script ? JSON.parse(script.innerHTML) : null;
        } catch (e) { return { error: e.toString() }; }
    });

    if (nextData && nextData.props && nextData.props.pageProps && nextData.props.pageProps.data) {
        const data = nextData.props.pageProps.data;
        console.log('--- JSON KEYS ---');
        console.log(Object.keys(data));

        console.log('--- data2 (expected gallery) ---');
        console.log(JSON.stringify(data.data2, null, 2));

        console.log('--- Vehicle Object ---');
        console.log(JSON.stringify(data.Vehicle, null, 2));
    } else {
        console.log('NO NEXT_DATA FOUND OR INVALID STRUCTURE');
        console.log(JSON.stringify(nextData, null, 2));
    }

    // 2. Dump DOM classes for images
    const domClasses = await page.evaluate(() => {
        const classes = [];
        document.querySelectorAll('img').forEach(img => {
            if (img.src && img.src.includes('azureedge')) {
                classes.push({
                    src: img.src,
                    parentClass: img.parentElement ? img.parentElement.className : 'NONE',
                    grandParentClass: img.parentElement && img.parentElement.parentElement ? img.parentElement.parentElement.className : 'NONE'
                });
            }
        });
        return classes.slice(0, 5); // Just first 5
    });

    console.log('--- DOM IMAGE CLASSES ---');
    console.log(JSON.stringify(domClasses, null, 2));

    await browser.close();
})();
