/**
 * Debug script to see what the scraper sees on Tokopedia order-list page
 * Run: node scripts/debug-orders.js
 */

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const COOKIES_PATH = path.join(__dirname, '..', 'tokopedia-cookies.json');

async function main() {
    console.log('='.repeat(50));
    console.log('  DEBUG: Tokopedia Order List Scraper');
    console.log('='.repeat(50));

    // Load cookies
    let cookies = [];
    try {
        const cookiesData = fs.readFileSync(COOKIES_PATH, 'utf-8');
        cookies = JSON.parse(cookiesData);
        console.log(`✓ Loaded ${cookies.length} cookies`);
    } catch (e) {
        console.error('✗ Failed to load cookies:', e.message);
        return;
    }

    const browser = await puppeteer.launch({
        headless: false, // VISIBLE for debug
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--window-size=1280,800',
        ],
        defaultViewport: null,
    });

    const page = await browser.newPage();
    
    await page.setUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );
    
    await page.setCookie(...cookies);

    console.log('\n📂 Navigating to payment-list (menunggu pembayaran)...');
    await page.goto('https://www.tokopedia.com/payment/payment-list?nref=pcside', {
        waitUntil: 'networkidle2',
        timeout: 60000,
    });

    // Wait for page
    console.log('⏳ Waiting for page to load...');
    await new Promise(r => setTimeout(r, 5000));

    // Check URL
    console.log(`\n🔗 Current URL: ${page.url()}`);
    
    // Check if login required
    if (page.url().includes('login')) {
        console.log('❌ REDIRECTED TO LOGIN - Cookies may have expired!');
        console.log('   Please run: npm run login');
    } else {
        console.log('✓ Not redirected to login');
    }

    // Take screenshot
    const screenshotPath = path.join(__dirname, '..', 'debug-orders.png');
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log(`\n📸 Screenshot saved to: ${screenshotPath}`);

    // Get page text
    const pageText = await page.evaluate(() => document.body.innerText);
    console.log('\n📄 Page text preview (first 2000 chars):');
    console.log('-'.repeat(50));
    console.log(pageText.substring(0, 2000));
    console.log('-'.repeat(50));

    // Try to find orders
    console.log('\n🔍 Looking for order elements...');
    
    const orderInfo = await page.evaluate(() => {
        const results = [];
        
        // Get all elements with class containing 'order'
        const allElements = document.querySelectorAll('[class*="order"], [class*="Order"], [data-testid*="order"]');
        
        for (const el of allElements) {
            const text = el.textContent || '';
            if (text.includes('INV/') || text.includes('Rp')) {
                results.push({
                    tag: el.tagName,
                    class: el.className,
                    textPreview: text.substring(0, 200),
                });
            }
        }
        
        // Also check for INV patterns in page
        const invMatches = document.body.innerText.match(/INV\/[A-Z0-9\/]+/gi);
        const amountMatches = document.body.innerText.match(/Rp\s*[\d.,]+/gi);
        
        return {
            elementCount: allElements.length,
            orderElements: results.slice(0, 5),
            invoicesFound: invMatches || [],
            amountsFound: amountMatches || [],
        };
    });

    console.log(`   Found ${orderInfo.elementCount} elements with "order" class`);
    console.log(`   Invoices in page: ${orderInfo.invoicesFound.join(', ') || 'None'}`);
    console.log(`   Amounts in page: ${orderInfo.amountsFound.slice(0, 10).join(', ') || 'None'}`);

    if (orderInfo.orderElements.length > 0) {
        console.log('\n   Sample order elements:');
        orderInfo.orderElements.forEach((el, i) => {
            console.log(`   ${i + 1}. <${el.tag}> class="${el.class.substring(0, 50)}..."`);
            console.log(`      Text: ${el.textPreview}...`);
        });
    }

    // Keep browser open for inspection
    console.log('\n👁️  Browser is open for manual inspection.');
    console.log('   Press Ctrl+C to close.');
    
    // Wait for user to inspect
    await new Promise(r => setTimeout(r, 300000)); // 5 minutes

    await browser.close();
}

main().catch(console.error);
