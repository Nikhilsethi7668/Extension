const puppeteer = require('puppeteer');
const readline = require('readline');

// --- CONFIGURATION ---
const TARGET_URL = 'https://www.autotrader.com/cars-for-sale/all-cars'; // Replace with actual URL
const CARD_SELECTOR = '[data-cmp="inventoryListing"]'; // Replace with actual card selector
const SEE_MORE_BUTTON_SELECTOR = 'button[data-cmp="loadMore"]'; // Replace with actual button selector
// ---------------------

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

const askQuestion = (query) => {
    return new Promise(resolve => rl.question(query, resolve));
};

async function scrape() {
    console.log('--- Puppeteer Scraper ---');

    // 1. Ask User for Input
    const answer = await askQuestion('Enter the maximum number of cards to scrape: ');
    const maxCards = parseInt(answer, 10);

    if (isNaN(maxCards) || maxCards <= 0) {
        console.error('Invalid input. Please enter a positive integer.');
        rl.close();
        return;
    }

    console.log(`Targeting ${maxCards} cards...`);

    const browser = await puppeteer.launch({
        headless: false, // Set to true for headless mode
        defaultViewport: null,
        args: ['--start-maximized']
    });

    const page = await browser.newPage();

    try {
        // 2. Navigate to Page
        console.log(`Navigating to ${TARGET_URL}...`);
        await page.goto(TARGET_URL, { waitUntil: 'networkidle2', timeout: 60000 });

        // 3. Initial Count Check
        let currentCount = await page.$$eval(CARD_SELECTOR, els => els.length);
        console.log(`Initial visible cards: ${currentCount}`);

        if (currentCount >= maxCards) {
            console.log('Target reached with initial load. Scraping now...');
        } else {
            // 4. "See More" Logic
            const seeMoreBtn = await page.$(SEE_MORE_BUTTON_SELECTOR);
            if (seeMoreBtn) {
                console.log('Clicking "See more results"...');
                await seeMoreBtn.click();
                // Wait for some content change or timeout
                await new Promise(r => setTimeout(r, 3000));
            } else {
                console.log('"See more results" button not found. Proceeding to scroll mode.');
            }

            // 5. Infinite Scroll Loop
            console.log('Entering infinite scroll mode...');
            let previousCount = currentCount;
            let noChangeRetries = 0;
            const MAX_RETRIES = 3;

            while (currentCount < maxCards) {
                // Scroll to bottom
                await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));

                // Wait for content load (randomized delay to be safer)
                await new Promise(r => setTimeout(r, 2000 + Math.random() * 1000));

                // Check count
                currentCount = await page.$$eval(CARD_SELECTOR, els => els.length);
                console.log(`Loaded ${currentCount} cards...`);

                if (currentCount === previousCount) {
                    noChangeRetries++;
                    console.log(`No new items loaded (${noChangeRetries}/${MAX_RETRIES})...`);

                    if (noChangeRetries >= MAX_RETRIES) {
                        console.log('Stopping: No more new cards are loading.');
                        break;
                    }
                } else {
                    noChangeRetries = 0; // Reset retry counter
                    previousCount = currentCount;
                }
            }
        }

        // 6. Extraction
        console.log(`Scraping up to ${maxCards} items...`);
        const data = await page.$$eval(CARD_SELECTOR, (cards, limit) => {
            return cards.slice(0, limit).map(card => {
                // Modify these selectors based on the actual HTML structure of a card
                const titleEl = card.querySelector('h2') || card.querySelector('.title');
                const priceEl = card.querySelector('.price') || card.querySelector('[data-cmp="pricing"]');

                return {
                    title: titleEl ? titleEl.innerText.trim() : 'N/A',
                    price: priceEl ? priceEl.innerText.trim() : 'N/A',
                    // Add more fields here
                };
            });
        }, maxCards);

        console.log('--- Results ---');
        console.log(JSON.stringify(data, null, 2));
        console.log(`Successfully scraped ${data.length} items.`);

    } catch (error) {
        console.error('An error occurred during scraping:', error);
    } finally {
        await browser.close();
        rl.close();
    }
}

scrape();
