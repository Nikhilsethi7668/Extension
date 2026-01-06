// Native fetch is available in Node 18+

const DEALER_DOMAIN = 'brownboysauto.com';
const VEHICLE_ID = '509760'; // The ID of the problem car
const VIN = 'SALWS2RU3MA767985';

const SLUG = '2021-LandRover-RangeRover-509760';

const CANDIDATES = [
    // Media/Gallery specific probes
    `https://api.hillzusers.com/api/dealership/vehicle/${VEHICLE_ID}/media`,
    `https://api.hillzusers.com/api/dealership/vehicle/${VEHICLE_ID}/images`,
    `https://api.hillzusers.com/api/dealership/vehicle/${VEHICLE_ID}/photos`,
    `https://api.hillzusers.com/api/vehicle/${VEHICLE_ID}/media`,
    `https://api.hillzusers.com/api/vehicle/${VEHICLE_ID}/images`,
    // Helper/Internal?
    `https://api.hillzusers.com/api/dealership/media/${VEHICLE_ID}`,
    `https://api.hillzusers.com/api/v1/vehicle/${VEHICLE_ID}/media`,
    // Try the "MidVDSMedia" pattern?
    `https://api.hillzusers.com/api/dealership/vehicle/${VEHICLE_ID}/midvdsmedia`,
    // Try VIN based
    `https://api.hillzusers.com/api/dealership/vehicle/${VIN}/media`
];

(async () => {
    console.log('--- Probing API Endpoints ---');

    const doFetch = fetch;

    for (const url of CANDIDATES) {
        try {
            console.log(`Testing: ${url}`);
            const res = await doFetch(url, {
                method: 'GET',
                headers: { 'Content-Type': 'application/json' }
            });

            console.log(`  > Status: ${res.status}`);
            if (res.status === 200) {
                const text = await res.text();
                try {
                    const json = JSON.parse(text);
                    console.log('  > ✅ Valid JSON Response!');
                    // Check if it has images
                    const keys = Object.keys(json);
                    console.log('  > Keys:', keys.slice(0, 5));

                    if (JSON.stringify(json).includes('MidVDSMedia') || JSON.stringify(json).includes('images')) {
                        console.log('  > 📸 Contains Image Data!');
                        console.log('  > DUMP (First 500 chars):', JSON.stringify(json).slice(0, 500));
                        return; // Found it!
                    }
                } catch (e) {
                    console.log('  > ❌ Not JSON:', text.slice(0, 50));
                }
            }
        } catch (e) {
            console.log(`  > Error: ${e.message}`);
        }
    }
})();
