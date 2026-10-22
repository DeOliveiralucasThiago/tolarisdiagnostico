import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Tolaris Diagnóstico",
  description: "Triagem rápida de exames de sangue para a medicina do trabalho",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
