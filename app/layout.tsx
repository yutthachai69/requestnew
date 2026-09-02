import type { Metadata } from "next";
import "@fontsource/noto-sans-thai/400.css";
import "./globals.css";
import Providers from "./components/Providers";
import ServiceWorkerRegistration from "./components/ServiceWorkerRegistration";

export const metadata: Metadata = {
  title: "REQUESTONLINE - ระบบคำร้องออนไลน์",
  description: "ลดภาระการเดินเอกสาร ด้วยการยื่นคำร้องและอนุมัติออนไลน์",
  icons: {
    icon: "/TSM.png",
    shortcut: "/TSM.png",
    apple: "/TSM.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="th">
      <body
        className="font-sans antialiased bg-gray-50 text-gray-900"
        style={{ fontFamily: 'Noto Sans Thai, sans-serif' }}
      >
        <ServiceWorkerRegistration />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
