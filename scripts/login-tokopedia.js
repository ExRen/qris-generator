/**
 * Tokopedia Login Script
 * 
 * Jalankan script ini untuk login ke Tokopedia dan save cookies:
 * node scripts/login-tokopedia.js
 * 
 * Setelah login berhasil, cookies akan tersimpan dan bisa digunakan
 * untuk generate QRIS tanpa perlu login ulang.
 */

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const COOKIES_PATH = path.join(__dirname, '..', 'tokopedia-cookies.json');

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

async function main() {
  console.log('='.repeat(50));
  console.log('  TOKOPEDIA LOGIN SCRIPT');
  console.log('='.repeat(50));
  console.log('\nScript ini akan membuka browser untuk login ke Tokopedia.');
  console.log('Setelah login berhasil, cookies akan disimpan untuk sesi berikutnya.\n');

  // Launch browser in visible mode with more stealth options
  const browser = await puppeteer.launch({
    headless: false,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
      '--disable-infobars',
      '--window-size=1280,800',
      '--start-maximized',
      '--disable-extensions',
      '--disable-plugins-discovery',
      '--disable-dev-shm-usage',
    ],
    ignoreDefaultArgs: ['--enable-automation'],
    defaultViewport: null, // Use full window size
  });

  const page = await browser.newPage();

  // Override navigator.webdriver
  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, 'webdriver', {
      get: () => undefined,
    });
    // Override chrome
    window.chrome = {
      runtime: {},
    };
    // Override permissions
    const originalQuery = window.navigator.permissions.query;
    window.navigator.permissions.query = (parameters) =>
      parameters.name === 'notifications'
        ? Promise.resolve({ state: Notification.permission })
        : originalQuery(parameters);
  });

  // Set realistic user agent
  await page.setUserAgent(
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  );

  // Set extra headers
  await page.setExtraHTTPHeaders({
    'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
  });

  console.log('Navigating to Tokopedia...\n');

  // Try multiple URLs if one fails
  const urls = [
    'https://www.tokopedia.com/',
    'https://tokopedia.com/',
    'https://www.tokopedia.com/login',
  ];

  let success = false;
  for (const url of urls) {
    try {
      console.log(`Trying: ${url}`);
      await page.goto(url, {
        waitUntil: 'domcontentloaded',
        timeout: 30000,
      });
      success = true;
      console.log('✓ Page loaded successfully!\n');
      break;
    } catch (error) {
      console.log(`✗ Failed: ${error.message}\n`);
      await new Promise(r => setTimeout(r, 2000)); // Wait before retry
    }
  }

  if (!success) {
    console.log('\n❌ Tidak dapat mengakses Tokopedia.');
    console.log('\nKemungkinan penyebab:');
    console.log('  1. Koneksi internet bermasalah');
    console.log('  2. Tokopedia memblokir akses');
    console.log('  3. VPN/Proxy yang digunakan');
    console.log('\nSolusi:');
    console.log('  1. Coba nonaktifkan VPN jika ada');
    console.log('  2. Coba gunakan koneksi internet lain');
    console.log('  3. Coba akses https://tokopedia.com manual di browser biasa');
    console.log('\nAtau, Anda bisa login manual dan upload cookies:');
    console.log('  1. Buka Chrome, login ke Tokopedia');
    console.log('  2. Buka DevTools (F12) > Application > Cookies');
    console.log('  3. Export cookies ke file tokopedia-cookies.json');
    
    await browser.close();
    process.exit(1);
  }

  console.log('Browser terbuka!');
  console.log('\n' + '='.repeat(50));
  console.log('  INSTRUKSI:');
  console.log('  1. Navigate ke halaman Login jika belum');
  console.log('  2. Login ke akun Tokopedia Anda');
  console.log('  3. Pastikan sudah masuk ke halaman utama');
  console.log('  4. Kembali ke terminal ini');
  console.log('  5. Tekan ENTER untuk menyimpan cookies');
  console.log('='.repeat(50) + '\n');

  await waitForUserInput('Tekan ENTER setelah login berhasil...');

  // Navigate around to get more cookies
  console.log('\nCollecting cookies...');
  try {
    await page.goto('https://www.tokopedia.com/user/settings', { 
      waitUntil: 'domcontentloaded', 
      timeout: 15000 
    });
  } catch {
    // Ignore navigation errors
  }

  // Get cookies
  const cookies = await page.cookies();
  
  if (cookies.length === 0) {
    console.log('\n❌ Tidak ada cookies yang ditemukan!');
    console.log('Pastikan Anda sudah login dengan benar.');
  } else {
    // Save cookies
    fs.writeFileSync(COOKIES_PATH, JSON.stringify(cookies, null, 2));
    
    console.log('\n✅ Cookies berhasil disimpan!');
    console.log(`   Total cookies: ${cookies.length}`);
    console.log(`   File: ${COOKIES_PATH}`);
    console.log('\nAnda sekarang bisa generate QRIS dari admin panel.');
    
    // Show some cookie info
    const importantCookies = cookies.filter(c => 
      c.name.includes('_SID') || 
      c.name.includes('token') || 
      c.name.includes('sess')
    );
    if (importantCookies.length > 0) {
      console.log(`\nSession cookies found: ${importantCookies.length}`);
    }
  }

  console.log('\nMenutup browser dalam 3 detik...');
  await new Promise(r => setTimeout(r, 3000));
  await browser.close();
  console.log('Selesai!');
  process.exit(0);
}

main().catch((error) => {
  console.error('\n❌ Error:', error.message);
  process.exit(1);
});
