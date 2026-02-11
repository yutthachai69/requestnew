import type { Metadata } from "next";
import { Noto_Sans_Thai } from "next/font/google";
import "./globals.css";
import Providers from "./components/Providers";
import ServiceWorkerRegistration from "./components/ServiceWorkerRegistration";

const notoSansThai = Noto_Sans_Thai({
  weight: ['100', '200', '300', '400', '500', '600', '700', '800', '900'],
  subsets: ["thai"],
  variable: "--font-noto-sans-thai",
  display: 'swap',
});

export const metadata: Metadata = {
  title: "REQUESTONLINE - ระบบคำร้องออนไลน์",
  description: "ลดภาระการเดินเอกสาร ด้วยการยื่นคำร้องและอนุมัติออนไลน์",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="th">
      <body
        className={`${notoSansThai.variable} font-sans antialiased bg-gray-50 text-gray-900`}
        style={{ fontFamily: 'var(--font-noto-sans-thai)' }}
      >
        <ServiceWorkerRegistration />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}

