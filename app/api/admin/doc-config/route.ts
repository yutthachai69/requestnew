import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

function requireAdmin(session: unknown) {
  const role = (session as { user?: { roleName?: string } })?.user?.roleName;
  if (role !== 'Admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  return null;
}

/** GET /api/admin/doc-config?year=2569 - list doc configs for a year (one row per category) */
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const err = requireAdmin(session);
  if (err) return err;
  try {
    const { searchParams } = new URL(request.url);
    const yearParam = searchParams.get('year');
    const year = yearParam ? parseInt(yearParam, 10) : null;

    const categories = await prisma.category.findMany({
      orderBy: { id: 'asc' },
      select: { id: true, name: true },
    });

    if (!year) {
      return NextResponse.json(
        categories.map((c) => ({
          id: null as number | null,
          year: 0,
          prefix: '',
          lastRunningNumber: 0,
          categoryId: c.id,
          categoryName: c.name,
        }))
      );
    }

    const configs = await prisma.docConfig.findMany({
      where: { year },
      include: { category: { select: { id: true, name: true } } },
    });
    const configByCategory = Object.fromEntries(configs.map((d) => [d.categoryId, d]));

    const list = categories.map((c) => {
      const d = configByCategory[c.id];
      if (d) {
        return {
          id: d.id,
          year: d.year,
          prefix: d.prefix,
          lastRunningNumber: d.lastRunningNumber,
          categoryId: d.categoryId,
          categoryName: d.category.name,
        };
      }
      return {
        id: null as number | null,
        year,
        prefix: '',
        lastRunningNumber: 0,
        categoryId: c.id,
        categoryName: c.name,
      };
    });

    return NextResponse.json(list);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

/** POST /api/admin/doc-config - create doc config for category+year */
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const err = requireAdmin(session);
  if (err) return err;
  try {
    const body = await request.json();
    const year = Number(body.year);
    const categoryId = Number(body.categoryId);
    const prefix = String(body.prefix ?? '').trim();
    const lastRunningNumber = Math.max(0, Number(body.lastRunningNumber) || 0);
    if (!year || !categoryId) return NextResponse.json({ message: 'กรุณาระบุปีและหมวดหมู่' }, { status: 400 });
    if (!prefix) return NextResponse.json({ message: 'กรุณาระบุ Prefix' }, { status: 400 });

    const existing = await prisma.docConfig.findFirst({
      where: { year, categoryId },
    });
    if (existing) {
      const updated = await prisma.docConfig.update({
        where: { id: existing.id },
        data: { prefix, lastRunningNumber },
        include: { category: { select: { id: true, name: true } } },
      });
      return NextResponse.json({
        id: updated.id,
        year: updated.year,
        prefix: updated.prefix,
        lastRunningNumber: updated.lastRunningNumber,
        categoryId: updated.categoryId,
        categoryName: updated.category.name,
      });
    }

    const created = await prisma.docConfig.create({
      data: { year, categoryId, prefix, lastRunningNumber },
      include: { category: { select: { id: true, name: true } } },
    });
    return NextResponse.json({
      id: created.id,
      year: created.year,
      prefix: created.prefix,
      lastRunningNumber: created.lastRunningNumber,
      categoryId: created.categoryId,
      categoryName: created.category.name,
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ message: 'Server error' }, { status: 500 });
  }
}
