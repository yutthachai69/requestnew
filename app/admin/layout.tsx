import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { redirect } from 'next/navigation';
import AdminLayoutContent from './AdminLayoutContent';

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession(authOptions);
  const roleName = (session?.user as { roleName?: string })?.roleName;
  if (roleName !== 'Admin') {
    redirect('/');
  }

  return <AdminLayoutContent>{children}</AdminLayoutContent>;
}
