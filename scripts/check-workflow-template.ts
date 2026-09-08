/** Read-only verification after add_workflow_template.sql. */
import 'dotenv/config';
import { prisma } from '../lib/prisma';
import { getCategoriesForUser } from '../lib/categories-for-user';
import { resolveWorkflowVersionId, validateWorkflowTransitions } from '../lib/workflow-versioning';

async function main() {
  const categories = await prisma.category.findMany({
    select: { id: true, name: true, isWorkflowTemplate: true },
    orderBy: { id: 'asc' },
  });
  console.table(categories);
  const visible = await getCategoriesForUser(null, 'Admin');
  console.log('Admin sidebar categories:', visible.map(c => c.CategoryName));
  const initial = await prisma.status.findFirst({ where: { isInitialState: true } });
  const closed = await prisma.status.findFirst({ where: { code: 'CLOSED' } });
  if (!initial || !closed) throw new Error('Missing initial or CLOSED status');

  for (const category of categories.filter(c => !c.isWorkflowTemplate)) {
    const versionId = await resolveWorkflowVersionId(prisma, category.id, []);
    const version = versionId == null ? null : await prisma.workflowVersion.findUnique({
      where: { id: versionId },
      include: { transitions: { include: { action: true } } },
    });
    const validation = version
      ? validateWorkflowTransitions(version.transitions, initial.id, [closed.id])
      : { valid: false, errors: ['No published default workflow'] };
    console.log(JSON.stringify({
      category: category.name, versionId, sourceCategoryId: version?.categoryId,
      valid: validation.valid, errors: validation.errors,
    }));
    if (!validation.valid) process.exitCode = 1;
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : 'Workflow check failed');
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());
