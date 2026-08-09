import puppeteer from 'puppeteer';

(async () => {
    const url = 'https://www.brownboysauto.com/cars/used/2023-Honda-Civic-579589';
    const browser = await puppeteer.launch({ headless: 'new' });
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
    
    // Wait for the description container to appear
    await page.waitForSelector('.DetaileProductCustomrWeb-description-text', { timeout: 10000 }).catch(() => console.log('Timeout waiting for description container'));

    const data = await page.evaluate(() => {
        const descEl = document.querySelector('.DetaileProductCustomrWeb-description-text');
        return {
            hasDescEl: !!descEl,
            html: descEl ? descEl.innerHTML.substring(0, 500) : null,
            textContent: descEl ? descEl.textContent.trim() : null
        };
    });

    console.log(JSON.stringify(data, null, 2));
    await browser.close();
})();
