import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { checkRateLimit, recordFailedAttempt, clearAttempts } from '@/lib/rate-limiter';

// Get client IP from request headers
function getClientIP(request: NextRequest): string {
    const forwarded = request.headers.get('x-forwarded-for');
    const realIP = request.headers.get('x-real-ip');
    return forwarded?.split(',')[0] || realIP || 'unknown';
}

// Simple password-based login with rate limiting
export async function POST(request: NextRequest) {
    try {
        const ip = getClientIP(request);

        // Check rate limit
        const rateLimit = checkRateLimit(ip);
        if (!rateLimit.allowed) {
            return NextResponse.json(
                {
                    success: false,
                    error: `Too many login attempts. Try again in ${rateLimit.retryAfter} seconds.`
                },
                {
                    status: 429,
                    headers: {
                        'Retry-After': String(rateLimit.retryAfter || 60)
                    }
                }
            );
        }

        const { password } = await request.json();
        const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';

        if (password === adminPassword) {
            // Clear failed attempts on successful login
            clearAttempts(ip);

            // Set auth cookie
            const cookieStore = await cookies();
            cookieStore.set('admin_auth', 'authenticated', {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'strict',
                maxAge: 60 * 60 * 24, // 24 hours
                path: '/',
            });

            return NextResponse.json({ success: true });
        }

        // Record failed attempt
        recordFailedAttempt(ip);

        return NextResponse.json(
            { success: false, error: 'Invalid password' },
            { status: 401 }
        );
    } catch (error) {
        console.error('Login error:', error);
        return NextResponse.json(
            { success: false, error: 'Login failed' },
            { status: 500 }
        );
    }
}

// Check auth status
export async function GET() {
    try {
        const cookieStore = await cookies();
        const authCookie = cookieStore.get('admin_auth');

        return NextResponse.json({
            authenticated: authCookie?.value === 'authenticated',
        });
    } catch {
        return NextResponse.json({ authenticated: false });
    }
}

