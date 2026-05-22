import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Kikoweb",
  description: "Brand Community Graph Platform",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
