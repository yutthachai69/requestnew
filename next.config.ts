import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // เร่งความเร็ว dev server
  reactStrictMode: false, // ปิด strict mode ลดการ render ซ้ำ

  // ปิด source map ใน dev (ลด memory และเร็วขึ้น)
  productionBrowserSourceMaps: false,

  // ลด bundle size
  experimental: {
    optimizePackageImports: ['recharts', 'jspdf', 'html2canvas'],
  },
};

export default nextConfig;
