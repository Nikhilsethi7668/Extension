const fs = require('fs');
const file = '/Users/nikhi/Desktop/facebookmark/api/src/utils/brownBoysApiScraper.js';
let content = fs.readFileSync(file, 'utf8');

const startMarker = '// 3. Instead of scrolling, fetch from API directly';
const endMarker = '    } catch (error) {';

const startIndex = content.indexOf(startMarker);
const endIndex = content.lastIndexOf(endMarker, content.length - 1);

if (startIndex === -1 || endIndex === -1) {
    console.error("Could not find markers!");
    process.exit(1);
}

const replacement = `        // 3. Instead of scrolling, fetch from API directly
        const extractedUrls = [];
        let currentPage = 1;
        let hasMore = true;

        console.log('[Puppeteer] 🔄 Starting API-based Pagination...');

        while (hasMore && extractedUrls.length < targetCount) {
            console.log(\`[Puppeteer] 📄 Fetching Page \${currentPage}...\`);

            const apiUrl = \`https://api.hillzusers.com/api/dealership/advance/search/vehicles/www.brownboysauto.com?page=\${currentPage}&limit=\${BATCH_SIZE}\`;

            const requestBody = {
                fuel_type: filters.fuel_type || "",
                body_style: filters.body_style || "",
                engine_cylinders: filters.engine_cylinders || "",
                year_end: filters.year_end !== null ? filters.year_end : 2027,
                price_low: filters.price_low ? filters.price_low : 0,
                price_high: filters.price_high || "",
                odometer_type: 2,
                make: filters.make || "",
                model: filters.model || "",
                transmission: filters.transmission || "",
                drive_train: "",
                doors: filters.doors || "",
                interior_color: filters.interior_color || "",
                Exterior_color: filters.exterior_color || "",
                sortKind: { kind: "", type: null, order: 0 },
                kind: "", type: "null", order: 0, sold: "",
                is_coming_soon: "", is_it_special: null,
                year_start: filters.year_start !== null ? filters.year_start : 0,
                odometer_low: filters.odometer_low !== null ? filters.odometer_low : 0,
                odometer_high: filters.odometer_high !== null ? filters.odometer_high : 162000,
                keywords: ""
            };

            const apiResult = await page.evaluate(async (url, body) => {
                try {
                    const res = await fetch(url, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(body)
                    });
                    if (!res.ok) throw new Error(\`API returned \${res.status}\`);
                    const json = await res.json();
                    return { vehicles: json.data?.data || [], meta: json.data?.meta };
                } catch (err) {
                    return { error: err.message };
                }
            }, apiUrl, requestBody);

            if (apiResult.error || !apiResult.vehicles || apiResult.vehicles.length === 0) {
                console.log('[Puppeteer] ⚠️ API returned no more vehicles or error:', apiResult.error);
                hasMore = false;
                break;
            }

            console.log(\`[Puppeteer] ✅ Got \${apiResult.vehicles.length} vehicles from API\`);

            for (const item of apiResult.vehicles) {
                if (extractedUrls.length >= targetCount) break;

                const info = item.vehicle || item.info || item;
                const year = info.model_year || item.model_year || 0;
                const make = info.make || item.make || '';
                const model = info.model || item.model || '';
                
                if (year && make && model && item.id) {
                    const sourceUrl = \`https://www.brownboysauto.com/cars/used/\${year}-\${make.replace(/\\s+/g, '-')}-\${model.replace(/\\s+/g, '-')}-\${item.id}\`;
                    if (!extractedUrls.includes(sourceUrl)) {
                        extractedUrls.push(sourceUrl);
                    }
                }
            }

            if (apiResult.meta) {
                const current = apiResult.meta.current_page;
                const last = apiResult.meta.last_page;
                if (current >= last) hasMore = false;
                else currentPage++;
            } else {
                hasMore = false;
            }
        }

        console.log(\`[Puppeteer] 🎉 Finished pagination. Returning \${extractedUrls.length} URLs.\`);

        return {
            type: 'expanded_search',
            urls: extractedUrls
        };

`;

const newContent = content.substring(0, startIndex) + replacement + content.substring(endIndex);
fs.writeFileSync(file, newContent, 'utf8');
console.log("Successfully patched brownBoysApiScraper.js!");
