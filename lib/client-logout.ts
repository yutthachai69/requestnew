'use client';

import { signOut } from 'next-auth/react';

/** Sign out without allowing NEXTAUTH_URL to move the browser to another host. */
export async function logoutToLogin() {
  await signOut({ redirect: false, callbackUrl: '/login' });
  window.location.replace(`${window.location.origin}/login`);
}
