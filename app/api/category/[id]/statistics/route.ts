import { requireAuth, isAuthError } from '@/lib/api-auth';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;
  const { id } = await params;
  const categoryId = Number(id);
  if (!categoryId) return NextResponse.json({ error: 'Invalid Category ID' }, { status: 400 });

  try {
    // We will get requests created in the last 7 days
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6); // 6 days ago + today = 7 days
    sevenDaysAgo.setHours(0, 0, 0, 0);

    const requests = await prisma.iTRequestF07.findMany({
      where: {
        categoryId,
        createdAt: { gte: sevenDaysAgo }
      },
      select: { createdAt: true }
    });

    // We want to generate the last 7 days array so even days with 0 count are included
    const resultMap = new Map<string, number>();
    
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      resultMap.set(`${year}-${month}-${day}`, 0);
    }

    requests.forEach(req => {
      const d = new Date(req.createdAt);
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      const key = `${year}-${month}-${day}`;
      if (resultMap.has(key)) {
        resultMap.set(key, resultMap.get(key)! + 1);
      }
    });

    const trend = Array.from(resultMap.entries()).map(([date, count]) => {
      // format date nicely to display e.g. "8 มี.ค."
      const [y, m, d] = date.split('-');
      const thaiMonths = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
      const monthName = thaiMonths[parseInt(m, 10) - 1];
      return {
        date,
        label: `${parseInt(d, 10)} ${monthName}`,
        count
      };
    });

    return NextResponse.json({ trend });

  } catch (error) {
    console.error('Error fetching category stats:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
