import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getScraper } from '@/lib/scraper';
import { logAction } from '@/lib/logger';
import { ApiResponse, Qris } from '@/types';

// GET - Get all QRIS (optionally filter by status)
export async function GET(request: NextRequest) {
    try {
        const searchParams = request.nextUrl.searchParams;
        const status = searchParams.get('status');
        const includeProduct = searchParams.get('includeProduct') === 'true';

        const where = status ? { status } : {};

        const qrisList = await prisma.qris.findMany({
            where,
            include: { product: includeProduct },
            orderBy: { createdAt: 'desc' },
        });

        return NextResponse.json<ApiResponse<Qris[]>>({
            success: true,
            data: qrisList as Qris[],
        });
    } catch (error) {
        console.error('Error fetching QRIS:', error);
        return NextResponse.json<ApiResponse<null>>({
            success: false,
            error: 'Failed to fetch QRIS list',
        }, { status: 500 });
    }
}

// POST - Generate new QRIS from product URL
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { productUrl } = body;

        if (!productUrl) {
            return NextResponse.json<ApiResponse<null>>({
                success: false,
                error: 'Product URL is required',
            }, { status: 400 });
        }

        // Validate Tokopedia URL
        if (!productUrl.includes('tokopedia.com')) {
            return NextResponse.json<ApiResponse<null>>({
                success: false,
                error: 'Invalid Tokopedia URL',
            }, { status: 400 });
        }

        await logAction('generate_qris_start', `Starting QRIS generation for: ${productUrl}`, 'info');

        const scraper = await getScraper();

        // Step 1: Scrape product info
        const productInfo = await scraper.scrapeProductInfo(productUrl);

        // Step 2: Check if product exists, create if not
        let product = await prisma.product.findFirst({
            where: { url: productUrl },
        });

        if (!product) {
            product = await prisma.product.create({
                data: {
                    url: productUrl,
                    name: productInfo.name,
                    price: productInfo.price,
                    imageUrl: productInfo.imageUrl,
                },
            });
        }

        // Step 3: Proceed to checkout and get QRIS
        await scraper.proceedToCheckout();
        const qrisData = await scraper.selectQrisPayment();

        // Save cookies for next session
        await scraper.saveCookies();

        // Step 4: Create QRIS record
        const qris = await prisma.qris.create({
            data: {
                productId: product.id,
                qrisImage: qrisData.qrisImage,
                orderId: qrisData.orderId,
                amount: qrisData.amount,
                expiresAt: qrisData.expiresAt,
                status: 'pending',
            },
            include: { product: true },
        });

        await logAction('generate_qris_success', `QRIS generated successfully: ${qris.id}`, 'info');

        return NextResponse.json<ApiResponse<Qris>>({
            success: true,
            data: qris as Qris,
            message: 'QRIS generated successfully',
        });
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error('Error generating QRIS:', error);

        await logAction('generate_qris_error', `Failed to generate QRIS: ${errorMessage}`, 'error');

        return NextResponse.json<ApiResponse<null>>({
            success: false,
            error: `Failed to generate QRIS: ${errorMessage}`,
        }, { status: 500 });
    }
}

// DELETE - Delete a QRIS
export async function DELETE(request: NextRequest) {
    try {
        const searchParams = request.nextUrl.searchParams;
        const id = searchParams.get('id');

        if (!id) {
            return NextResponse.json<ApiResponse<null>>({
                success: false,
                error: 'QRIS ID is required',
            }, { status: 400 });
        }

        await prisma.qris.delete({
            where: { id },
        });

        await logAction('delete_qris', `QRIS deleted: ${id}`, 'info');

        return NextResponse.json<ApiResponse<null>>({
            success: true,
            message: 'QRIS deleted successfully',
        });
    } catch (error) {
        console.error('Error deleting QRIS:', error);
        return NextResponse.json<ApiResponse<null>>({
            success: false,
            error: 'Failed to delete QRIS',
        }, { status: 500 });
    }
}
