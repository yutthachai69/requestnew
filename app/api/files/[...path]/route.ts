import { requireAuth, isAuthError } from '@/lib/api-auth';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { approverRoles } from '@/lib/auth-constants';
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

    // A login alone is not enough to read an upload. The file must be attached
    // to a request that the current user is allowed to view.
    const ownerRequest = await prisma.iTRequestF07.findFirst({
        where: { attachmentPath: { contains: apiPath } },
        select: { requesterId: true },
    });
    if (!ownerRequest) {
        return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }
    const canViewAnyRequest = auth.roleName === 'Admin'
        || (auth.roleName != null && approverRoles.includes(auth.roleName));
    if (!canViewAnyRequest && ownerRequest.requesterId !== auth.id) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
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
