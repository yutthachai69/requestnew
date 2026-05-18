/**
 * One-off: ย้าย admin API routes มาใช้ lib/api-auth
 * รัน: node scripts/migrate-api-auth.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const apiDir = path.join(root, 'app', 'api');

const SESSION_BLOCK =
  /const session = await getServerSession\(authOptions\);\s*\n\s*if \(!session\) return NextResponse\.json\(\{ error: 'Unauthorized' \}, \{ status: 401 \}\);\s*\n\s*const err = requireAdmin\(session\);\s*\n\s*if \(err\) return err;\s*\n/g;

const REQUIRE_ADMIN_FN =
  /function requireAdmin\(session: unknown\) \{\s*\n\s*const role = \(session as \{ user\?: \{ roleName\?: string \} \}\)\?\.user\?\.roleName;\s*\n\s*if \(role !== 'Admin'\) return NextResponse\.json\(\{ error: 'Forbidden' \}, \{ status: 403 \}\);\s*\n\s*return null;\s*\n\}\s*\n\s*/g;

const OLD_IMPORTS =
  /import \{ getServerSession \} from 'next-auth';\s*\nimport \{ authOptions \} from '@\/lib\/auth';\s*\n/g;

function walk(dir, files = []) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    if (fs.statSync(p).isDirectory()) walk(p, files);
    else if (name === 'route.ts') files.push(p);
  }
  return files;
}

let changed = 0;
for (const file of walk(apiDir)) {
  if (!file.includes(`${path.sep}admin${path.sep}`)) continue;
  if (file.includes('test-email')) continue;

  let s = fs.readFileSync(file, 'utf8');
  if (!s.includes('function requireAdmin(session')) continue;

  s = s.replace(OLD_IMPORTS, '');
  s = s.replace(REQUIRE_ADMIN_FN, '');
  s = s.replace(SESSION_BLOCK, "const auth = await requireAdmin();\n  if (isAuthError(auth)) return auth;\n");

  if (!s.includes("from '@/lib/api-auth'")) {
    const firstImport = s.indexOf('import ');
    const insert =
      "import { requireAdmin, isAuthError } from '@/lib/api-auth';\n";
    s = s.slice(0, firstImport) + insert + s.slice(firstImport);
  }

  fs.writeFileSync(file, s);
  changed++;
  console.log('updated', path.relative(root, file));
}
console.log('done', changed, 'files');
