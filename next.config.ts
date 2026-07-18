import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // เร่งความเร็ว dev server
  reactStrictMode: false, // ปิด strict mode ลดการ render ซ้ำ

  // ปิด source map ใน dev (ลด memory และเร็วขึ้น)
  productionBrowserSourceMaps: false,

  // ลด bundle size และเพิ่มขีดจำกัดขนาดไฟล์อัปโหลด
  experimental: {
    optimizePackageImports: ['recharts', 'jspdf', 'html2canvas-pro', 'lucide-react', 'react-hot-toast'],
    serverActions: {
      bodySizeLimit: '10mb', // อัปโหลดรูปภาพรวมไม่เกิน 10MB ได้แล้ว
    },
  },
};

export default nextConfig;
