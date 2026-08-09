import axios from 'axios';
import * as cheerio from 'cheerio';

(async () => {
    const url = 'https://www.brownboysauto.com/cars/used/2023-Honda-Civic-579589';
    const { data } = await axios.get(url, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
    });
    const $ = cheerio.load(data);
    const els = $('.DetaileProductCustomrWeb-description-text');
    console.log("Number of elements:", els.length);
    els.each((i, el) => {
        console.log(`Element ${i} text:`, $(el).text().trim().substring(0, 50));
    });
})();
