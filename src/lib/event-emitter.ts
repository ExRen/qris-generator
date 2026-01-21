// Simple event emitter for SSE broadcasting
type EventHandler = (data: unknown) => void;

class EventEmitter {
    private handlers: Set<EventHandler> = new Set();

    subscribe(handler: EventHandler) {
        this.handlers.add(handler);
        return () => this.handlers.delete(handler);
    }

    emit(event: string, data: unknown) {
        const payload = { type: event, data, timestamp: new Date().toISOString() };
        this.handlers.forEach(handler => {
            try {
                handler(payload);
            } catch (e) {
                console.error('SSE handler error:', e);
            }
        });
    }
}

// Global singleton
export const qrisEvents = new EventEmitter();

// Event types
export type QrisEventType = 'qris_created' | 'qris_paid' | 'qris_expired' | 'qris_deleted';
