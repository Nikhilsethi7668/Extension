/**
 * Debug script to test image scraping for a specific vehicle
 * Run with: node testImageScrape.js
 */

import puppeteer from 'puppeteer';

const TEST_URL = 'https://www.brownboysauto.com/cars/used/2020-landrover-rangeroverevoque-513185';

async function testScrape() {
    console.log('\n========================================');
    console.log('🔍 DEBUG: Testing Image Scrape');
    console.log('📍 URL:', TEST_URL);
    console.log('========================================\n');

    const browser = await puppeteer.launch({
        headless: true,
        executablePath: '/usr/bin/chromium',
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu'
        ]
    });

    try {
        const page = await browser.newPage();
        await page.setViewport({ width: 1280, height: 1024 });

        console.log('📡 Navigating to page...');
        await page.goto(TEST_URL, { waitUntil: 'networkidle2', timeout: 60000 });
        console.log('✅ Page loaded\n');

        // Wait for gallery to load
        console.log('⏳ Waiting for gallery...');
        try {
            await page.waitForSelector('.image-gallery-thumbnail-image', { timeout: 15000 });
            console.log('✅ Gallery found\n');
        } catch (e) {
            console.log('❌ Gallery selector timeout\n');
        }

        // Extract ALL images with their context
        const allImages = await page.evaluate(() => {
            const results = [];

            // Get ALL images on the page
            const allImgs = document.querySelectorAll('img');
            allImgs.forEach((img, idx) => {
                results.push({
                    index: idx,
                    src: img.src,
                    className: img.className,
                    parentClass: img.parentElement?.className || 'none',
                    grandparentClass: img.parentElement?.parentElement?.className || 'none',
                    alt: img.alt || 'none',
                    isInGallery: img.closest('.image-gallery') !== null,
                    isInHeader: img.closest('header') !== null || img.closest('.header_background_style_1') !== null,
                    isLogo: img.className.includes('logo') || img.closest('a[href="/"]') !== null
                });
            });

            return results;
        });

        console.log('📊 ALL IMAGES ON PAGE:');
        console.log('======================');
        allImages.forEach(img => {
            const type = img.isLogo ? '🔴 LOGO' : img.isInGallery ? '🟢 GALLERY' : '⚪ OTHER';
            console.log(`\n${type} [${img.index}]`);
            console.log(`  src: ${img.src}`);
            console.log(`  class: ${img.className}`);
            console.log(`  parentClass: ${img.parentClass}`);
            console.log(`  isInGallery: ${img.isInGallery}`);
            console.log(`  isLogo: ${img.isLogo}`);
        });

        // Now extract ONLY gallery images using the exact selectors
        console.log('\n\n📸 GALLERY IMAGES ONLY (using selectors):');
        console.log('==========================================');

        const galleryImages = await page.evaluate(() => {
            // Method 1: .image-gallery-thumbnail-image
            const thumbnails = Array.from(document.querySelectorAll('.image-gallery-thumbnail-image'));

            // Method 2: .image-gallery-image (main slides)
            const mainSlides = Array.from(document.querySelectorAll('.image-gallery-image'));

            // Method 3: Images inside .image-gallery-thumbnails-container
            const containerImages = Array.from(document.querySelectorAll('.image-gallery-thumbnails-container img'));

            return {
                thumbnails: thumbnails.map(img => img.src),
                mainSlides: mainSlides.map(img => img.src),
                containerImages: containerImages.map(img => img.src)
            };
        });

        console.log('\n🔹 .image-gallery-thumbnail-image:', galleryImages.thumbnails.length);
        galleryImages.thumbnails.forEach((url, i) => console.log(`  [${i}] ${url}`));

        console.log('\n🔹 .image-gallery-image:', galleryImages.mainSlides.length);
        galleryImages.mainSlides.forEach((url, i) => console.log(`  [${i}] ${url}`));

        console.log('\n🔹 .image-gallery-thumbnails-container img:', galleryImages.containerImages.length);
        galleryImages.containerImages.forEach((url, i) => console.log(`  [${i}] ${url}`));

        // Test the upgrade logic
        console.log('\n\n🔄 UPGRADED URLs (thumb- removed):');
        console.log('===================================');
        const upgraded = galleryImages.thumbnails.map(url => url.replace('/thumb-', '/'));
        upgraded.forEach((url, i) => console.log(`  [${i}] ${url}`));

        console.log('\n\n✅ DEBUG COMPLETE');

    } catch (error) {
        console.error('❌ Error:', error.message);
    } finally {
        await browser.close();
    }
}

testScrape();
