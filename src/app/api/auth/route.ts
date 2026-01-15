import { NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs/promises';

const COOKIES_PATH = path.join(process.cwd(), 'tokopedia-cookies.json');

// GET - Get login status and instructions
export async function GET() {
    try {
        // Check if cookies file exists
        const cookiesExist = await fs.access(COOKIES_PATH).then(() => true).catch(() => false);

        return NextResponse.json({
            success: true,
            data: {
                isLoggedIn: cookiesExist,
                cookiesPath: COOKIES_PATH,
                instructions: cookiesExist
                    ? 'Cookies found. You can generate QRIS now.'
                    : 'No cookies found. Please run the login script first.',
            },
        });
    } catch (error) {
        return NextResponse.json({
            success: false,
            error: String(error),
        }, { status: 500 });
    }
}

// POST - Save cookies from manual login
export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { cookies } = body;

        if (!cookies || !Array.isArray(cookies)) {
            return NextResponse.json({
                success: false,
                error: 'Invalid cookies format. Expected array of cookie objects.',
            }, { status: 400 });
        }

        // Save cookies to file
        await fs.writeFile(COOKIES_PATH, JSON.stringify(cookies, null, 2));

        return NextResponse.json({
            success: true,
            message: 'Cookies saved successfully!',
            cookiesCount: cookies.length,
        });
    } catch (error) {
        return NextResponse.json({
            success: false,
            error: String(error),
        }, { status: 500 });
    }
}
