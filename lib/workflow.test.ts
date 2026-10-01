import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ findMany: vi.fn() }));
vi.mock('./prisma', () => ({ prisma: { workflowTransition: { findMany: mocks.findMany } } }));

import { findTransitionsByStatus } from './workflow';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.findMany.mockResolvedValue([]);
});

describe('findTransitionsByStatus', () => {
  it('scopes to the given workflow version, not every version of the category', async () => {
    await findTransitionsByStatus(1, 1, null, 7, true);
    expect(mocks.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ categoryId: 1, workflowVersionId: 7 }) }),
    );
  });

  /**
   * A request whose category (and the shared "ทั่วไป" template) has no
   * PUBLISHED version resolves to workflowVersionId: null. Matching on
   * categoryId alone here would silently merge every version ever created
   * for the category — including archived and draft ones — which can
   * double-count a single-approver step's required votes and leave a
   * request waiting forever on an approver who does not exist. It must
   * fail closed (match nothing, since every seeded transition already
   * belongs to a version) rather than fail open.
   */
  it('fails closed instead of merging every archived/draft version when no version resolves', async () => {
    await findTransitionsByStatus(1, 1, null, null, true);
    expect(mocks.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ categoryId: 1, workflowVersionId: null }) }),
    );
  });
});
