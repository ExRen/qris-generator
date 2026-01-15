import { NextResponse } from 'next/server';

// Simple SSE endpoint - disabled heavy polling to prevent errors
export async function GET() {
    const encoder = new TextEncoder();

    const stream = new ReadableStream({
        start(controller) {
            // Send initial connection event only
            const connectionEvent = `data: ${JSON.stringify({
                type: 'connection',
                data: { message: 'Connected to QRIS events' },
                timestamp: new Date().toISOString(),
            })}\n\n`;

            controller.enqueue(encoder.encode(connectionEvent));

            // Close immediately - frontend will poll instead
            // This prevents the controller closed errors
            setTimeout(() => {
                try {
                    controller.close();
                } catch {
                    // Ignore close errors
                }
            }, 100);
        },
    });

    return new NextResponse(stream, {
        headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Connection': 'keep-alive',
        },
    });
}
