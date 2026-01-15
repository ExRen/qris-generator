// Product types
export interface Product {
    id: string;
    url: string;
    name: string;
    price: number;
    imageUrl: string | null;
    createdAt: Date;
    updatedAt: Date;
}

// QRIS types
export type QrisStatus = 'pending' | 'paid' | 'expired' | 'error';

export interface Qris {
    id: string;
    productId: string;
    product?: Product;
    qrisImage: string;
    orderId: string | null;
    amount: number;
    status: QrisStatus;
    expiresAt: Date;
    createdAt: Date;
    paidAt: Date | null;
}

// Admin Log types
export type LogLevel = 'info' | 'warning' | 'error';

export interface AdminLog {
    id: string;
    action: string;
    message: string;
    level: LogLevel;
    createdAt: Date;
}

// API Response types
export interface ApiResponse<T> {
    success: boolean;
    data?: T;
    error?: string;
    message?: string;
}

// Scraper types
export interface ScrapedProduct {
    name: string;
    price: number;
    imageUrl: string | null;
}

export interface ScrapedQris {
    qrisImage: string;
    orderId: string;
    amount: number;
    expiresAt: Date;
}

// SSE Event types
export type SSEEventType = 'qris_created' | 'qris_paid' | 'qris_expired' | 'qris_error' | 'connection';

export interface SSEEvent {
    type: SSEEventType;
    data: unknown;
    timestamp: Date;
}
