import { NextRequest, NextResponse } from 'next/server';

// Middleware to protect admin routes and sensitive APIs
export function middleware(request: NextRequest) {
    const { pathname } = request.nextUrl;

    // Routes that require authentication
    const protectedPaths = [
        '/panel-secure',
        '/api/qris/upload',
        '/api/qris/delete',
        '/api/qris/mark-paid',
        '/api/payment/check',
    ];

    // Check if current path needs protection
    const isProtectedPath = protectedPaths.some(path =>
        pathname.startsWith(path)
    );

    if (!isProtectedPath) {
        return NextResponse.next();
    }

    // Check for auth cookie
    const authCookie = request.cookies.get('admin_auth');
    const isAuthenticated = authCookie?.value === 'authenticated';

    // For API routes, return 401
    if (pathname.startsWith('/api/') && !isAuthenticated) {
        return NextResponse.json(
            { success: false, error: 'Unauthorized' },
            { status: 401 }
        );
    }

    // For admin page, let it through (it will show login form)
    return NextResponse.next();
}

export const config = {
    matcher: [
        '/panel-secure/:path*',
        '/api/qris/upload',
        '/api/qris/delete/:path*',
        '/api/qris/mark-paid/:path*',
        '/api/payment/:path*',
    ],
};

