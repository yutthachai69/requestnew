import { prisma } from '@/lib/prisma';

export type CategoryListItem = {
  CategoryID: number;
  CategoryName: string;
  RequiresCCSClosing?: boolean;
  locations?: { id: number; name: string }[];
};

export async function getCategoriesForUser(
  userId: number | null,
  roleName: string | undefined
): Promise<CategoryListItem[]> {
  if (roleName === 'Admin') {
    const categories = await prisma.category.findMany({
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        requiresCCSClosing: true,
        locations: { select: { id: true, name: true } },
      },
    });
    return categories.map((c) => ({
      CategoryID: c.id,
      CategoryName: c.name,
      RequiresCCSClosing: c.requiresCCSClosing,
      locations: c.locations,
    }));
  }

  if (!userId) return [];

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      accessibleCategories: {
        orderBy: { name: 'asc' },
        select: {
          id: true,
          name: true,
          requiresCCSClosing: true,
          locations: { select: { id: true, name: true } },
        },
      },
    },
  });

  if (!user) return [];

  return user.accessibleCategories.map((c) => ({
    CategoryID: c.id,
    CategoryName: c.name,
    RequiresCCSClosing: c.requiresCCSClosing,
    locations: c.locations,
  }));
}
