import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ATQA",
  description:
    "Autonomous TTS Quality Assurance Agent — 音声を、聴くべき場所だけに。",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
