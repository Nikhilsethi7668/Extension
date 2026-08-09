import axios from 'axios';
import * as cheerio from 'cheerio';
(async () => {
    const url = 'https://www.brownboysauto.com/cars/used/2023-Honda-Civic-579589';
    const { data } = await axios.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const $ = cheerio.load(data);
    const script = $('#__NEXT_DATA__').html();
    const json = JSON.parse(script);
    const pageProps = json.props?.pageProps || {};
    let vJSON = pageProps.data;
    if (!vJSON && pageProps.preFetchedData?.data) vJSON = pageProps.preFetchedData.data;
    
    console.log("vJSON fields:", Object.keys(vJSON));
    console.log("vJSON.Vehicle fields:", Object.keys(vJSON.Vehicle));
    console.log("vJSON location?", vJSON.location || vJSON.Vehicle.location || vJSON.dealer || vJSON.Vehicle.dealer);
})();
