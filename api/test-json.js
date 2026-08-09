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
    const nextDataScript = $('#__NEXT_DATA__').html();
    const json = JSON.parse(nextDataScript);
    const pageProps = json.props?.pageProps || {};
    let vJSON = pageProps.data;
    if (!vJSON && pageProps.preFetchedData?.data) {
        vJSON = pageProps.preFetchedData.data;
    }
    console.log("Has vJSON?", !!vJSON);
    console.log("Has vJSON.Vehicle?", !!(vJSON && vJSON.Vehicle));
    
    if (vJSON && vJSON.Vehicle) {
        const desc = $('.DetaileProductCustomrWeb-description-text').text().trim();
        console.log("Desc from cheerio inside block:", desc.substring(0, 50));
    }
})();
