// Native fetch is available in Node 18+

const BASE_IMG = 'https://image123.azureedge.net/1452782bcltd/2021-LandRover-RangeRover-28786268259675896.jpg';

const VARIANTS = [
    BASE_IMG.replace('.jpg', '-1.jpg'),
    BASE_IMG.replace('.jpg', '-01.jpg'),
    BASE_IMG.replace('.jpg', '_1.jpg'),
    BASE_IMG.replace('.jpg', '_01.jpg'),
    BASE_IMG.replace('.jpg', '-2.jpg'),
    BASE_IMG.replace('.jpg', '-02.jpg'),
    // Try incrementing the long ID?
    'https://image123.azureedge.net/1452782bcltd/2021-LandRover-RangeRover-28786268259675897.jpg'
];

(async () => {
    const doFetch = fetch;

    console.log('--- Testing Image Variants ---');
    console.log(`Base: ${BASE_IMG}`);

    for (const url of VARIANTS) {
        try {
            const res = await doFetch(url, { method: 'HEAD' });
            console.log(`[${res.status}] ${url}`);
            if (res.status === 200) console.log('   ✅ FOUND!');
        } catch (e) {
            console.log(`Error: ${e.message}`);
        }
    }
})();
