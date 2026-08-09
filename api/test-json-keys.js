import axios from 'axios';
import * as cheerio from 'cheerio';
(async () => {
    const url = 'https://www.brownboysauto.com/cars/used/2023-Honda-Civic-579589';
    const { data } = await axios.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const $ = cheerio.load(data);
    const script = $('#__NEXT_DATA__').html();
    const json = JSON.parse(script);
    console.log("Keys in initialState:", Object.keys(json.props.pageProps.initialState));
    console.log("inventory.data length:", json.props.pageProps.initialState.inventory.data ? json.props.pageProps.initialState.inventory.data.length : 'undefined');
    if (json.props.pageProps.initialState.inventory.data && json.props.pageProps.initialState.inventory.data.length > 0) {
        console.log("description in data[0]:", json.props.pageProps.initialState.inventory.data[0].comment ? json.props.pageProps.initialState.inventory.data[0].comment.length : 'undefined');
    }
})();
