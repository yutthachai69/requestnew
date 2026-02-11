import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { redirect } from 'next/navigation';
import AppSidebar from '@/app/components/AppSidebar';
import AppHeader from '@/app/components/AppHeader';

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

  return (
    <div className="min-h-screen bg-gray-50">
      <AppSidebar />
      <div className="pl-72 flex flex-col min-h-screen">
        <AppHeader />
        <main className="flex-1 overflow-y-auto py-6 px-4">{children}</main>
      </div>
    </div>
  );
}
