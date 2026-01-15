/**
 * Tokopedia QRIS Debug Script
 * 
 * Jalankan script ini untuk debug proses generate QRIS:
 * node scripts/debug-qris.js <PRODUCT_URL>
 * 
 * Script akan menjalankan browser dalam mode visible sehingga
 * bisa melihat apa yang terjadi saat scraping.
 */

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const COOKIES_PATH = path.join(__dirname, '..', 'tokopedia-cookies.json');
const SCREENSHOTS_PATH = path.join(__dirname, '..', 'debug-screenshots');

// Ensure screenshots directory exists
if (!fs.existsSync(SCREENSHOTS_PATH)) {
  fs.mkdirSync(SCREENSHOTS_PATH, { recursive: true });
}

async function waitForUserInput(prompt) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

async function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  const productUrl = process.argv[2];
  
  if (!productUrl) {
    console.log('Usage: node scripts/debug-qris.js <PRODUCT_URL>');
    console.log('Example: node scripts/debug-qris.js https://www.tokopedia.com/shop/product');
    process.exit(1);
  }

  console.log('='.repeat(50));
  console.log('  TOKOPEDIA QRIS DEBUG SCRIPT');
  console.log('='.repeat(50));
  console.log('\nProduct URL:', productUrl);
  console.log('\nScript akan menjalankan browser dalam mode VISIBLE');
  console.log('untuk melihat proses scraping QRIS.\n');

  // Launch browser in VISIBLE mode with mobile emulation
  const browser = await puppeteer.launch({
    headless: false, // VISIBLE untuk debug
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
      '--disable-infobars',
      '--window-size=430,932',
    ],
    ignoreDefaultArgs: ['--enable-automation'],
    defaultViewport: null,
  });

  const page = await browser.newPage();

  // Mobile emulation - iPhone 14 Pro
  const mobileUserAgent = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
  
  await page.setUserAgent(mobileUserAgent);
  await page.setViewport({
    width: 393,
    height: 852,
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });

  // Mobile stealth settings
  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    Object.defineProperty(navigator, 'platform', { get: () => 'iPhone' });
    Object.defineProperty(navigator, 'maxTouchPoints', { get: () => 5 });
    delete window.chrome;
  });

  // Load cookies
  console.log('Loading cookies...');
  try {
    const cookiesData = fs.readFileSync(COOKIES_PATH, 'utf-8');
    const cookies = JSON.parse(cookiesData);
    await page.setCookie(...cookies);
    console.log(`✓ Loaded ${cookies.length} cookies\n`);
  } catch (error) {
    console.log('✗ No cookies found. Please run npm run login first.\n');
    await browser.close();
    process.exit(1);
  }

  // Step 1: Navigate to product page
  console.log('STEP 1: Navigating to product page...');
  try {
    await page.goto(productUrl, { waitUntil: 'networkidle2', timeout: 60000 });
    await delay(3000);
    await page.screenshot({ path: path.join(SCREENSHOTS_PATH, '01-product-page.png') });
    console.log('✓ Product page loaded\n');
  } catch (error) {
    console.log('✗ Failed to load product page:', error.message);
    await browser.close();
    process.exit(1);
  }

  // Extract product info
  const productInfo = await page.evaluate(() => {
    const h1 = document.querySelector('h1');
    return {
      name: h1?.textContent?.trim() || 'Unknown Product',
      url: window.location.href,
    };
  });
  console.log('Product:', productInfo.name);
  console.log('URL:', productInfo.url, '\n');

  await waitForUserInput('Tekan ENTER untuk lanjut ke Step 2 (Beli)...');

  // Step 2: Click "Beli" button
  console.log('\nSTEP 2: Looking for Buy button...');
  
  const buySelectors = [
    'button[data-testid="pdpBtnBuyNow"]',
    '[data-testid="btnBuyNow"]',
    'button[class*="buy"]',
    'button[class*="beli"]',
  ];

  let buyClicked = false;
  for (const selector of buySelectors) {
    try {
      const element = await page.$(selector);
      if (element) {
        console.log(`Found button: ${selector}`);
        await element.click();
        buyClicked = true;
        break;
      }
    } catch {
      continue;
    }
  }

  if (!buyClicked) {
    console.log('Buy button not found with standard selectors.');
    console.log('Looking by text content...');
    
    // Try finding by text
    const buttons = await page.$$('button');
    for (const button of buttons) {
      const text = await page.evaluate(el => el.textContent, button);
      if (text && (text.toLowerCase().includes('beli') || text.toLowerCase().includes('buy'))) {
        console.log(`Found button with text: "${text.trim()}"`);
        await button.click();
        buyClicked = true;
        break;
      }
    }
  }

  if (buyClicked) {
    console.log('✓ Buy button clicked\n');
    await delay(5000);
    await page.screenshot({ path: path.join(SCREENSHOTS_PATH, '02-after-buy-click.png') });
  } else {
    console.log('✗ Could not find Buy button');
    await page.screenshot({ path: path.join(SCREENSHOTS_PATH, '02-no-buy-button.png') });
  }

  await waitForUserInput('Tekan ENTER untuk lanjut ke Step 3 (Checkout/Payment)...');

  // Step 3: Look for checkout/payment
  console.log('\nSTEP 3: Looking at current page...');
  
  const currentUrl = page.url();
  console.log('Current URL:', currentUrl);
  
  await page.screenshot({ path: path.join(SCREENSHOTS_PATH, '03-current-state.png') });

  // Check if we need to navigate to checkout
  if (!currentUrl.includes('checkout')) {
    console.log('Not on checkout page. Looking for checkout elements...');
    
    // Try to find checkout/payment elements
    const checkoutSelectors = [
      '[data-testid="btnCheckout"]',
      'button[class*="checkout"]',
      'a[href*="checkout"]',
    ];

    for (const selector of checkoutSelectors) {
      try {
        const element = await page.$(selector);
        if (element) {
          console.log(`Found checkout element: ${selector}`);
          await element.click();
          await delay(5000);
          await page.screenshot({ path: path.join(SCREENSHOTS_PATH, '04-after-checkout-click.png') });
          break;
        }
      } catch {
        continue;
      }
    }
  }

  await waitForUserInput('Tekan ENTER untuk lanjut ke Step 4 (Pilih QRIS)...');

  // Step 4: Look for QRIS payment option
  console.log('\nSTEP 4: Looking for QRIS payment option...');
  
  await page.screenshot({ path: path.join(SCREENSHOTS_PATH, '05-payment-page.png') });

  // Look for payment method section
  const qrisSelectors = [
    'div[class*="qris"]',
    'div[class*="QRIS"]',
    'label[class*="qris"]',
    'input[value*="qris"]',
    '[data-testid*="qris"]',
    '[data-testid*="QRIS"]',
  ];

  let qrisFound = false;
  for (const selector of qrisSelectors) {
    try {
      const element = await page.$(selector);
      if (element) {
        console.log(`Found QRIS element: ${selector}`);
        await element.click();
        qrisFound = true;
        await delay(3000);
        await page.screenshot({ path: path.join(SCREENSHOTS_PATH, '06-qris-selected.png') });
        break;
      }
    } catch {
      continue;
    }
  }

  if (!qrisFound) {
    console.log('QRIS not found with CSS selectors.');
    console.log('Looking by text content...');
    
    // Try finding by text
    const elements = await page.$$('div, span, label, button');
    for (const el of elements) {
      const text = await page.evaluate(e => e.textContent, el);
      if (text && text.includes('QRIS')) {
        console.log(`Found element with QRIS text`);
        try {
          await el.click();
          qrisFound = true;
          await delay(3000);
          await page.screenshot({ path: path.join(SCREENSHOTS_PATH, '06-qris-selected.png') });
        } catch {
          console.log('Could not click QRIS element');
        }
        break;
      }
    }
  }

  console.log('\n' + '='.repeat(50));
  console.log('  DEBUG COMPLETE');
  console.log('='.repeat(50));
  console.log('\nScreenshots saved to:', SCREENSHOTS_PATH);
  console.log('\nCheck the screenshots to see what happened at each step.');
  console.log('The browser is still open for manual inspection.\n');

  await waitForUserInput('Tekan ENTER untuk menutup browser...');
  
  await browser.close();
  console.log('Browser closed.');
  process.exit(0);
}

main().catch((error) => {
  console.error('\n❌ Error:', error.message);
  process.exit(1);
});
