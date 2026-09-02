import { describe, expect, it } from 'vitest';
import { Prisma } from '@prisma/client';
import { generateRequestNumber } from './document-number';

type ConfigRow = {
  id: number;
  categoryId: number;
  year: number;
  prefix: string;
  lastRunningNumber: number;
};

/**
 * In-memory stand-in for the DocConfig table. Only the four calls
 * generateRequestNumber makes are implemented.
 */
function mockTx(rows: ConfigRow[]) {
  let nextId = rows.reduce((max, row) => Math.max(max, row.id), 0) + 1;

  const docConfig = {
    async findFirst({ where, orderBy }: { where: { categoryId: number; year?: number }; orderBy?: { year: 'desc' } }) {
      let matches = rows.filter(
        (row) => row.categoryId === where.categoryId && (where.year == null || row.year === where.year)
      );
      if (orderBy?.year === 'desc') matches = [...matches].sort((a, b) => b.year - a.year);
      return matches[0] ?? null;
    },
    async create({ data }: { data: Omit<ConfigRow, 'id'> }) {
      const duplicate = rows.find((row) => row.categoryId === data.categoryId && row.year === data.year);
      if (duplicate) {
        // เลียนแบบ unique (categoryId, year) ของ Prisma
        throw Object.assign(new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
          code: 'P2002',
          clientVersion: 'test',
        }));
      }
      const row = { id: nextId++, ...data };
      rows.push(row);
      return row;
    },
  };

  /**
   * เลียนแบบ `UPDATE ... SET lastRunningNumber = lastRunningNumber + 1 OUTPUT inserted.*`
   * ค่าที่ส่งมากับ template คือ categoryId แล้วตามด้วย year
   */
  const $queryRaw = async (_strings: TemplateStringsArray, categoryId: number, year: number) => {
    const row = rows.find((item) => item.categoryId === categoryId && item.year === year);
    if (!row) return [];
    row.lastRunningNumber += 1;
    return [{ prefix: row.prefix, lastRunningNumber: row.lastRunningNumber }];
  };

  return { rows, tx: { docConfig, $queryRaw } as unknown as Prisma.TransactionClient };
}

describe('generateRequestNumber', () => {
  it('increments the running number of the current Buddhist-era year', async () => {
    // 2026 CE = 2569 BE
    const { tx, rows } = mockTx([
      { id: 1, categoryId: 1, year: 2569, prefix: 'IT-F07-GN', lastRunningNumber: 41 },
    ]);

    const number = await generateRequestNumber(tx, 1, new Date('2026-06-15T03:00:00Z'));

    expect(number).toBe('IT-F07-GN-69-042');
    expect(rows[0].lastRunningNumber).toBe(42);
  });

  it('pads the running number to three digits and does not truncate past 999', async () => {
    const { tx } = mockTx([
      { id: 1, categoryId: 1, year: 2569, prefix: 'IT-F07-GN', lastRunningNumber: 0 },
    ]);
    expect(await generateRequestNumber(tx, 1, new Date('2026-06-15T03:00:00Z'))).toBe('IT-F07-GN-69-001');

    const { tx: bigTx } = mockTx([
      { id: 1, categoryId: 1, year: 2569, prefix: 'IT-F07-GN', lastRunningNumber: 999 },
    ]);
    expect(await generateRequestNumber(bigTx, 1, new Date('2026-06-15T03:00:00Z'))).toBe('IT-F07-GN-69-1000');
  });

  it('starts a fresh sequence at 001 on year rollover, keeping the previous prefix', async () => {
    const { tx, rows } = mockTx([
      { id: 1, categoryId: 1, year: 2569, prefix: 'IT-F07-CUSTOM', lastRunningNumber: 512 },
    ]);

    // 2027 CE = 2570 BE — the first request of the new year.
    const number = await generateRequestNumber(tx, 1, new Date('2027-01-01T03:00:00Z'));

    expect(number).toBe('IT-F07-CUSTOM-70-001');
    const created = rows.find((row) => row.year === 2570);
    expect(created?.prefix).toBe('IT-F07-CUSTOM');
    expect(created?.lastRunningNumber).toBe(1);
    // The previous year's counter must not be touched.
    expect(rows.find((row) => row.year === 2569)?.lastRunningNumber).toBe(512);
  });

  it('bootstraps from the category code when the category has no DocConfig at all', async () => {
    const { tx, rows } = mockTx([]);

    const number = await generateRequestNumber(tx, 2, new Date('2026-06-15T03:00:00Z'));

    expect(number).toBe('IT-F07-MA-69-001');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ categoryId: 2, year: 2569, lastRunningNumber: 1 });
  });

  it('falls back to a generic prefix for an unmapped category', async () => {
    const { tx } = mockTx([]);
    expect(await generateRequestNumber(tx, 99, new Date('2026-06-15T03:00:00Z'))).toBe('IT-F07-69-001');
  });

  it('keeps per-category sequences independent within the same year', async () => {
    const { tx } = mockTx([
      { id: 1, categoryId: 1, year: 2569, prefix: 'IT-F07-GN', lastRunningNumber: 10 },
      { id: 2, categoryId: 2, year: 2569, prefix: 'IT-F07-MA', lastRunningNumber: 3 },
    ]);

    const date = new Date('2026-06-15T03:00:00Z');
    expect(await generateRequestNumber(tx, 1, date)).toBe('IT-F07-GN-69-011');
    expect(await generateRequestNumber(tx, 2, date)).toBe('IT-F07-MA-69-004');
    expect(await generateRequestNumber(tx, 1, date)).toBe('IT-F07-GN-69-012');
  });

  it('uses the year of the supplied request date, not of the run', async () => {
    const { tx } = mockTx([
      { id: 1, categoryId: 1, year: 2568, prefix: 'IT-F07-GN', lastRunningNumber: 7 },
    ]);
    // A request backdated into the previous BE year must draw from that year's config.
    expect(await generateRequestNumber(tx, 1, new Date('2025-12-31T10:00:00Z'))).toBe('IT-F07-GN-68-008');
  });
});
