import type { Metadata } from "next";
import Link from "next/link";
import { Orbitron, Share_Tech_Mono } from "next/font/google";
import "./globals.css";

const orbitron = Orbitron({
  subsets: ["latin"],
  weight: ["500", "700", "900"],
  variable: "--font-orbitron",
});
const techMono = Share_Tech_Mono({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-tech-mono",
});

export const metadata: Metadata = {
  title: "EPIPHANY — 三博士審議システム",
  description: "東方の三博士をモチーフにした 3AI 相互査読・議論アプリ",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja" className={`${orbitron.variable} ${techMono.variable}`}>
      <body>
        <header>
          <h1>
            <Link href="/" style={{ color: "inherit", textDecoration: "none" }}>
              EPIPHANY
            </Link>
          </h1>
          <p>磁 — 三博士相互査読審議システム — 議長：あなた</p>
          <nav className="nav">
            <Link href="/">審議</Link>
            <Link href="/history">履歴</Link>
          </nav>
        </header>
        <main>{children}</main>
        <footer>EPIPHANY v0.1 — Three Magi Deliberation Engine</footer>
      </body>
    </html>
  );
}
