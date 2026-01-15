import { NextResponse } from 'next/server';
import { getRecentLogs } from '@/lib/logger';
import { ApiResponse, AdminLog } from '@/types';

// GET - Get recent admin logs
export async function GET() {
    try {
        const logs = await getRecentLogs(100);

        return NextResponse.json<ApiResponse<AdminLog[]>>({
            success: true,
            data: logs as AdminLog[],
        });
    } catch (error) {
        console.error('Error fetching logs:', error);
        return NextResponse.json<ApiResponse<null>>({
            success: false,
            error: 'Failed to fetch logs',
        }, { status: 500 });
    }
}
