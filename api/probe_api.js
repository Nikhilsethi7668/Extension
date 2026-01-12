
(async () => {
    console.log('--- NETWORK PROBE (Native Fetch) ---');
    console.log('Time:', new Date().toISOString());
    console.log('Node Version:', process.version);

    const checks = [
        { name: 'Google (Internet)', url: 'https://www.google.com' },
        { name: 'Brown Boys (Direct)', url: 'https://www.brownboysauto.com' },
        { name: 'API Hillz (Direct)', url: 'https://api.hillzusers.com/api/dealership/advance/search/vehicles/www.brownboysauto.com?page=1&limit=1' },
        { name: 'Google Translate (Top)', url: 'https://translate.google.com' },
        { name: 'Google Translate (Proxy)', url: 'https://www-brownboysauto-com.translate.goog/cars' }
    ];

    const runCheck = async (check) => {
        console.log(`\nTesting: ${check.name} ...`);
        console.log(`URL: ${check.url}`);
        const start = Date.now();

        try {
            // Native fetch with minimal headers (mimicking a browser slightly)
            const response = await fetch(check.url, {
                method: check.name.includes('API') ? 'POST' : 'GET', // Use POST for API check if needed, though GET might be enough to test connectivity
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                },
                body: check.name.includes('API') ? JSON.stringify({ keywords: "" }) : undefined,
            });

            const duration = Date.now() - start;
            console.log(`[PASS] Status: ${response.status} (${duration}ms)`);

            if (response.status === 403 || response.status === 503) {
                console.log('       Type: BLOCKED/UNAVAILABLE');
                const text = await response.text();
                console.log(`       Body Preview: ${text.substring(0, 100)}...`);
            } else if (response.ok) {
                // Read body to ensure full connection
                const text = await response.text();
                console.log(`       Body Length: ${text.length}`);
            }
        } catch (error) {
            const duration = Date.now() - start;
            console.log(`[FAIL] Error: ${error.message} (${duration}ms)`);
            if (error.cause) console.log(`       Cause: ${error.cause}`);
        }
    };

    for (const check of checks) {
        await runCheck(check);
    }
    console.log('\n--- END PROBE ---');
})();
