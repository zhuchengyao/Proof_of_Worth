import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { WalletProvider } from "@/components/WalletProvider";
import { Navbar } from "@/components/Navbar";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "PoWorth - Proof of Worth",
  description:
    "Decentralized prediction market powered by commit-reveal on Solana",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className={inter.className}>
        <WalletProvider>
          <div className="min-h-screen flex flex-col">
            <Navbar />
            <main className="flex-1">{children}</main>
            <footer className="border-t border-border py-6 text-center text-xs text-muted-foreground">
              PoWorth Protocol v0.1.0 &mdash; Proof of Worth on Solana
            </footer>
          </div>
        </WalletProvider>
      </body>
    </html>
  );
}
