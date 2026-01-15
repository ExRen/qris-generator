import { NextResponse } from 'next/server';
import { checkAndUpdatePayments } from '@/lib/order-checker';
import { logAction } from '@/lib/logger';
import { ApiResponse } from '@/types';

// POST - Trigger payment check for all pending orders
export async function POST() {
    try {
        console.log('Starting payment check...');

        const result = await checkAndUpdatePayments();

        await logAction(
            'payment_check',
            `Checked ${result.checked} orders, updated ${result.updated}`,
            'info'
        );

        return NextResponse.json<ApiResponse<typeof result>>({
            success: true,
            data: result,
            message: `Checked ${result.checked} orders, ${result.updated} updated`,
        });
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error('Error checking payments:', error);

        await logAction('payment_check_error', `Failed: ${errorMessage}`, 'error');

        return NextResponse.json<ApiResponse<null>>({
            success: false,
            error: `Failed to check payments: ${errorMessage}`,
        }, { status: 500 });
    }
}

// GET - Get status of payment monitoring
export async function GET() {
    return NextResponse.json<ApiResponse<{ status: string }>>({
        success: true,
        data: { status: 'Payment monitor endpoint ready. POST to trigger check.' },
    });
}
