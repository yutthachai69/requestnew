import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ findMany: vi.fn() }));
vi.mock('./prisma', () => ({ prisma: { workflowTransition: { findMany: mocks.findMany } } }));

import { findTransitionsByStatus } from './workflow';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.findMany.mockResolvedValue([]);
});

const whereOfLastCall = () => mocks.findMany.mock.calls.at(-1)![0].where as Record<string, unknown>;

describe('findTransitionsByStatus', () => {
  it('selects by the workflow version alone, so a category can inherit another category\'s version', async () => {
    // Category 2 inheriting the shared template's version 5: those rows carry
    // categoryId 5. Filtering on the request's categoryId (2) as well matched
    // nothing and left every request in the category without a next step.
    await findTransitionsByStatus(2, 1, null, 5, true);
    const where = whereOfLastCall();
    expect(where).toMatchObject({ workflowVersionId: 5, currentStatusId: 1, correctionTypeId: null });
    expect(where).not.toHaveProperty('categoryId');
  });

  /**
   * A request whose category (and the shared "ทั่วไป" template) has no
   * PUBLISHED version resolves to workflowVersionId: null. Matching on
   * categoryId alone here would silently merge every version ever created
   * for the category — including archived and draft ones — which can
   * double-count a single-approver step's required votes and leave a
   * request waiting forever on an approver who does not exist. It must
   * fail closed (match only never-versioned rows of that category) rather
   * than fail open.
   */
  it('fails closed instead of merging every archived/draft version when no version resolves', async () => {
    await findTransitionsByStatus(1, 1, null, null, true);
    expect(whereOfLastCall()).toMatchObject({ categoryId: 1, workflowVersionId: null });

    await findTransitionsByStatus(1, 1, null, undefined, true);
    expect(whereOfLastCall()).toMatchObject({ categoryId: 1, workflowVersionId: null });
  });
});
