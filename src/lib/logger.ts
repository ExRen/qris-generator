import prisma from '@/lib/prisma';
import { LogLevel } from '@/types';

// Log admin actions
export const logAction = async (
    action: string,
    message: string,
    level: LogLevel = 'info'
): Promise<void> => {
    try {
        await prisma.adminLog.create({
            data: {
                action,
                message,
                level,
            },
        });
    } catch (error) {
        console.error('Failed to log action:', error);
    }
};

// Get recent logs
export const getRecentLogs = async (limit: number = 50) => {
    return prisma.adminLog.findMany({
        orderBy: { createdAt: 'desc' },
        take: limit,
    });
};

// Clear old logs (keep last 7 days)
export const clearOldLogs = async (): Promise<number> => {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const result = await prisma.adminLog.deleteMany({
        where: {
            createdAt: { lt: sevenDaysAgo },
        },
    });

    return result.count;
};
