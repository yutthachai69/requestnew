/**
 * Client-side services – mirror old frontend services (adminService, authService, etc.).
 * Use from client components; session is sent via same-origin cookies.
 */

export { default as adminService } from './adminService';
export { default as authService } from './authService';
export { default as dashboardService } from './dashboardService';
export { default as requestService } from './requestService';
export { default as emailService } from './emailService';
export { default as notificationService } from './notificationService';
