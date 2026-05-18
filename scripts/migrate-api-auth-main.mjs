/**
 * ย้าย API หลัก (ไม่ใช่ admin) มาใช้ requireAuth
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

const files = [
  'app/api/requests/[id]/action/route.ts',
  'app/api/requests/[id]/route.ts',
  'app/api/requests/bulk-action/route.ts',
  'app/api/requests/[id]/pdf/route.ts',
  'app/api/pending-tasks/route.ts',
  'app/api/me/route.ts',
  'app/api/me/signature/route.ts',
  'app/api/auth/my-stats/route.ts',
  'app/api/user/bulk-permission/route.ts',
  'app/api/category/[id]/statistics/route.ts',
  'app/api/dashboard/category-stats/route.ts',
  'app/api/dashboard/overview/route.ts',
  'app/api/dashboard/statistics/route.ts',
  'app/api/dashboard/report-data/route.ts',
  'app/api/files/[...path]/route.ts',
  'app/api/master/correction-types/route.ts',
  'app/api/master/departments/route.ts',
  'app/api/statuses/route.ts',
  'app/api/admin/roles/mytabs/route.ts',
];

const BLOCK =
  /const session = await getServerSession\(authOptions\);\s*\n\s*if \(!session\?\.user\) return NextResponse\.json\(\{ error: 'Unauthorized' \}, \{ status: 401 \}\);\s*\n/g;

const BLOCK2 =
  /const session = await getServerSession\(authOptions\);\s*\n\s*if \(!session\) return NextResponse\.json\(\{ error: 'Unauthorized' \}, \{ status: 401 \}\);\s*\n/g;

const GET_SESSION =
  /const session = await getSession\(\);\s*\n\s*if \(!session\?\.user\) return NextResponse\.json\(\{ error: 'Unauthorized' \}, \{ status: 401 \}\);\s*\n/g;

for (const rel of files) {
  const file = path.join(root, rel);
  if (!fs.existsSync(file)) {
    console.log('skip missing', rel);
    continue;
  }
  let s = fs.readFileSync(file, 'utf8');
  const had = s.includes('getServerSession') || s.includes('getSession()');

  s = s.replace(
    /import \{ getServerSession \} from 'next-auth';\s*\nimport \{ authOptions \} from '@\/lib\/auth';\s*\n/g,
    ''
  );
  s = s.replace(/import \{ getSession \} from '@\/lib\/auth-cache';\s*\n/g, '');

  if (s.match(BLOCK)) s = s.replace(BLOCK, "const auth = await requireAuth();\n  if (isAuthError(auth)) return auth;\n");
  else if (s.match(BLOCK2))
    s = s.replace(BLOCK2, "const auth = await requireAuth();\n  if (isAuthError(auth)) return auth;\n");
  else if (s.match(GET_SESSION))
    s = s.replace(GET_SESSION, "const auth = await requireAuth();\n  if (isAuthError(auth)) return auth;\n");

  if (had && !s.includes("from '@/lib/api-auth'")) {
    const idx = s.indexOf('import ');
    s = s.slice(0, idx) + "import { requireAuth, isAuthError } from '@/lib/api-auth';\n" + s.slice(idx);
  }

  // common replacements
  s = s.replace(
    /const userId = Number\(\(session\.user as \{ id\?: string \}\)\.id\);\s*\n\s*const roleName = \(session\.user as \{ roleName\?: string \}\)\.roleName/g,
    'const userId = auth.id;\n  const roleName = auth.roleName'
  );
  s = s.replace(
    /const userId = \(session\.user as \{ id\?: string \}\)\.id;\s*\n\s*const roleName = \(session\.user as \{ roleName\?: string \}\)\.roleName/g,
    'const userId = String(auth.id);\n  const roleName = auth.roleName'
  );
  s = s.replace(/session\.user\.name/g, 'auth.name');
  s = s.replace(/session\.user\.email/g, 'auth.email');

  fs.writeFileSync(file, s);
  console.log('updated', rel);
}
