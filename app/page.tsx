import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { allowedDashboardRoles } from '@/lib/auth-constants';

export default async function Home() {
  const session = await getServerSession(authOptions);
  const role = session?.user ? (session.user as { roleName?: string }).roleName : undefined;
  const allowed = role && allowedDashboardRoles.includes(role);

  if (session && allowed) {
    redirect('/dashboard');
  }
  redirect('/login');
}
