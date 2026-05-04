import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CousinServices — Especialista em Terrenos | Análise de Leilões SP",
  description: "Plataforma de inteligência imobiliária para identificação, análise e ranqueamento de oportunidades de compra de terrenos em leilões no Estado de São Paulo. ROI, deságio e custos ocultos calculados automaticamente.",
  keywords: "leilão, terrenos, São Paulo, investimento imobiliário, ROI, deságio, leilão judicial, extrajudicial",
  authors: [{ name: "CousinServices" }],
  openGraph: {
    title: "CousinServices — Especialista em Terrenos",
    description: "Encontre as melhores oportunidades de terrenos em leilão em SP",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
