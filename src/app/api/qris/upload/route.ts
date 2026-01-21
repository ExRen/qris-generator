import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { logAction } from '@/lib/logger';
import { ApiResponse, Qris } from '@/types';
import path from 'path';
import fs from 'fs/promises';
import { decodeQrisFromBase64 } from '@/lib/qris-decoder';
import { findOrderByAmount } from '@/lib/order-checker';
import { qrisEvents } from '@/lib/event-emitter';

const QRIS_STORAGE_PATH = path.join(process.cwd(), 'public', 'qris');

// Ensure storage directory exists
const ensureStorageExists = async () => {
    try {
        await fs.access(QRIS_STORAGE_PATH);
    } catch {
        await fs.mkdir(QRIS_STORAGE_PATH, { recursive: true });
    }
};

// POST - Upload QRIS manually
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const {
            imageBase64,
            productName, // Optional - will use default if not provided
            amount, // Optional - will try to extract from QRIS
            orderId: providedOrderId,
            expiryMinutes = 15,
            useAutoExpiry = false, // If true, use Tokopedia deadline instead of expiryMinutes
        } = body;

        // Validation - only image is required
        if (!imageBase64) {
            return NextResponse.json<ApiResponse<null>>({
                success: false,
                error: 'Image is required',
            }, { status: 400 });
        }

        // Try to decode QRIS to extract amount
        let extractedAmount = amount;
        let extractedMerchant = productName;
        let qrisData = null;

        try {
            qrisData = await decodeQrisFromBase64(imageBase64);
            if (qrisData) {
                console.log('QRIS decoded:', qrisData);

                // Use extracted amount if not provided
                if (!extractedAmount && qrisData.amount) {
                    extractedAmount = qrisData.amount;
                }

                // Use merchant name if product name not provided
                if (!extractedMerchant && qrisData.merchantName) {
                    extractedMerchant = qrisData.merchantName;
                }
            }
        } catch (decodeError) {
            console.log('Failed to decode QRIS, using provided values:', decodeError);
        }

        // Use defaults if still not set
        const finalAmount = extractedAmount || 0;
        let finalProductName = extractedMerchant || `QRIS Upload ${new Date().toLocaleDateString('id-ID')}`;
        let finalOrderId = providedOrderId || '';
        let tokopediaDeadline: Date | null = null;

        // AUTO-MATCH: If no order ID provided and we have amount, try to find matching order
        if (!finalOrderId && finalAmount > 0) {
            console.log(`Searching for order with amount Rp ${finalAmount}...`);
            try {
                const matchedOrder = await findOrderByAmount(finalAmount);
                if (matchedOrder) {
                    finalOrderId = matchedOrder.orderId;
                    // Use product name from Tokopedia if available
                    if (matchedOrder.productName && matchedOrder.productName !== 'Pending Payment') {
                        finalProductName = matchedOrder.productName;
                    }
                    // Use deadline from Tokopedia if available
                    if (matchedOrder.deadline) {
                        tokopediaDeadline = matchedOrder.deadline;
                        console.log(`Using Tokopedia deadline: ${tokopediaDeadline.toLocaleString()}`);
                    }
                    console.log(`Auto-matched order: ${finalOrderId}`);
                    await logAction('order_auto_matched', `Auto-matched order ${finalOrderId} by amount Rp ${finalAmount.toLocaleString()}`, 'info');
                }
            } catch (matchError) {
                console.log('Failed to auto-match order:', matchError);
            }
        }

        await ensureStorageExists();

        // Decode base64 and save image
        const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '');
        const buffer = Buffer.from(base64Data, 'base64');

        const filename = `qris_${Date.now()}.png`;
        const imagePath = path.join(QRIS_STORAGE_PATH, filename);
        await fs.writeFile(imagePath, buffer);

        // Calculate expiry time
        let expiresAt: Date;
        if (useAutoExpiry && tokopediaDeadline) {
            // Use Tokopedia deadline when "Auto" is selected
            expiresAt = tokopediaDeadline;
            console.log(`Expiry set from Tokopedia: ${expiresAt.toLocaleString()}`);
        } else if (tokopediaDeadline && expiryMinutes === 0) {
            // Fallback: use Tokopedia deadline if expiryMinutes is 0 (auto mode)
            expiresAt = tokopediaDeadline;
            console.log(`Expiry set from Tokopedia (fallback): ${expiresAt.toLocaleString()}`);
        } else {
            // Use manual expiry time
            expiresAt = new Date();
            expiresAt.setMinutes(expiresAt.getMinutes() + (expiryMinutes || 15));
            console.log(`Expiry set manually: ${expiresAt.toLocaleString()}`);
        }

        // Create or find product
        let product = await prisma.product.findFirst({
            where: { name: finalProductName },
        });

        if (!product) {
            product = await prisma.product.create({
                data: {
                    url: `manual://upload/${Date.now()}`,
                    name: finalProductName,
                    price: finalAmount,
                    imageUrl: null,
                },
            });
        }

        // Create QRIS record
        const qris = await prisma.qris.create({
            data: {
                productId: product.id,
                qrisImage: `/api/qris/image/${filename}`,
                orderId: finalOrderId || qrisData?.transactionId || `MANUAL-${Date.now()}`,
                amount: finalAmount,
                expiresAt: expiresAt,
                status: 'pending',
            },
            include: { product: true },
        });

        const logMessage = finalAmount > 0
            ? `QRIS uploaded: ${finalProductName} - Rp ${finalAmount.toLocaleString()}`
            : `QRIS uploaded: ${finalProductName}`;

        await logAction('upload_qris', logMessage, 'info');

        // Emit SSE event for real-time updates
        qrisEvents.emit('qris_created', {
            id: qris.id,
            productName: finalProductName,
            amount: finalAmount,
        });

        // Build response message
        let message = 'QRIS uploaded successfully';
        if (qrisData?.amount) {
            message = `Detected amount: Rp ${qrisData.amount.toLocaleString()}`;
        }
        if (finalOrderId && !providedOrderId) {
            message += ` | Auto-matched order: ${finalOrderId}`;
        }

        return NextResponse.json<ApiResponse<Qris & { detectedAmount?: number | null; matchedOrderId?: string | null }>>({
            success: true,
            data: {
                ...qris as Qris,
                detectedAmount: qrisData?.amount || null,
                matchedOrderId: (!providedOrderId && finalOrderId) ? finalOrderId : null,
            },
            message,
        });
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error('Error uploading QRIS:', error);

        await logAction('upload_qris_error', `Failed to upload QRIS: ${errorMessage}`, 'error');

        return NextResponse.json<ApiResponse<null>>({
            success: false,
            error: `Failed to upload QRIS: ${errorMessage}`,
        }, { status: 500 });
    }
}
