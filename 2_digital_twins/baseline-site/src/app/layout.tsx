import type { Metadata } from "next";
import "./styles/globals.css";

export const metadata: Metadata = {
  title: "데카트론 코리아 | Decathlon Korea",
  description: "세상의 모든 스포츠. 데카트론에서 만나보세요.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
