import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

const fixes = [
  'app/api/admin/roles/mytabs/route.ts',
  'app/api/master/correction-types/route.ts',
  'app/api/auth/my-stats/route.ts',
  'app/api/me/signature/route.ts',
  'app/api/me/route.ts',
  'app/api/requests/bulk-action/route.ts',
  'app/api/requests/[id]/route.ts',
  'app/api/notifications/route.ts',
  'app/api/master/categories/route.ts',
  'app/api/pending-tasks/count/route.ts',
  'app/api/app/shell/route.ts',
];

const replacements = [
  [/import \{ getSession \} from '@\/lib\/auth-cache';\n/g, ''],
  [
    /const session = await getSession\(\);\s*\n\s*if \(!session\?\.user\?\.email\) \{\s*\n\s*return NextResponse\.json\(\{ error: 'Unauthorized' \}, \{ status: 401 \}\);\s*\n\s*\}\s*\n\s*const userId = \(session\.user as \{ id\?: string \}\)\.id;\s*\n\s*const roleName = \(session\.user as \{ roleName\?: string \}\)\.roleName;\s*\n/g,
    "const auth = await requireAuth();\n  if (isAuthError(auth)) return auth;\n  const userId = auth.id;\n  const roleName = auth.roleName;\n",
  ],
  [
    /const session = await getSession\(\);\s*\n\s*if \(!session\?\.user\) \{\s*\n\s*return NextResponse\.json\(\{ error: 'Unauthorized' \}, \{ status: 401 \}\);\s*\n\s*\}\s*\n\s*const userId = Number\(\(session\.user as \{ id\?: string \}\)\.id\);\s*\n\s*const roleName = \(session\.user as \{ roleName\?: string \}\)\.roleName;\s*\n/g,
    "const auth = await requireAuth();\n  if (isAuthError(auth)) return auth;\n  const userId = auth.id;\n  const roleName = auth.roleName;\n",
  ],
  [/\(session\.user as \{ roleName\?: string \}\)\.roleName/g, 'auth.roleName'],
  [/\(session\.user as \{ id\?: string \}\)\.id/g, 'String(auth.id)'],
  [/Number\(session\.user\.id\)/g, 'auth.id'],
  [/Number\(\(session\.user as any\)\.id\)/g, 'auth.id'],
  [/\(session\.user as any\)\.id \? Number\(\(session\.user as any\)\.id\) : null/g, 'auth.id'],
];

for (const rel of fixes) {
  const file = path.join(root, rel);
  if (!fs.existsSync(file)) continue;
  let s = fs.readFileSync(file, 'utf8');
  if (!s.includes('session')) {
    console.log('skip', rel);
    continue;
  }
  for (const [re, rep] of replacements) {
    s = s.replace(re, rep);
  }
  if (!s.includes("from '@/lib/api-auth'")) {
    const idx = s.indexOf('import ');
    s =
      s.slice(0, idx) +
      "import { requireAuth, isAuthError, getAuthUser } from '@/lib/api-auth';\n" +
      s.slice(idx);
  }
  fs.writeFileSync(file, s);
  console.log('fixed', rel);
}
