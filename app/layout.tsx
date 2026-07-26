import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://sergeyrudik-omut-vk-game-308d.twc1.net"),
  title: "Омут — тихая заводь",
  description: "Закинь удочку на заводи, собери альбом рыб и улучшай снасти.",
  alternates: { canonical: "/" },
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
  openGraph: {
    type: "website",
    locale: "ru_RU",
    url: "/",
    title: "Омут — тихая заводь",
    description: "Закинь удочку на заводи, собери альбом рыб и улучшай снасти.",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "Омут — тихая заводь" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Омут — тихая заводь",
    description: "Закинь удочку на заводи, собери альбом рыб и улучшай снасти.",
    images: ["/og.png"],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
