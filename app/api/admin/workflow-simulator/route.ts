import { requireAdmin, isAuthError } from '@/lib/api-auth';
import { NextRequest, NextResponse } from 'next/server';
import { simulateWorkflow } from '@/lib/workflow-versioning';

export async function POST(request: NextRequest) {
  const auth = await requireAdmin(); if (isAuthError(auth)) return auth;
  const body = await request.json();
  const versionId = Number(body.versionId);
  if (!versionId) return NextResponse.json({ message: 'กรุณาระบุ versionId' }, { status: 400 });
  return NextResponse.json(await simulateWorkflow((await import('@/lib/prisma')).prisma, versionId, body.requiresAccountRecheck === true));
}
