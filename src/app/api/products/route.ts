import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { ApiResponse, Product } from '@/types';

// GET - Get all products
export async function GET() {
    try {
        const products = await prisma.product.findMany({
            include: {
                qris: {
                    orderBy: { createdAt: 'desc' },
                    take: 1, // Get latest QRIS for each product
                },
            },
            orderBy: { createdAt: 'desc' },
        });

        return NextResponse.json<ApiResponse<Product[]>>({
            success: true,
            data: products as Product[],
        });
    } catch (error) {
        console.error('Error fetching products:', error);
        return NextResponse.json<ApiResponse<null>>({
            success: false,
            error: 'Failed to fetch products',
        }, { status: 500 });
    }
}

// POST - Add new product (without generating QRIS)
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { url, name, price, imageUrl } = body;

        if (!url || !name || !price) {
            return NextResponse.json<ApiResponse<null>>({
                success: false,
                error: 'URL, name, and price are required',
            }, { status: 400 });
        }

        // Check if product already exists
        const existing = await prisma.product.findFirst({
            where: { url },
        });

        if (existing) {
            return NextResponse.json<ApiResponse<Product>>({
                success: true,
                data: existing as Product,
                message: 'Product already exists',
            });
        }

        const product = await prisma.product.create({
            data: {
                url,
                name,
                price,
                imageUrl: imageUrl || null,
            },
        });

        return NextResponse.json<ApiResponse<Product>>({
            success: true,
            data: product as Product,
            message: 'Product created successfully',
        });
    } catch (error) {
        console.error('Error creating product:', error);
        return NextResponse.json<ApiResponse<null>>({
            success: false,
            error: 'Failed to create product',
        }, { status: 500 });
    }
}

// DELETE - Delete a product (and its QRIS)
export async function DELETE(request: NextRequest) {
    try {
        const searchParams = request.nextUrl.searchParams;
        const id = searchParams.get('id');

        if (!id) {
            return NextResponse.json<ApiResponse<null>>({
                success: false,
                error: 'Product ID is required',
            }, { status: 400 });
        }

        await prisma.product.delete({
            where: { id },
        });

        return NextResponse.json<ApiResponse<null>>({
            success: true,
            message: 'Product deleted successfully',
        });
    } catch (error) {
        console.error('Error deleting product:', error);
        return NextResponse.json<ApiResponse<null>>({
            success: false,
            error: 'Failed to delete product',
        }, { status: 500 });
    }
}
