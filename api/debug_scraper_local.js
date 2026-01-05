import axios from 'axios';
import * as cheerio from 'cheerio';
import fs from 'fs';

const debugScraper = async () => {
    // URL from the debug output
    const url = "https://www.brownboysauto.com/cars/used/2023-tesla-modely-439184";
    console.log('[Debug] Fetching Detail URL:', url);

    try {
        const { data } = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        });

        console.log('[Debug] HTML fetched. Length:', data.length);
        const $ = cheerio.load(data);

        // Check for Detail Page Selectors
        console.log('[Debug] Checking Selectors...');
        const vehicle = {};

        $('.vehicle_single_detail_div__container').each((i, el) => {
            const label = $(el).find('span:first-child').text().trim().replace(/:$/, '');
            const valueText = $(el).find('span:last-of-type').text().trim();
            const complexValue = $(el).find('div.d-flex span.d-none').text().trim();
            const value = complexValue || valueText;
            console.log(`[Debug] Found Field: ${label} = ${value}`);
        });

        // Images
        const images = [];
        $('.image-gallery-slide img').each((i, el) => {
            const src = $(el).attr('src');
            if (src) images.push(src);
        });
        console.log('[Debug] Images Found:', images.length);
        if (images.length > 0) console.log('[Debug] First Image:', images[0]);

        // Description
        const desc = $('.DetaileProductCustomrWeb-description-text').text().trim();
        console.log('[Debug] Description Length:', desc.length);

        // Price
        console.log('[Debug] Price:', $('.price-value, .final-price').text().trim());

        const nextDataScript = $('#__NEXT_DATA__').html();
        if (!nextDataScript) {
            console.error('[Debug] #__NEXT_DATA__ NOT FOUND!');
            return;
        }

        console.log('[Debug] #__NEXT_DATA__ found. Length:', nextDataScript.length);

        const json = JSON.parse(nextDataScript);
        console.log('[Debug] JSON Structure Keys:', Object.keys(json));

        // Dig into props
        const props = json.props || {};
        const pageProps = props.pageProps || {};

        console.log('[Debug] pageProps Keys:', Object.keys(pageProps));

        const eggsState = pageProps.__eggsState || {};
        console.log('[Debug] __eggsState Keys:', Object.keys(eggsState));

        const vehiclesData = pageProps.vehiclesData;

        console.log('[Debug] vehiclesData found:', !!vehiclesData);
        if (vehiclesData) {
            console.log('[Debug] vehiclesData Keys:', Object.keys(vehiclesData));
            if (vehiclesData.results) {
                console.log('[Debug] vehiclesData.results length:', vehiclesData.results.length);
                if (vehiclesData.results.length > 0) {
                    console.log('[Debug] First Vehicle:', JSON.stringify(vehiclesData.results[0], null, 2));
                }
            } else if (Array.isArray(vehiclesData)) {
                console.log('[Debug] vehiclesData is Array, length:', vehiclesData.length);
                console.log('[Debug] First Vehicle:', JSON.stringify(vehiclesData[0], null, 2));
            } else {
                console.log('[Debug] vehiclesData structure unknown:', JSON.stringify(vehiclesData).substring(0, 500));
            }
        }

        const vehiclesData2 = pageProps.vehiclesData2;
        if (vehiclesData2) {
            console.log('[Debug] vehiclesData2 found. Type:', typeof vehiclesData2);
        }

        // Search for JSON in detail page too?
        if (nextDataScript) {
            const json = JSON.parse(nextDataScript);
            const props = json.props?.pageProps || {};
            console.log('[Debug] Detail Page JSON keys:', Object.keys(props));

            if (props.data) {
                console.log('[Debug] Detail Page Data Keys:', Object.keys(props.data));
                console.log('[Debug] Detail Page Data:', JSON.stringify(props.data, null, 2));
            }
        }

    } catch (e) {
        console.error('[Debug] Error:', e);
    }
};

debugScraper();
