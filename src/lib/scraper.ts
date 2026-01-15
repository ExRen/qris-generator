import path from 'path';
import fs from 'fs/promises';
import { ScrapedProduct, ScrapedQris } from '@/types';
import prisma from './prisma';

// Random delay between min and max seconds
const randomDelay = (min: number, max: number): Promise<void> => {
    const delay = Math.floor(Math.random() * (max - min + 1) + min) * 1000;
    return new Promise(resolve => setTimeout(resolve, delay));
};

// User agents pool
const USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
];

const getRandomUserAgent = (): string => {
    return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
};

// QRIS images storage path
const QRIS_STORAGE_PATH = path.join(process.cwd(), 'public', 'qris');

// Ensure QRIS storage directory exists
const ensureQrisStorageExists = async (): Promise<void> => {
    try {
        await fs.access(QRIS_STORAGE_PATH);
    } catch {
        await fs.mkdir(QRIS_STORAGE_PATH, { recursive: true });
    }
};

// Dynamic import types
type Browser = Awaited<ReturnType<typeof import('puppeteer')['launch']>>;
type Page = Awaited<ReturnType<Browser['newPage']>>;

export class TokopediaScraper {
    private browser: Browser | null = null;
    private page: Page | null = null;
    private userAgent: string;

    constructor() {
        this.userAgent = getRandomUserAgent();
    }

    async initialize(): Promise<void> {
        await ensureQrisStorageExists();

        // Use native puppeteer (puppeteer-extra has compatibility issues with v24)
        const puppeteer = await import('puppeteer');

        this.browser = await puppeteer.default.launch({
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--disable-gpu',
                '--disable-blink-features=AutomationControlled',
                '--disable-infobars',
            ],
            ignoreDefaultArgs: ['--enable-automation'],
        });

        this.page = await this.browser.newPage();

        // === MOBILE EMULATION ===
        // Emulate iPhone 14 Pro to enable QRIS payment option
        const mobileUserAgent = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

        await this.page.setUserAgent(mobileUserAgent);
        await this.page.setViewport({
            width: 393,
            height: 852,
            deviceScaleFactor: 3,
            isMobile: true,
            hasTouch: true,
        });

        // Manual stealth settings for mobile
        await this.page.evaluateOnNewDocument(() => {
            // Override webdriver
            Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
            // Override platform to iPhone
            Object.defineProperty(navigator, 'platform', { get: () => 'iPhone' });
            // Override maxTouchPoints
            Object.defineProperty(navigator, 'maxTouchPoints', { get: () => 5 });
            // Override chrome (remove it for mobile Safari)
            delete (window as unknown as { chrome?: unknown }).chrome;
        });

        // Set extra headers for mobile
        await this.page.setExtraHTTPHeaders({
            'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
        });

        // Load saved cookies if available
        await this.loadCookies();

        console.log('Browser initialized with mobile emulation (iPhone 14 Pro)');
    }

    private async loadCookies(): Promise<boolean> {
        // First try to load from file (from login script)
        const cookiesFilePath = path.join(process.cwd(), 'tokopedia-cookies.json');

        try {
            const cookiesData = await fs.readFile(cookiesFilePath, 'utf-8');
            const cookies = JSON.parse(cookiesData);

            if (cookies && Array.isArray(cookies) && cookies.length > 0 && this.page) {
                await this.page.setCookie(...cookies);
                console.log(`Loaded ${cookies.length} cookies from file`);
                return true;
            }
        } catch {
            console.log('No cookies file found, trying database...');
        }

        // Fallback to database
        try {
            const session = await prisma.tokopediaSession.findFirst({
                where: { isValid: true },
                orderBy: { lastUsedAt: 'desc' },
            });

            if (session && this.page) {
                const cookies = JSON.parse(session.cookies);
                await this.page.setCookie(...cookies);
                console.log('Loaded existing Tokopedia session from database');
                return true;
            }
        } catch (error) {
            console.error('Failed to load cookies from database:', error);
        }

        console.log('No valid cookies found. Please run: npm run login');
        return false;
    }

    async saveCookies(): Promise<void> {
        if (!this.page) return;

        try {
            const cookies = await this.page.cookies();
            const cookiesJson = JSON.stringify(cookies);

            // Update or create session
            await prisma.tokopediaSession.upsert({
                where: { id: 'main-session' },
                update: {
                    cookies: cookiesJson,
                    userAgent: this.userAgent,
                    lastUsedAt: new Date(),
                },
                create: {
                    id: 'main-session',
                    cookies: cookiesJson,
                    userAgent: this.userAgent,
                },
            });
        } catch (error) {
            console.error('Failed to save cookies:', error);
        }
    }

    async scrapeProductInfo(productUrl: string): Promise<ScrapedProduct> {
        if (!this.page) throw new Error('Browser not initialized');

        console.log(`Scraping product info from: ${productUrl}`);

        await this.page.goto(productUrl, { waitUntil: 'networkidle2', timeout: 60000 });
        await randomDelay(2, 4);

        // Extract product information
        const productInfo = await this.page.evaluate(() => {
            // Product name - multiple possible selectors
            const nameSelectors = [
                'h1[data-testid="lblPDPDetailProductName"]',
                'h1.css-1os9jjn',
                '[data-testid="pdpProductName"]',
                'h1',
            ];

            let name = '';
            for (const selector of nameSelectors) {
                const el = document.querySelector(selector);
                if (el?.textContent) {
                    name = el.textContent.trim();
                    break;
                }
            }

            // Price - multiple possible selectors
            const priceSelectors = [
                '[data-testid="lblPDPDetailProductPrice"]',
                '.price',
                '[class*="price"]',
                'div[data-testid="pdpProductPrice"]',
            ];

            let priceText = '';
            for (const selector of priceSelectors) {
                const el = document.querySelector(selector);
                if (el?.textContent) {
                    priceText = el.textContent.trim();
                    break;
                }
            }

            // Parse price (remove Rp. and dots)
            const price = parseInt(priceText.replace(/[^\d]/g, '')) || 0;

            // Product image
            const imageSelectors = [
                'img[data-testid="PDPMainImage"]',
                '.css-1c345mg img',
                '[data-testid="PDPImageMain"] img',
                'img[alt*="product"]',
            ];

            let imageUrl = '';
            for (const selector of imageSelectors) {
                const el = document.querySelector(selector) as HTMLImageElement;
                if (el?.src) {
                    imageUrl = el.src;
                    break;
                }
            }

            return { name, price, imageUrl };
        });

        if (!productInfo.name) {
            throw new Error('Failed to extract product name');
        }

        return {
            name: productInfo.name,
            price: productInfo.price,
            imageUrl: productInfo.imageUrl || null,
        };
    }

    async proceedToCheckout(): Promise<void> {
        if (!this.page) throw new Error('Browser not initialized');

        console.log('Proceeding to checkout...');

        // Click "Beli Langsung" button
        const buyButtonSelectors = [
            'button[data-testid="pdpBtnBuyNow"]',
            'button:has-text("Beli Langsung")',
            '[data-testid="btnBuyNow"]',
            'button.buy-button',
        ];

        for (const selector of buyButtonSelectors) {
            try {
                await this.page.waitForSelector(selector, { timeout: 5000 });
                await this.page.click(selector);
                console.log(`Clicked buy button with selector: ${selector}`);
                break;
            } catch {
                continue;
            }
        }

        await randomDelay(3, 5);

        // Wait for checkout page to load
        await this.page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }).catch(() => { });
        await randomDelay(2, 4);
    }

    async selectQrisPayment(): Promise<ScrapedQris> {
        if (!this.page) throw new Error('Browser not initialized');

        console.log('Selecting QRIS payment method...');

        // Wait for payment methods to load
        await randomDelay(2, 4);

        // Look for QRIS option
        const qrisSelectors = [
            'div:has-text("QRIS")',
            '[data-testid="paymentQRIS"]',
            'label:has-text("QRIS")',
            'input[value="qris"]',
        ];

        for (const selector of qrisSelectors) {
            try {
                await this.page.waitForSelector(selector, { timeout: 5000 });
                await this.page.click(selector);
                console.log(`Selected QRIS with selector: ${selector}`);
                break;
            } catch {
                continue;
            }
        }

        await randomDelay(3, 5);

        // Look for confirm/proceed button
        const confirmSelectors = [
            'button[data-testid="btnConfirmPayment"]',
            'button:has-text("Bayar")',
            'button:has-text("Lanjut")',
            'button.payment-confirm',
        ];

        for (const selector of confirmSelectors) {
            try {
                await this.page.waitForSelector(selector, { timeout: 5000 });
                await this.page.click(selector);
                console.log(`Clicked confirm with selector: ${selector}`);
                break;
            } catch {
                continue;
            }
        }

        await randomDelay(4, 6);

        // Capture QRIS image
        const qrisImageData = await this.captureQrisImage();

        // Extract order info
        const orderInfo = await this.extractOrderInfo();

        return {
            qrisImage: qrisImageData.imagePath,
            orderId: orderInfo.orderId,
            amount: orderInfo.amount,
            expiresAt: orderInfo.expiresAt,
        };
    }

    private async captureQrisImage(): Promise<{ imagePath: string }> {
        if (!this.page) throw new Error('Browser not initialized');

        console.log('Capturing QRIS image...');

        // Wait for QRIS to appear
        const qrisImageSelectors = [
            'img[alt*="QRIS"]',
            'img[alt*="QR"]',
            '[data-testid="qrisImage"]',
            '.qris-image img',
            'canvas', // Some sites render QR as canvas
        ];

        let qrisElement = null;
        for (const selector of qrisImageSelectors) {
            try {
                qrisElement = await this.page.waitForSelector(selector, { timeout: 10000 });
                if (qrisElement) {
                    console.log(`Found QRIS with selector: ${selector}`);
                    break;
                }
            } catch {
                continue;
            }
        }

        if (!qrisElement) {
            // Take full screenshot as fallback
            console.log('QRIS element not found, taking full screenshot');
        }

        // Generate unique filename
        const filename = `qris_${Date.now()}.png`;
        const imagePath = path.join(QRIS_STORAGE_PATH, filename);

        if (qrisElement) {
            await qrisElement.screenshot({ path: imagePath });
        } else {
            await this.page.screenshot({ path: imagePath, fullPage: false });
        }

        console.log(`QRIS image saved to: ${imagePath}`);

        return { imagePath: `/qris/${filename}` };
    }

    private async extractOrderInfo(): Promise<{ orderId: string; amount: number; expiresAt: Date }> {
        if (!this.page) throw new Error('Browser not initialized');

        const orderInfo = await this.page.evaluate(() => {
            // Try to find order ID using valid CSS selectors
            const orderIdSelectors = [
                '[data-testid="orderId"]',
                '.order-id',
                '[class*="invoice"]',
                '[class*="order"]',
            ];

            let orderId = '';
            for (const selector of orderIdSelectors) {
                try {
                    const el = document.querySelector(selector);
                    if (el?.textContent) {
                        orderId = el.textContent.trim();
                        break;
                    }
                } catch {
                    continue;
                }
            }

            // Also try to find INV text in spans
            if (!orderId) {
                const spans = document.querySelectorAll('span');
                for (const span of spans) {
                    if (span.textContent?.includes('INV')) {
                        orderId = span.textContent.trim();
                        break;
                    }
                }
            }

            // Try to find amount
            const amountSelectors = [
                '[data-testid="totalAmount"]',
                '.total-amount',
                '[class*="total"]',
                '[class*="price"]',
            ];

            let amountText = '';
            for (const selector of amountSelectors) {
                try {
                    const el = document.querySelector(selector);
                    if (el?.textContent) {
                        amountText = el.textContent.trim();
                        break;
                    }
                } catch {
                    continue;
                }
            }

            const amount = parseInt(amountText.replace(/[^\d]/g, '')) || 0;

            // Try to find expiry time
            const expirySelectors = [
                '[data-testid="expiryTime"]',
                '.expiry-time',
                '[class*="expir"]',
                '[class*="countdown"]',
            ];

            let expiryText = '';
            for (const selector of expirySelectors) {
                try {
                    const el = document.querySelector(selector);
                    if (el?.textContent) {
                        expiryText = el.textContent.trim();
                        break;
                    }
                } catch {
                    continue;
                }
            }

            return { orderId, amount, expiryText };
        });

        // Calculate expiry time (default 15 minutes if not found)
        const expiresAt = new Date();
        expiresAt.setMinutes(expiresAt.getMinutes() + 15);

        return {
            orderId: orderInfo.orderId || `ORD-${Date.now()}`,
            amount: orderInfo.amount,
            expiresAt,
        };
    }

    async checkPaymentStatus(orderId: string): Promise<'pending' | 'paid' | 'expired'> {
        if (!this.page) throw new Error('Browser not initialized');

        console.log(`Checking payment status for order: ${orderId}`);

        try {
            // Navigate to order history/status page
            await this.page.goto('https://www.tokopedia.com/order-list', {
                waitUntil: 'networkidle2',
                timeout: 30000
            });

            await randomDelay(2, 4);

            // Look for the order
            const status = await this.page.evaluate((targetOrderId) => {
                // Find order with matching ID
                const orderElements = document.querySelectorAll('[data-testid="orderItem"]');

                for (const el of orderElements) {
                    const orderIdEl = el.querySelector('[data-testid="orderId"]');
                    if (orderIdEl?.textContent?.includes(targetOrderId)) {
                        // Check status
                        const statusEl = el.querySelector('[data-testid="orderStatus"]');
                        const statusText = statusEl?.textContent?.toLowerCase() || '';

                        if (statusText.includes('dibayar') || statusText.includes('diproses') || statusText.includes('paid')) {
                            return 'paid';
                        } else if (statusText.includes('kadaluarsa') || statusText.includes('expired') || statusText.includes('batal')) {
                            return 'expired';
                        }
                    }
                }

                return 'pending';
            }, orderId);

            return status;
        } catch (error) {
            console.error('Error checking payment status:', error);
            return 'pending';
        }
    }

    async close(): Promise<void> {
        if (this.browser) {
            await this.browser.close();
            this.browser = null;
            this.page = null;
        }
    }
}

// Singleton instance
let scraperInstance: TokopediaScraper | null = null;

export const getScraper = async (): Promise<TokopediaScraper> => {
    if (!scraperInstance) {
        scraperInstance = new TokopediaScraper();
        await scraperInstance.initialize();
    }
    return scraperInstance;
};

export const closeScraper = async (): Promise<void> => {
    if (scraperInstance) {
        await scraperInstance.close();
        scraperInstance = null;
    }
};
