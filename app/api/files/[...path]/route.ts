import { requireAuth, isAuthError } from '@/lib/api-auth';
import { NextRequest, NextResponse } from 'next/server';
import { readFile, getMimeType, getFilePath } from '@/lib/storage';
import { handleApiError } from '@/lib/api-error';

/**
 * GET /api/files/[...path] - Serve files from uploads folder with auth check
 */
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ path: string[] }> }
) {
    const auth = await requireAuth();
    if (isAuthError(auth)) return auth;

    const pathSegments = (await params).path;
    if (!pathSegments || pathSegments.length === 0) {
        return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }

    // Only allow single filename (no subdirectories)
    if (pathSegments.length > 1) {
        return NextResponse.json({ error: 'Invalid path' }, { status: 400 });
    }

    const filename = pathSegments[0];

    // Prevent directory traversal
    if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
        return NextResponse.json({ error: 'Invalid filename' }, { status: 400 });
    }

    const apiPath = `/api/files/${filename}`;
    const filepath = getFilePath(apiPath);

    if (!filepath) {
        return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }

    try {
        const buffer = await readFile(apiPath);
        if (!buffer) {
            return NextResponse.json({ error: 'File not found' }, { status: 404 });
        }

        const mimeType = getMimeType(filename);

        return new NextResponse(new Uint8Array(buffer), {
            status: 200,
            headers: {
                'Content-Type': mimeType,
                'Content-Disposition': `inline; filename="${filename}"`,
                'Cache-Control': 'private, max-age=3600',
            },
        });
    } catch (error) {
        return handleApiError(error, 'GET /api/files/[...path]');
    }
}
