import puppeteer from 'puppeteer';

(async () => {
    const url = 'https://www.brownboysauto.com/cars/used/2023-Honda-Civic-579589';
    const browser = await puppeteer.launch({ headless: 'new' });
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
    
    try {
        const data = await page.evaluate(() => {
            const imgSrcs = new Set();
            document.querySelectorAll('.image-gallery-image').forEach(img => {
                if (img.src) imgSrcs.add(img.src);
            });
            let description = '';
            const descEl = document.querySelector('.DetaileProductCustomrWeb-description-text') || 
                           document.querySelector('.vehicle-description') ||
                           document.querySelector('#description');
            if (descEl) description = descEl.textContent.trim();

            let location = '';
            const locEl = document.querySelector('[data-cmp="listingTitleContainer"]') || 
                          document.querySelector('.dealer-location') ||
                          document.querySelector('.address');
            if (locEl) {
                const text = locEl.innerText || locEl.textContent || '';
                const match = text.match(/([A-Z][a-z]+(?:\s[A-Z][a-z]+)*),\s([A-Z]{2})/);
                if (match) location = `${match[1]}, ${match[2]}`;
            }
            if (!location) {
                const text = document.body.innerText || document.body.textContent || '';
                const match = text.match(/([A-Z][a-z]+(?:\s[A-Z][a-z]+)*),\s(BC|AB|ON|MB|SK|QC|NS|NB|PE|NL)\s([A-Z]\d[A-Z]\s?\d[A-Z]\d)?/i);
                if (match) location = `${match[1]}, ${match[2].toUpperCase()}`;
            }
            if (!location) location = 'Vancouver, BC';
            
            return {
                images: Array.from(imgSrcs),
                description,
                location
            };
        });
        console.log("Evaluate Success:", JSON.stringify(data, null, 2));
    } catch (err) {
        console.log("Evaluate Error:", err);
    }
    await browser.close();
})();
