import NextAuth, { type NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import { prisma } from '@/lib/prisma';
import { hashPassword } from '@/lib/hash';

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
        if (!username || !password) return null;
        const user = await prisma.user.findUnique({
          where: { username, isActive: true },
          include: { role: true, department: true },
        });
        if (!user) return null;
        const hashed = hashPassword(password);
        if (user.password !== hashed) return null;
        return {
          id: String(user.id),
          name: user.fullName,
          email: user.email,
          roleName: user.role.roleName,
          department: user.department?.name ?? null,
          position: user.position ?? null,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        const u = user as { roleName?: string; department?: string | null; position?: string | null };
        token.roleName = u.roleName;
        token.id = user.id;
        token.department = u.department;
        token.position = u.position;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        const su = session.user as { roleName?: string; id?: string; department?: string | null; position?: string | null };
        su.roleName = token.roleName as string | undefined;
        su.id = token.id as string | undefined;
        su.department = (token.department as string | null) ?? null;
        su.position = (token.position as string | null) ?? null;
      }
      return session;
    },
  },
  pages: { signIn: '/login' },
  session: { strategy: 'jwt', maxAge: 8 * 60 * 60 }, // 8 ชั่วโมง (1 วันทำงาน)
};

export { allowedDashboardRoles } from './auth-constants';

export function getSessionRole(session: { user?: { roleName?: string } } | null): string | null {
  return session?.user ? (session.user as { roleName?: string }).roleName ?? null : null;
}
