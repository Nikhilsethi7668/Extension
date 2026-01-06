import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
// Native fetch is available in Node 18+

puppeteer.use(StealthPlugin());

const VINS_TO_CHECK = [
    'SALWS2RU3MA767985' // The remaining failing one
];

async function findVehicleInApi(vin) {
    let page = 1;
    let limit = 50;
    let found = null;

    // Search up to 10 pages (~500 cars)
    while (!found && page < 20) {
        console.log(`Searching API Page ${page}...`);
        const apiUrl = `https://api.hillzusers.com/api/dealership/advance/search/vehicles/brownboysauto.com?page=${page}&limit=${limit}&keywords=`;
        try {
            const res = await fetch(apiUrl, {
                method: 'POST',
                body: '{}',
                headers: { 'Content-Type': 'application/json' }
            });
            const json = await res.json();
            const list = Array.isArray(json) ? json : (json.data || []);

            if (list.length === 0) break;

            found = list.find(v => (v.vin || (v.Vehicle && v.Vehicle.vin_number)) === vin);
            if (found) break;

            page++;
        } catch (e) {
            console.error('API Error:', e);
            break;
        }
    }
    return found;
}

(async () => {
    const browser = await puppeteer.launch({
        headless: 'new',
        executablePath: '/usr/bin/chromium',
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--window-size=1920,1080']
    });
    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });

    for (const vin of VINS_TO_CHECK) {
        console.log(`\n--- Checking VIN: ${vin} ---`);
        const item = await findVehicleInApi(vin);

        if (!item) {
            console.log('❌ Vehicle not found in API search (checked 20 pages).');
            continue;
        }

        console.log('✅ Vehicle Found in API!');
        console.log('FULL ITEM DUMP:', JSON.stringify(item, null, 2));

        const info = item.Vehicle || {};
        const year = info.model_year || item.year;
        const make = (info.make || item.make || '').replace(/\s+/g, '-');
        const model = (info.model || item.model || '').replace(/\s+/g, '-');

        // --- TEST SLUG LOGIC ---
        let derivedSlug = null;
        if (item.MidVDSMedia && item.MidVDSMedia.length > 0) {
            const sampleImg = item.MidVDSMedia[0].media_src || item.MidVDSMedia[0].src || '';
            console.log('Sample Image for Slug Derivation:', sampleImg);

            const match = sampleImg.match(/(?:thumb-)?(\d{4}-.+?)-\d+\.(?:jpg|png|jpeg)/i);
            if (match && match[1]) {
                derivedSlug = match[1];
                console.log('✅ Derived Slug:', derivedSlug);
            } else {
                console.log('❌ Regex failed to match slug from image.');
            }
        } else {
            console.log('❌ No MidVDSMedia found, cannot derive slug.');
        }

        // --- URL CANDIDATE GENERATION ---
        const candidates = [];

        // 1. Derived Slug (Priority)
        if (derivedSlug) {
            candidates.push(`https://www.brownboysauto.com/cars/used/${derivedSlug}-${item.id}`);
        }

        // 2. Standard Hyphenated
        const stdMake = make.replace(/\s+/g, '-');
        const stdModel = model.replace(/\s+/g, '-');
        candidates.push(`https://www.brownboysauto.com/cars/used/${year}-${stdMake}-${stdModel}-${item.id}`);

        // 3. Mixed: Clean Make, Std Model (common if Make is multi-word like Land Rover -> LandRover)
        const cleanMake = make.replace(/[\s-]/g, '');
        candidates.push(`https://www.brownboysauto.com/cars/used/${year}-${cleanMake}-${stdModel}-${item.id}`);

        // 4. Mixed: Std Make, Clean Model
        const cleanModel = model.replace(/[\s-]/g, '');
        candidates.push(`https://www.brownboysauto.com/cars/used/${year}-${stdMake}-${cleanModel}-${item.id}`);

        // 5. Stock Number instead of ID? (Unlikely but possible)
        if (item.stock_NO) {
            if (derivedSlug) candidates.push(`https://www.brownboysauto.com/cars/used/${derivedSlug}-${item.stock_NO}`);
            candidates.push(`https://www.brownboysauto.com/cars/used/${year}-${stdMake}-${stdModel}-${item.stock_NO}`);
        }

        console.log(`\nTesting ${candidates.length} URL Candidates...`);

        for (const [index, testUrl] of candidates.entries()) {
            console.log(`\n🔸 [${index + 1}/${candidates.length}] Trying: ${testUrl}`);
            try {
                // Clear cookies/cache maybe? No, incognito context is fresh enough usually.
                await page.goto(testUrl, { waitUntil: 'networkidle2', timeout: 30000 });

                const res = await page.evaluate(() => {
                    const gallery = document.querySelectorAll('.image-gallery-image').length;
                    const azure = document.querySelectorAll('img[src*="azureedge"]').length;
                    const title = document.title;
                    return { gallery, azure, title };
                });

                console.log(`   👉 Result: Title="${res.title}", Gallery=${res.gallery}, AzureImgs=${res.azure}`);

                if (res.gallery > 0 || res.azure > 5) { // Threshold for success
                    console.log(`   ✅ SUCCESS FOUND! Working URL: ${testUrl}`);
                    await page.screenshot({ path: `success_candidate_${index}.png`, fullPage: true });
                    break;
                }

            } catch (e) {
                console.log(`   ⚠️ Failed to load: ${e.message}`);
            }
        }

        const finalUrl = page.url();
        console.log(`Final URL after nav: ${finalUrl}`);

        // Check DOM Aggressively
        const domAnalysis = await page.evaluate(() => {
            const galleryImages = Array.from(document.querySelectorAll('.image-gallery-image')).map(img => img.src);
            const allImages = Array.from(document.querySelectorAll('img'))
                .map(img => ({ src: img.src, class: img.className, id: img.id }))
                .filter(i => i.src.includes('azureedge'));

            return {
                galleryCount: galleryImages.length,
                allAzureImagesCount: allImages.length,
                pageTitle: document.title,
                h1: document.querySelector('h1')?.innerText,
                htmlSample: document.body.innerHTML.slice(0, 500)
            };
        });

        console.log('DOM Analysis:', JSON.stringify(domAnalysis, null, 2));
    }

    await browser.close();
})();
