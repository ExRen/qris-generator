import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { logAction } from '@/lib/logger';
import { ApiResponse } from '@/types';
import { qrisEvents } from '@/lib/event-emitter';

// POST - Mark QRIS as paid (manual confirmation)
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { qrisId } = body;

        if (!qrisId) {
            return NextResponse.json<ApiResponse<null>>({
                success: false,
                error: 'QRIS ID is required',
            }, { status: 400 });
        }

        // Find the QRIS
        const qris = await prisma.qris.findUnique({
            where: { id: qrisId },
            include: { product: true },
        });

        if (!qris) {
            return NextResponse.json<ApiResponse<null>>({
                success: false,
                error: 'QRIS not found',
            }, { status: 404 });
        }

        if (qris.status !== 'pending') {
            return NextResponse.json<ApiResponse<null>>({
                success: false,
                error: `QRIS is already ${qris.status}`,
            }, { status: 400 });
        }

        // Update status to paid
        const updatedQris = await prisma.qris.update({
            where: { id: qrisId },
            data: {
                status: 'paid',
                paidAt: new Date(),
            },
            include: { product: true },
        });

        await logAction(
            'mark_paid_manual',
            `QRIS marked as paid: ${qris.product.name} - Rp ${qris.amount.toLocaleString()}`,
            'info'
        );

        // Emit SSE event for real-time updates
        qrisEvents.emit('qris_paid', {
            id: qris.id,
            productName: qris.product.name,
            amount: qris.amount,
        });

        return NextResponse.json<ApiResponse<typeof updatedQris>>({
            success: true,
            data: updatedQris,
            message: 'QRIS marked as paid successfully',
        });
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error('Error marking QRIS as paid:', error);

        await logAction('mark_paid_error', `Failed to mark QRIS as paid: ${errorMessage}`, 'error');

        return NextResponse.json<ApiResponse<null>>({
            success: false,
            error: `Failed to mark as paid: ${errorMessage}`,
        }, { status: 500 });
    }
}
