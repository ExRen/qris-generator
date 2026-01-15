import prisma from '@/lib/prisma';
import { getScraper } from '@/lib/scraper';
import { logAction } from '@/lib/logger';

// Check and update QRIS status
export const checkQrisStatus = async (qrisId: string): Promise<'pending' | 'paid' | 'expired'> => {
    const qris = await prisma.qris.findUnique({
        where: { id: qrisId },
    });

    if (!qris) {
        throw new Error('QRIS not found');
    }

    // Check if expired
    if (new Date() > qris.expiresAt) {
        await prisma.qris.update({
            where: { id: qrisId },
            data: { status: 'expired' },
        });
        await logAction('qris_expired', `QRIS ${qrisId} has expired`, 'warning');
        return 'expired';
    }

    // Check payment status from Tokopedia
    if (qris.orderId) {
        try {
            const scraper = await getScraper();
            const status = await scraper.checkPaymentStatus(qris.orderId);

            if (status === 'paid') {
                await prisma.qris.update({
                    where: { id: qrisId },
                    data: {
                        status: 'paid',
                        paidAt: new Date(),
                    },
                });
                await logAction('qris_paid', `QRIS ${qrisId} has been paid`, 'info');
                return 'paid';
            } else if (status === 'expired') {
                await prisma.qris.update({
                    where: { id: qrisId },
                    data: { status: 'expired' },
                });
                await logAction('qris_expired', `QRIS ${qrisId} order expired`, 'warning');
                return 'expired';
            }
        } catch (error) {
            console.error('Error checking payment status:', error);
            await logAction('check_status_error', `Failed to check status for ${qrisId}: ${error}`, 'error');
        }
    }

    return 'pending';
};

// Check all pending QRIS
export const checkAllPendingQris = async (): Promise<void> => {
    const pendingQris = await prisma.qris.findMany({
        where: { status: 'pending' },
    });

    console.log(`Checking ${pendingQris.length} pending QRIS...`);

    for (const qris of pendingQris) {
        await checkQrisStatus(qris.id);
        // Add delay between checks
        await new Promise(resolve => setTimeout(resolve, 2000));
    }
};

// Start background monitoring
let monitorInterval: NodeJS.Timeout | null = null;

export const startMonitoring = (intervalMs: number = 30000): void => {
    if (monitorInterval) {
        console.log('Monitor already running');
        return;
    }

    console.log(`Starting QRIS monitor with ${intervalMs}ms interval`);

    monitorInterval = setInterval(async () => {
        try {
            await checkAllPendingQris();
        } catch (error) {
            console.error('Monitor error:', error);
        }
    }, intervalMs);
};

export const stopMonitoring = (): void => {
    if (monitorInterval) {
        clearInterval(monitorInterval);
        monitorInterval = null;
        console.log('QRIS monitor stopped');
    }
};

// Regenerate expired QRIS
export const regenerateExpiredQris = async (qrisId: string): Promise<string | null> => {
    const qris = await prisma.qris.findUnique({
        where: { id: qrisId },
        include: { product: true },
    });

    if (!qris || !qris.product) {
        throw new Error('QRIS or product not found');
    }

    if (qris.status !== 'expired') {
        throw new Error('QRIS is not expired');
    }

    try {
        const scraper = await getScraper();

        // Scrape new QRIS
        await scraper.scrapeProductInfo(qris.product.url);
        await scraper.proceedToCheckout();
        const newQrisData = await scraper.selectQrisPayment();
        await scraper.saveCookies();

        // Create new QRIS record
        const newQris = await prisma.qris.create({
            data: {
                productId: qris.productId,
                qrisImage: newQrisData.qrisImage,
                orderId: newQrisData.orderId,
                amount: newQrisData.amount,
                expiresAt: newQrisData.expiresAt,
                status: 'pending',
            },
        });

        // Mark old QRIS as superseded
        await prisma.qris.update({
            where: { id: qrisId },
            data: { status: 'error' }, // Using error to indicate replaced
        });

        await logAction('qris_regenerated', `Regenerated QRIS ${qrisId} -> ${newQris.id}`, 'info');

        return newQris.id;
    } catch (error) {
        await logAction('regenerate_error', `Failed to regenerate QRIS ${qrisId}: ${error}`, 'error');
        throw error;
    }
};
