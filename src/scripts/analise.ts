// ============================================================
// CousinServices — Script de Análise Financeira
// Lê leiloes.json, pesquisa preço/m², calcula ROI e gera ranking
// Usage: npx tsx src/scripts/analise.ts
// ============================================================

import * as fs from 'fs';
import * as path from 'path';
import type { LeilaoItem } from './scraper-playwright';

// ===================== INTERFACES =====================
interface AnaliseItem extends LeilaoItem {
  precoM2Mercado: number;
  valorMercadoEstimado: number;
  comissaoLeiloeiro: number;
  itbi: number;
  registroEscritura: number;
  custosExtrasTotal: number;
  investimentoTotal: number;
  lucroBrutoProjetado: number;
  roiEstimado: number;
  desagio: number;
  fontePrecoMercado: string;
}

// ===================== MARKET PRICE DATABASE =====================
// Preço médio do m² de terrenos por cidade/região do Estado de SP
// Baseado em dados FipeZAP, ZAP Imóveis e pesquisa de mercado
const PRECO_M2_POR_CIDADE: Record<string, number> = {
  // Capital - por bairro (Valores agressivamente reduzidos para terrenos sem benfeitorias)
  'são paulo': 3500,
  'pinheiros': 8000,
  'moema': 7000,
  'vila mariana': 6000,
  'tatuapé': 4500,
  'santana': 4000,
  'perdizes': 6000,
  'brooklin': 6000,
  'campo belo': 5000,
  'lapa': 4000,
  'butantã': 3500,
  'consolação': 6500,
  'liberdade': 5000,
  'mooca': 4500,
  'itaquera': 1200,
  'interlagos': 1800,
  'saúde': 4000,

  // Região Metropolitana
  'guarulhos': 1200,
  'osasco': 1800,
  'são bernardo do campo': 2000,
  'santo andré': 1800,
  'são caetano do sul': 3000,
  'barueri': 2500,
  'alphaville': 3500,
  'diadema': 1200,
  'cotia': 1200,
  'taboão da serra': 1200,
  'itapevi': 1000,
  'carapicuíba': 1000,
  'mauá': 1000,

  // Interior (Média de ~R$ 1000/m²)
  'campinas': 1500,
  'sorocaba': 1000,
  'ribeirão preto': 1200,
  'são josé dos campos': 1500,
  'santos': 2500,
  'jundiaí': 1200,
  'piracicaba': 1000,
  'bauru': 900,
  'marília': 800,
  'presidente prudente': 700,
  'araraquara': 800,
  'franca': 800,
  'bragança paulista': 1000,
  'atibaia': 1200,
  'itatiba': 1000,
  'mairiporã': 1000,
  'adamantina': 500,
  'barra bonita': 600,
  'capão bonito': 400,
  'paranapanema': 300,
  'pardinho': 400,
  'piracaia': 800,
  'santa maria da serra': 300,
  'américo de campos': 300,
  'mirassol': 600,
  'itapetininga': 700,
  'são roque': 1000,
};

function getPrecoM2(cidade: string, bairro: string): { preco: number; fonte: string } {
  const bairroLower = bairro.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const cidadeLower = cidade.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  // Try bairro first
  for (const [key, val] of Object.entries(PRECO_M2_POR_CIDADE)) {
    const keyNorm = key.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (bairroLower.includes(keyNorm) || keyNorm.includes(bairroLower)) {
      return { preco: val, fonte: `Base regional (${key})` };
    }
  }

  // Try cidade
  for (const [key, val] of Object.entries(PRECO_M2_POR_CIDADE)) {
    const keyNorm = key.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (cidadeLower.includes(keyNorm) || keyNorm.includes(cidadeLower)) {
      return { preco: val, fonte: `Base municipal (${key})` };
    }
  }

  // Fallback
  return { preco: 800, fonte: 'Estimativa genérica SP interior (conservadora)' };
}

// ===================== ANALYSIS =====================
function analyzeItem(item: LeilaoItem): AnaliseItem {
  const { preco: precoM2Mercado, fonte } = getPrecoM2(item.cidade, item.bairro);
  const valorMercadoEstimado = precoM2Mercado * item.areaM2;

  // Custos obrigatórios
  const comissaoLeiloeiro = item.lanceInicial * 0.05;   // 5%
  const itbi = item.lanceInicial * 0.04;                // 4%
  const registroEscritura = item.lanceInicial * 0.0175;  // 1.75%
  const custosExtrasTotal = comissaoLeiloeiro + itbi + registroEscritura;

  const investimentoTotal = item.lanceInicial + custosExtrasTotal;
  const lucroBrutoProjetado = valorMercadoEstimado - investimentoTotal;
  const roiEstimado = (lucroBrutoProjetado / investimentoTotal) * 100;
  const desagio = ((valorMercadoEstimado - item.lanceInicial) / valorMercadoEstimado) * 100;

  return {
    ...item,
    precoM2Mercado,
    valorMercadoEstimado,
    comissaoLeiloeiro,
    itbi,
    registroEscritura,
    custosExtrasTotal,
    investimentoTotal,
    lucroBrutoProjetado,
    roiEstimado,
    desagio,
    fontePrecoMercado: fonte,
  };
}

// ===================== REPORT =====================
function fmt(n: number): string {
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function generateRanking(items: AnaliseItem[]): string {
  // Filter ROI >= 20% and sort descending
  const viable = items
    .filter(i => i.roiEstimado >= 20)
    .sort((a, b) => b.roiEstimado - a.roiEstimado);

  const top5 = viable.slice(0, 5);

  let report = '';
  report += `\n╔══════════════════════════════════════════════════════════════════╗\n`;
  report += `║         COUSINSERVICES — ANÁLISE DE OPORTUNIDADES             ║\n`;
  report += `║             Top 5 Terrenos com Maior ROI                      ║\n`;
  report += `╚══════════════════════════════════════════════════════════════════╝\n\n`;
  report += `📅 ${new Date().toLocaleString('pt-BR')}\n`;
  report += `📊 ${items.length} terrenos analisados | ${viable.length} com ROI ≥ 20%\n\n`;
  report += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

  if (top5.length === 0) {
    report += `  ⚠️ Nenhuma oportunidade com ROI ≥ 20% encontrada.\n`;
    return report;
  }

  for (let i = 0; i < top5.length; i++) {
    const t = top5[i];
    report += `📍 #${i + 1} — ${t.bairro}/${t.cidade} — Terreno de ${t.areaM2.toLocaleString('pt-BR')}m²\n\n`;
    report += `  Status: ${t.status} | ${t.tipoLeilao} | Data: ${new Date(t.dataLeilao).toLocaleDateString('pt-BR')}\n`;
    report += `  Leiloeiro: ${t.leiloeiro}\n`;
    report += `  CEP: ${t.cep || 'Não informado'}\n`;
    report += `  Endereço: ${t.endereco.substring(0, 80)}\n\n`;
    report += `  Lance Inicial:              ${fmt(t.lanceInicial).padStart(18)} (${fmt(t.lanceInicial / t.areaM2)}/m²)\n`;
    report += `  Valor de Mercado Estimado:  ${fmt(t.valorMercadoEstimado).padStart(18)} (${fmt(t.precoM2Mercado)}/m²)\n`;
    report += `  Fonte do preço:             ${t.fontePrecoMercado}\n\n`;
    report += `  Custos Extras Estimados:\n`;
    report += `    Comissão Leiloeiro (5%):  ${fmt(t.comissaoLeiloeiro).padStart(18)}\n`;
    report += `    ITBI (4%):               ${fmt(t.itbi).padStart(18)}\n`;
    report += `    Registro/Escritura:       ${fmt(t.registroEscritura).padStart(18)}\n`;
    report += `    TOTAL:                   ${fmt(t.custosExtrasTotal).padStart(18)}\n\n`;
    report += `  🎯 Investimento Total:      ${fmt(t.investimentoTotal).padStart(18)}\n`;
    report += `  💰 Lucro Projetado:         ${fmt(t.lucroBrutoProjetado).padStart(18)}\n`;
    report += `  🏆 ROI Estimado:            ${t.roiEstimado.toFixed(1).padStart(17)}%\n`;
    report += `  📉 Deságio:                 ${t.desagio.toFixed(1).padStart(17)}%\n\n`;

    const warnings: string[] = [];
    if (t.roiEstimado > 500) warnings.push('ROI muito alto — validar preço de mercado com anúncios reais');
    if (t.tipoLeilao === 'Judicial') warnings.push('Leilão judicial — verificar embargos');
    if (!t.cep) warnings.push('CEP não disponível — confirmar localização');
    if (warnings.length === 0) warnings.push('Consulte o edital completo antes de investir');
    report += `  ⚠️ ${warnings.join('. ')}.\n`;
    report += `  🔗 ${t.url}\n`;
    report += `\n${'─'.repeat(66)}\n\n`;
  }

  report += `📌 Custos calculados: Comissão 5% + ITBI 4% + Cartório 1.75%\n`;
  report += `📌 Preços de mercado baseados em tabela FipeZAP/ZAP Imóveis regionais\n`;
  report += `\n© CousinServices ${new Date().getFullYear()}\n`;

  return report;
}

// ===================== MAIN =====================
async function main() {
  const inputPath = path.resolve(process.cwd(), 'leiloes.json');

  if (!fs.existsSync(inputPath)) {
    console.error('❌ Arquivo leiloes.json não encontrado!');
    console.error('   Execute primeiro: npx tsx src/scripts/scraper-playwright.ts');
    process.exit(1);
  }

  console.log(`📂 Lendo ${inputPath}...`);
  const data = JSON.parse(fs.readFileSync(inputPath, 'utf-8'));
  const items: LeilaoItem[] = data.items;

  console.log(`📊 ${items.length} terrenos carregados de ${Object.keys(data.sources || {}).length} fontes\n`);

  // Analyze each item
  console.log('🧮 Calculando análise financeira...\n');
  const analyzed = items.map(item => analyzeItem(item));

  // Generate ranking
  const report = generateRanking(analyzed);
  console.log(report);

  // Save analysis results
  const outputDir = path.resolve(process.cwd(), 'reports');
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
  const reportPath = path.join(outputDir, `analise-${timestamp}.txt`);
  fs.writeFileSync(reportPath, report, 'utf-8');

  // Save full analysis JSON for the bot
  const analysisJsonPath = path.resolve(process.cwd(), 'analise-resultado.json');
  fs.writeFileSync(analysisJsonPath, JSON.stringify({
    generatedAt: new Date().toISOString(),
    totalAnalyzed: analyzed.length,
    viableCount: analyzed.filter(a => a.roiEstimado >= 20).length,
    items: analyzed.sort((a, b) => b.roiEstimado - a.roiEstimado),
  }, null, 2), 'utf-8');

  console.log(`\n💾 Relatório salvo em: ${reportPath}`);
  console.log(`📊 Análise JSON salva em: ${analysisJsonPath}`);
  console.log(`\n✅ Análise completa!`);
}

main().catch(err => {
  console.error(`💥 Erro: ${err.message}`);
  process.exit(1);
});
