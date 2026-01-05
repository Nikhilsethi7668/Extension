/**
 * Debug script to test what the API returns for a specific vehicle
 * Run with: node testApiResponse.js
 */

import axios from 'axios';

const VEHICLE_ID = 513185; // Land Rover ID from URL
const VEHICLE_SLUG = '/cars/used/2020-landrover-rangeroverevoque-513185';

async function testApiResponse() {
    console.log('\n========================================');
    console.log('🔍 DEBUG: Testing API Response');
    console.log('📍 Vehicle ID:', VEHICLE_ID);
    console.log('========================================\n');

    // First, get the buildId from the main page
    try {
        console.log('📡 Fetching main page for buildId...');
        const mainPage = await axios.get('https://www.brownboysauto.com/cars', {
            headers: { 'User-Agent': 'Mozilla/5.0' }
        });

        const buildIdMatch = mainPage.data.match(/"buildId":"([^"]+)"/);
        if (!buildIdMatch) {
            console.log('❌ Could not find buildId');
            return;
        }

        const buildId = buildIdMatch[1];
        console.log('✅ BuildId:', buildId);

        // Now fetch the detail API
        const detailUrl = `https://www.brownboysauto.com/_next/data/${buildId}${VEHICLE_SLUG}.json`;
        console.log('\n📡 Fetching detail API:', detailUrl);

        const detailResponse = await axios.get(detailUrl, {
            headers: { 'User-Agent': 'Mozilla/5.0' }
        });

        const pageProps = detailResponse.data.pageProps || {};
        const data = pageProps.data || {};
        const data2 = pageProps.data2 || [];

        console.log('\n📊 API RESPONSE STRUCTURE:');
        console.log('===========================');
        console.log('pageProps keys:', Object.keys(pageProps));
        console.log('data keys:', Object.keys(data));
        console.log('data2 length:', data2.length);

        // Check data2 for images
        console.log('\n📸 DATA2 (IMAGES) CONTENT:');
        console.log('===========================');
        if (data2.length > 0) {
            data2.forEach((item, idx) => {
                console.log(`\n[${idx}] media_type: ${item.media_type}, media_src: ${item.media_src}`);
            });
        } else {
            console.log('❌ data2 is EMPTY - no images from API!');
        }

        // Check the full response for any image fields
        console.log('\n🔍 SEARCHING FOR ALL IMAGE FIELDS IN RESPONSE:');
        console.log('================================================');
        const findImages = (obj, path = '') => {
            if (!obj) return;
            if (typeof obj === 'string') {
                if (obj.match(/\.(jpg|jpeg|png|webp)/i) && obj.includes('http')) {
                    console.log(`  ${path}: ${obj}`);
                }
            } else if (Array.isArray(obj)) {
                obj.forEach((item, i) => findImages(item, `${path}[${i}]`));
            } else if (typeof obj === 'object') {
                Object.entries(obj).forEach(([key, val]) => {
                    if (key.match(/(image|img|photo|media|src|url)/i)) {
                        if (typeof val === 'string' && val.includes('http')) {
                            console.log(`  ${path}.${key}: ${val}`);
                        }
                    }
                    findImages(val, `${path}.${key}`);
                });
            }
        };
        findImages(pageProps, 'pageProps');

        console.log('\n\n✅ DEBUG COMPLETE');

    } catch (error) {
        console.error('❌ Error:', error.message);
        if (error.response) {
            console.error('Status:', error.response.status);
        }
    }
}

testApiResponse();
