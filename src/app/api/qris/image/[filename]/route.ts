import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs/promises';

// API route to serve QRIS images
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ filename: string }> }
) {
    try {
        const { filename } = await params;

        // Security: only allow .png files and sanitize filename
        if (!filename.endsWith('.png') || filename.includes('..')) {
            return new NextResponse('Invalid file', { status: 400 });
        }

        const filePath = path.join(process.cwd(), 'public', 'qris', filename);

        try {
            const fileBuffer = await fs.readFile(filePath);

            return new NextResponse(fileBuffer, {
                headers: {
                    'Content-Type': 'image/png',
                    'Cache-Control': 'public, max-age=31536000',
                },
            });
        } catch {
            return new NextResponse('File not found', { status: 404 });
        }
    } catch (error) {
        console.error('Error serving QRIS image:', error);
        return new NextResponse('Internal error', { status: 500 });
    }
}
