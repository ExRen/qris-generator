import path from 'path';
import fs from 'fs/promises';
import prisma from '@/lib/prisma';
import { logAction } from '@/lib/logger';

const COOKIES_PATH = path.join(process.cwd(), 'tokopedia-cookies.json');

// URLs for different order states
const PAYMENT_LIST_URL = 'https://www.tokopedia.com/payment/payment-list?nref=pcside';
const ORDER_LIST_URL = 'https://www.tokopedia.com/order-list';

// Timeout and retry configuration
const PAGE_TIMEOUT = 60000; // 60 seconds (increased from 30s)
const MAX_RETRIES = 2; // Retry up to 2 times on failure
const RETRY_DELAY = 3000; // Wait 3 seconds between retries
const CHECK_DELAY = 5000; // Wait 5 seconds between sequential checks

// Mutex to prevent concurrent browser sessions
let browserLock = false;
const waitForLock = async (maxWait = 120000): Promise<boolean> => {
    const start = Date.now();
    while (browserLock) {
        if (Date.now() - start > maxWait) {
            console.log('Timeout waiting for browser lock');
            return false;
        }
        await new Promise(r => setTimeout(r, 1000));
    }
    browserLock = true;
    return true;
};
const releaseLock = () => { browserLock = false; };

interface PendingOrder {
    orderId: string;
    amount: number;
    productName: string;
    seller: string;
    deadline: Date | null; // Payment deadline from "Bayar sebelum"
}

interface ProcessedOrder {
    amount: number;
    productName: string;
    status: string;
}

/**
 * Create browser page with cookies
 */
async function createPage() {
    const puppeteer = await import('puppeteer');

    let cookies: { name: string; value: string; domain?: string }[] = [];
    try {
        const cookiesData = await fs.readFile(COOKIES_PATH, 'utf-8');
        cookies = JSON.parse(cookiesData);
    } catch {
        console.log('No cookies found');
        return null;
    }

    if (cookies.length === 0) {
        console.log('Empty cookies');
        return null;
    }

    const browser = await puppeteer.default.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    });

    const page = await browser.newPage();

    await page.setUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );

    await page.setCookie(...cookies);

    return { browser, page };
}

/**
 * Internal: Get all pending (unpaid) orders from Tokopedia payment-list page
 * Also extracts payment deadline ("Bayar sebelum")
 */
async function getPendingOrdersInternal(): Promise<PendingOrder[]> {
    const session = await createPage();
    if (!session) return [];

    const { browser, page } = session;

    try {
        console.log('Fetching pending orders from payment-list...');
        await page.goto(PAYMENT_LIST_URL, {
            waitUntil: 'networkidle2',
            timeout: PAGE_TIMEOUT,
        });

        await new Promise(r => setTimeout(r, 3000));

        if (page.url().includes('login')) {
            console.log('Not logged in');
            await browser.close();
            return [];
        }

        const orders = await page.evaluate(() => {
            const results: { amount: number; deadlineStr: string | null }[] = [];
            const pageText = document.body.innerText;
            const lines = pageText.split('\n');

            // Look for "Bayar sebelum" pattern with date/time
            // Format: "Bayar sebelum 15 Jan, 10:50" or similar
            const deadlinePattern = /Bayar sebelum[^\d]*(\d+)\s+(\w+),?\s*(\d+:\d+)/gi;
            let deadlineMatch;
            const deadlines: string[] = [];

            while ((deadlineMatch = deadlinePattern.exec(pageText)) !== null) {
                const [, day, month, time] = deadlineMatch;
                deadlines.push(`${day} ${month} ${time}`);
            }

            // Method 1: Look for "Total Pembayaran" specifically (in payment-list page)
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i].trim();

                // Skip sidebar items
                if (line.includes('Saldo') ||
                    line.includes('GoPay') ||
                    line.includes('Tokopedia Card') ||
                    line.includes('Kotak Masuk')) {
                    continue;
                }

                // Look for "Total Pembayaran" label
                if (line.includes('Total Pembayaran')) {
                    // Look for amount in nearby lines
                    for (let j = i; j < Math.min(i + 3, lines.length); j++) {
                        const amountLine = lines[j];
                        const amountMatch = amountLine.match(/Rp\s*([\d.,]+)/i);
                        if (amountMatch) {
                            const amount = parseInt(amountMatch[1].replace(/[.,]/g, '')) || 0;
                            if (amount > 10000) {
                                results.push({
                                    amount,
                                    deadlineStr: deadlines[results.length] || null,
                                });
                                break;
                            }
                        }
                    }
                }
            }

            // Method 2: Fallback - look for amounts near "QRIS" or "Bayar sebelum"
            if (results.length === 0) {
                for (let i = 0; i < lines.length; i++) {
                    const line = lines[i].trim();

                    // Skip sidebar
                    if (line.includes('Saldo') || line.includes('GoPay')) {
                        continue;
                    }

                    // Found payment method indicator
                    if (line.includes('QRIS') || line.includes('Bayar sebelum')) {
                        // Look around for amount
                        for (let j = Math.max(0, i - 5); j < Math.min(i + 5, lines.length); j++) {
                            const amountLine = lines[j];
                            // Look specifically for Rp followed by number
                            const amountMatch = amountLine.match(/Rp\s*([\d.,]+)/i);
                            if (amountMatch) {
                                const amount = parseInt(amountMatch[1].replace(/[.,]/g, '')) || 0;
                                if (amount > 10000 && amount < 100000000) { // Reasonable payment range
                                    const exists = results.some(r => r.amount === amount);
                                    if (!exists) {
                                        results.push({
                                            amount,
                                            deadlineStr: deadlines[results.length] || null,
                                        });
                                    }
                                }
                            }
                        }
                    }
                }
            }

            return results;
        });

        // Parse deadline strings to Date objects
        const parsedOrders: PendingOrder[] = orders.map(o => {
            let deadline: Date | null = null;

            if (o.deadlineStr) {
                try {
                    // Parse "15 Jan 10:50" format
                    const [day, month, time] = o.deadlineStr.split(' ');
                    const [hours, minutes] = time.split(':').map(Number);

                    const monthMap: { [key: string]: number } = {
                        'Jan': 0, 'Feb': 1, 'Mar': 2, 'Apr': 3, 'May': 4, 'Jun': 5,
                        'Jul': 6, 'Aug': 7, 'Sep': 8, 'Oct': 9, 'Nov': 10, 'Dec': 11
                    };

                    const now = new Date();
                    deadline = new Date(now.getFullYear(), monthMap[month] || 0, parseInt(day), hours, minutes);

                    // If deadline is in the past, assume next year
                    if (deadline < now) {
                        deadline.setFullYear(deadline.getFullYear() + 1);
                    }

                    console.log(`  Deadline parsed: ${o.deadlineStr} -> ${deadline.toLocaleString()}`);
                } catch (e) {
                    console.log(`  Failed to parse deadline: ${o.deadlineStr}`);
                }
            }

            return {
                orderId: `PENDING-${o.amount}`,
                amount: o.amount,
                productName: 'Pending Payment',
                seller: '',
                deadline,
            };
        });

        console.log(`Found ${parsedOrders.length} pending orders in payment-list`);
        parsedOrders.forEach(o => {
            const deadlineInfo = o.deadline ? ` (expires: ${o.deadline.toLocaleString()})` : '';
            console.log(`  - Rp ${o.amount.toLocaleString()}${deadlineInfo}`);
        });

        await browser.close();
        return parsedOrders;
    } catch (error) {
        console.error('Error fetching pending orders:', error);
        await browser.close();
        return [];
    }
}

/**
 * Get pending orders with retry logic and mutex lock
 */
export async function getPendingOrders(): Promise<PendingOrder[]> {
    const gotLock = await waitForLock();
    if (!gotLock) {
        console.log('Could not acquire browser lock for pending orders');
        return [];
    }

    try {
        for (let attempt = 1; attempt <= MAX_RETRIES + 1; attempt++) {
            try {
                const result = await getPendingOrdersInternal();
                return result;
            } catch (error) {
                console.log(`Attempt ${attempt} failed for getPendingOrders`);
                if (attempt <= MAX_RETRIES) {
                    console.log(`Retrying in ${RETRY_DELAY / 1000}s...`);
                    await new Promise(r => setTimeout(r, RETRY_DELAY));
                }
            }
        }
        return [];
    } finally {
        releaseLock();
    }
}

/**
 * Internal: Get orders with "Diproses" status from order-list page
 * Extracts "Total Belanja" amount, not individual item prices
 */
async function getProcessedOrdersInternal(): Promise<ProcessedOrder[]> {
    const session = await createPage();
    if (!session) return [];

    const { browser, page } = session;

    try {
        console.log('Fetching processed orders from order-list...');
        await page.goto(ORDER_LIST_URL, {
            waitUntil: 'networkidle2',
            timeout: PAGE_TIMEOUT,
        });

        await new Promise(r => setTimeout(r, 3000));

        if (page.url().includes('login')) {
            console.log('Not logged in');
            await browser.close();
            return [];
        }

        const orders = await page.evaluate(() => {
            const results: ProcessedOrder[] = [];
            const pageText = document.body.innerText;
            const lines = pageText.split('\n');

            // Method 1: Look for "Diproses" status and then "Total Belanja" amount
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i].trim();

                // Skip sidebar items - look for keywords to avoid
                if (line.includes('Saldo') ||
                    line.includes('GoPay') ||
                    line.includes('Tokopedia Card') ||
                    line.includes('Kotak Masuk') ||
                    line.includes('Chat') ||
                    line.includes('Ulasan')) {
                    continue;
                }

                // Found "Diproses" status
                if (line.includes('Diproses')) {
                    // Look ahead for "Total Belanja" within next 20 lines
                    for (let j = i; j < Math.min(i + 20, lines.length); j++) {
                        const nextLine = lines[j].trim();

                        // Found "Total Belanja" - the next amount is the correct one
                        if (nextLine.includes('Total Belanja')) {
                            // Look for amount in nearby lines
                            for (let k = j; k < Math.min(j + 3, lines.length); k++) {
                                const amountLine = lines[k];
                                const amountMatch = amountLine.match(/Rp\s*([\d.,]+)/i);
                                if (amountMatch) {
                                    const amount = parseInt(amountMatch[1].replace(/[.,]/g, '')) || 0;
                                    if (amount > 10000) {
                                        const exists = results.some(r => r.amount === amount);
                                        if (!exists) {
                                            results.push({
                                                amount,
                                                productName: 'Order',
                                                status: 'Diproses',
                                            });
                                            console.log(`Found Total Belanja: Rp ${amount}`);
                                        }
                                        break;
                                    }
                                }
                            }
                            break;
                        }
                    }
                }
            }

            // Method 2: Fallback - Look for order cards in main content area
            if (results.length === 0) {
                // Try to find the main content area (excludes sidebar)
                const mainContent = document.querySelector('[class*="content"], [class*="main"], main, [role="main"]');
                const searchArea = mainContent || document.body;

                // Look for patterns: "Diproses" badge near "Total Belanja" + amount
                const textContent = searchArea.textContent || '';

                // Pattern: Find "Diproses" sections
                const sections = textContent.split(/Diproses/);
                for (let i = 1; i < sections.length; i++) {
                    const section = sections[i];

                    // Look for "Total Belanja" pattern
                    const totalMatch = section.match(/Total Belanja[^\d]*Rp\s*([\d.,]+)/i);
                    if (totalMatch) {
                        const amount = parseInt(totalMatch[1].replace(/[.,]/g, '')) || 0;
                        if (amount > 10000) {
                            const exists = results.some(r => r.amount === amount);
                            if (!exists) {
                                results.push({
                                    amount,
                                    productName: 'Order',
                                    status: 'Diproses',
                                });
                            }
                        }
                    }
                }
            }

            return results;
        });

        console.log(`Found ${orders.length} processed orders (Diproses)`);
        orders.forEach(o => console.log(`  - Rp ${o.amount.toLocaleString()} [${o.status}]`));

        await browser.close();
        return orders;
    } catch (error) {
        console.error('Error fetching processed orders:', error);
        await browser.close();
        return [];
    }
}

/**
 * Get processed orders with retry logic and mutex lock
 */
export async function getProcessedOrders(): Promise<ProcessedOrder[]> {
    const gotLock = await waitForLock();
    if (!gotLock) {
        console.log('Could not acquire browser lock for processed orders');
        return [];
    }

    try {
        for (let attempt = 1; attempt <= MAX_RETRIES + 1; attempt++) {
            try {
                const result = await getProcessedOrdersInternal();
                return result;
            } catch (error) {
                console.log(`Attempt ${attempt} failed for getProcessedOrders`);
                if (attempt <= MAX_RETRIES) {
                    console.log(`Retrying in ${RETRY_DELAY / 1000}s...`);
                    await new Promise(r => setTimeout(r, RETRY_DELAY));
                }
            }
        }
        return [];
    } finally {
        releaseLock();
    }
}

/**
 * Find order by matching amount in pending payments
 */
export async function findOrderByAmount(amount: number): Promise<PendingOrder | null> {
    const pendingOrders = await getPendingOrders();

    const tolerance = 1000;
    const match = pendingOrders.find(order =>
        Math.abs(order.amount - amount) <= tolerance
    );

    if (match) {
        console.log(`Found matching pending payment: Rp ${amount.toLocaleString()}`);
        await logAction('order_matched', `Matched pending payment Rp ${amount.toLocaleString()}`, 'info');
        match.orderId = `AMT-${amount}`;
    } else {
        console.log(`No matching pending payment for Rp ${amount.toLocaleString()}`);
    }

    return match || null;
}

/**
 * Check all pending QRIS and update paid status
 * 
 * Logic:
 * 1. Check payment-list - if amount NOT in pending list
 * 2. Check order-list - if amount found with "Diproses" status
 * 3. If both conditions met = CONFIRMED PAID
 */
export async function checkAndUpdatePayments(): Promise<{ checked: number; updated: number }> {
    const pendingQris = await prisma.qris.findMany({
        where: { status: 'pending' },
        include: { product: true },
    });

    if (pendingQris.length === 0) {
        console.log('No pending QRIS to check');
        return { checked: 0, updated: 0 };
    }

    // Step 1: Get pending payments (keep all, including duplicates with different deadlines)
    const pendingPayments = await getPendingOrders();
    const pendingAmountsList = pendingPayments.map(p => `Rp${p.amount.toLocaleString()}${p.deadline ? ` (${p.deadline.toLocaleTimeString()})` : ''}`);

    console.log(`Pending amounts in payment-list: ${pendingAmountsList.join(', ') || 'None'}`);

    // Add delay between checks to avoid rate limiting
    console.log(`Waiting ${CHECK_DELAY / 1000}s before checking processed orders...`);
    await new Promise(r => setTimeout(r, CHECK_DELAY));

    // Step 2: Get processed orders (Diproses status)
    const processedOrders = await getProcessedOrders();
    const processedAmounts = new Set(processedOrders.map(o => o.amount));

    console.log(`Processed amounts in order-list: ${Array.from(processedAmounts).map(a => `Rp${a.toLocaleString()}`).join(', ') || 'None'}`);

    let checked = 0;
    let updated = 0;

    for (const qris of pendingQris) {
        if (qris.amount <= 0) continue;

        checked++;

        // Match by amount AND deadline (within 5 minute tolerance)
        const DEADLINE_TOLERANCE_MS = 5 * 60 * 1000; // 5 minutes

        const matchingPending = pendingPayments.find(p => {
            if (p.amount !== qris.amount) return false;

            // If both have deadlines, compare them
            if (p.deadline && qris.expiresAt) {
                const timeDiff = Math.abs(p.deadline.getTime() - qris.expiresAt.getTime());
                return timeDiff <= DEADLINE_TOLERANCE_MS;
            }

            // If only amount matches and no deadline to compare, still consider it a match
            // This handles cases where deadline wasn't captured
            return true;
        });

        const isInPendingList = matchingPending !== undefined;
        const isInProcessedList = processedAmounts.has(qris.amount);

        // PAID if: NOT in pending list AND IS in processed list
        if (!isInPendingList && isInProcessedList) {
            console.log(`✓ Amount Rp ${qris.amount.toLocaleString()} (expires: ${qris.expiresAt.toLocaleString()}) - NOT in pending, IS in processed = PAID`);

            await prisma.qris.update({
                where: { id: qris.id },
                data: {
                    status: 'paid',
                    paidAt: new Date(),
                },
            });

            await logAction('payment_confirmed', `Payment confirmed: ${qris.product?.name || 'QRIS'} - Rp ${qris.amount.toLocaleString()}`, 'info');
            updated++;

            // Remove matched pending from list to avoid matching same Tokopedia order twice
            if (matchingPending) {
                const idx = pendingPayments.indexOf(matchingPending);
                if (idx > -1) pendingPayments.splice(idx, 1);
            }
        } else if (isInPendingList) {
            const deadlineInfo = matchingPending?.deadline ? ` (deadline: ${matchingPending.deadline.toLocaleString()})` : '';
            console.log(`○ Amount Rp ${qris.amount.toLocaleString()}${deadlineInfo} - still in pending list`);
        } else {
            console.log(`? Amount Rp ${qris.amount.toLocaleString()} - not found in any list`);
        }
    }

    return { checked, updated };
}
