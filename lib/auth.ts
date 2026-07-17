import NextAuth, { type NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import { encode, decode } from 'next-auth/jwt';
import { prisma } from '@/lib/prisma';
import { hashPassword, verifyPassword } from '@/lib/hash';

const DEFAULT_MAX_AGE = 8 * 60 * 60; // 8 ชั่วโมง — เมื่อไม่ติ๊ก "จดจำฉันในระบบ"
const REMEMBER_MAX_AGE = 30 * 24 * 60 * 60; // 30 วัน — เมื่อติ๊ก "จดจำฉันในระบบ"

const secret = process.env.NEXTAUTH_SECRET;
if (!secret && process.env.NODE_ENV !== 'test') {
  console.warn(
    '⚠️ NEXTAUTH_SECRET is not set. Set it in .env (e.g. run: openssl rand -base64 32) to fix JWT decryption errors.'
  );
}

export const authOptions: NextAuthOptions = {
  secret: secret || undefined,
  providers: [
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        username: { label: 'Username', type: 'text' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        const username = credentials?.username ? String(credentials.username).trim() : '';
        const password = credentials?.password ? String(credentials.password).trim() : '';
        const remember =
          String((credentials as Record<string, string> | undefined)?.remember ?? '') === 'true';
        if (!username || !password) return null;
        const user = await prisma.user.findUnique({
          where: { username, isActive: true },
          include: { role: true, department: true },
        });
        if (!user) return null;
        const check = verifyPassword(password, user.password);
        if (!check.ok) return null;
        if (check.needsUpgrade) {
          await prisma.user.update({
            where: { id: user.id },
            data: { password: hashPassword(password) },
          });
        }
        return {
          id: String(user.id),
          name: user.fullName,
          email: user.email,
          roleName: user.role.roleName,
          department: user.department?.name ?? null,
          position: user.position ?? null,
          remember,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        const u = user as {
          roleName?: string;
          department?: string | null;
          position?: string | null;
          remember?: boolean;
        };
        token.roleName = u.roleName;
        token.id = user.id;
        token.department = u.department;
        token.position = u.position;
        token.remember = u.remember ?? false;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        const su = session.user as {
          roleName?: string;
          id?: string;
          department?: string | null;
          position?: string | null;
        };
        su.roleName = token.roleName as string | undefined;
        su.id = token.id as string | undefined;
        su.department = (token.department as string | null) ?? null;
        su.position = (token.position as string | null) ?? null;
      }
      return session;
    },
  },
  pages: { signIn: '/login' },
  // maxAge ตั้งไว้ยาว (30 วัน) เพื่อให้ cookie อยู่ได้นานพอสำหรับกรณีติ๊ก "จดจำฉัน"
  // ส่วนอายุจริงของ token คุมด้วย jwt.encode ด้านล่าง (8 ชม. ถ้าไม่ติ๊ก / 30 วันถ้าติ๊ก)
  session: { strategy: 'jwt', maxAge: REMEMBER_MAX_AGE },
  jwt: {
    async encode(params) {
      const remember = (params.token as { remember?: boolean } | undefined)?.remember;
      return encode({ ...params, maxAge: remember ? REMEMBER_MAX_AGE : DEFAULT_MAX_AGE });
    },
    decode,
  },
};

export { allowedDashboardRoles } from './auth-constants';

export function getSessionRole(session: { user?: { roleName?: string } } | null): string | null {
  return session?.user ? (session.user as { roleName?: string }).roleName ?? null : null;
}
