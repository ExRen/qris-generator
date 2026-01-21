import { NextResponse } from 'next/server';
import { qrisEvents } from '@/lib/event-emitter';

// SSE endpoint with persistent connection
export async function GET() {
    const encoder = new TextEncoder();

    const stream = new ReadableStream({
        start(controller) {
            // Send initial connection event
            const connectionEvent = `data: ${JSON.stringify({
                type: 'connection',
                data: { message: 'Connected to QRIS events' },
                timestamp: new Date().toISOString(),
            })}\n\n`;

            controller.enqueue(encoder.encode(connectionEvent));

            // Subscribe to QRIS events
            const unsubscribe = qrisEvents.subscribe((payload) => {
                try {
                    const eventData = `data: ${JSON.stringify(payload)}\n\n`;
                    controller.enqueue(encoder.encode(eventData));
                } catch {
                    // Controller might be closed, ignore
                }
            });

            // Send heartbeat every 30 seconds to keep connection alive
            const heartbeat = setInterval(() => {
                try {
                    const ping = `data: ${JSON.stringify({ type: 'heartbeat', timestamp: new Date().toISOString() })}\n\n`;
                    controller.enqueue(encoder.encode(ping));
                } catch {
                    clearInterval(heartbeat);
                    unsubscribe();
                }
            }, 30000);

            // Cleanup when stream is cancelled
            const cleanup = () => {
                clearInterval(heartbeat);
                unsubscribe();
            };

            // Handle abort signal (client disconnect)
            setTimeout(() => {
                // Check periodically if we should clean up
                const checkInterval = setInterval(() => {
                    try {
                        // Try to write - if it fails, we're disconnected
                        controller.enqueue(encoder.encode(':\n\n')); // SSE comment
                    } catch {
                        cleanup();
                        clearInterval(checkInterval);
                    }
                }, 60000);
            }, 1000);
        },
    });

    return new NextResponse(stream, {
        headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Connection': 'keep-alive',
            'X-Accel-Buffering': 'no', // Disable nginx buffering
        },
    });
}
