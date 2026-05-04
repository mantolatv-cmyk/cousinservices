// ============================================================
// CousinServices — Script Principal de Scraping & Relatório
// Executa scraping real, análise financeira e gera relatório
// ============================================================
// Usage: npx tsx src/scripts/run-scraper.ts
// ============================================================

import { runAllScrapers, consolidateLots, ScrapeResult } from '../lib/scrapers/index';
import { ScrapedLot } from '../lib/scrapers/base';
import { getRegionByBairro, spRegions } from '../data/spRegions';
import { calculateHiddenCosts } from '../lib/analysis/costCalculator';
import { AuctionLot, HiddenCosts, InvestmentAnalysis } from '../lib/types';
import * as fs from 'fs';
import * as path from 'path';

// ===================== CONFIGURATION =====================
const CONFIG = {
  MIN_ROI: 20,              // Minimum ROI threshold (%)
  TOP_N: 10,                // Number of top opportunities to show
  OUTPUT_DIR: path.resolve(process.cwd(), 'reports'),
};

// ===================== CONVERSION =====================
function scrapedToAuctionLot(scraped: ScrapedLot, idx: number): AuctionLot {
  const region = getRegionByBairro(scraped.bairro);
  const precoM2Mercado = region?.precoM2MedioTerreno || estimateMarketPrice(scraped.bairro, scraped.cidade);
  const valorMercadoEstimado = precoM2Mercado * scraped.areaM2;

  return {
    id: `scraped-${scraped.source.toLowerCase().replace(/\s/g, '-')}-${idx}`,
    source: scraped.source as AuctionLot['source'],
    sourceUrl: scraped.sourceUrl,
    editalUrl: scraped.editalUrl,
    endereco: scraped.endereco,
    bairro: scraped.bairro,
    cidade: scraped.cidade,
    estado: scraped.estado,
    zona: region?.zona,
    areaM2: scraped.areaM2,
    tipo: scraped.tipo,
    descricao: scraped.descricao,
    status: scraped.status,
    tipoLeilao: scraped.tipoLeilao,
    dataLeilao: scraped.dataLeilao,
    leiloeiro: scraped.leiloeiro,
    valorAvaliacao: scraped.valorAvaliacao,
    lanceInicial: scraped.lanceInicial,
    dividaIPTU: scraped.dividaIPTU,
    dividaCondominio: scraped.dividaCondominio,
    valorMercadoEstimado,
    precoM2Mercado,
    scrapedAt: new Date().toISOString(),
    imageUrl: scraped.imageUrl,
  };
}

function estimateMarketPrice(bairro: string, cidade: string): number {
  // Try fuzzy match on bairro
  const found = spRegions.find(r =>
    r.bairro.toLowerCase().includes(bairro.toLowerCase()) ||
    bairro.toLowerCase().includes(r.bairro.toLowerCase())
  );
  if (found) return found.precoM2MedioTerreno;

  // City-level fallback
  const cityAvg: Record<string, number> = {
    'São Paulo': 8000,
    'Guarulhos': 3500,
    'Osasco': 5000,
    'Campinas': 4500,
    'Santos': 6000,
    'Sorocaba': 3000,
  };
  return cityAvg[cidade] || 4000;
}

// ===================== ANALYSIS =====================
function analyzeAuctionLot(lot: AuctionLot): AuctionLot {
  const custosOcultos = calculateHiddenCosts(lot);
  const investimentoTotal = lot.lanceInicial + custosOcultos.total;
  const valorMercado = lot.valorMercadoEstimado || lot.lanceInicial * 1.3;
  const precoM2Leilao = lot.lanceInicial / lot.areaM2;
  const precoM2Mercado = lot.precoM2Mercado || valorMercado / lot.areaM2;
  const desagio = ((valorMercado - lot.lanceInicial) / valorMercado) * 100;
  const lucroBrutoProjetado = valorMercado - investimentoTotal;
  const roiEstimado = (lucroBrutoProjetado / investimentoTotal) * 100;

  const region = getRegionByBairro(lot.bairro);
  const liquidez = region?.liquidez || 5;
  const roiNorm = Math.min(Math.max(roiEstimado, 0), 100);
  const scoreComposto = (roiNorm * 0.7) + (liquidez * 10 * 0.3);

  lot.analysis = {
    lanceConsiderado: lot.lanceInicial,
    custosOcultos,
    investimentoTotal,
    valorMercadoEstimado: valorMercado,
    desagio,
    lucroBrutoProjetado,
    roiEstimado,
    precoM2Leilao,
    precoM2Mercado,
    liquidez,
    scoreComposto,
  };

  return lot;
}

// ===================== REPORT GENERATION =====================
function fmt(n: number): string {
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function pct(n: number): string {
  return `${n.toFixed(1)}%`;
}

function generateReport(
  allLots: AuctionLot[],
  scrapeResults: ScrapeResult[],
): string {
  const now = new Date();
  const dateStr = now.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

  // Filter and rank
  const viable = allLots
    .filter(l => l.analysis && l.analysis.roiEstimado >= CONFIG.MIN_ROI)
    .sort((a, b) => (b.analysis?.scoreComposto || 0) - (a.analysis?.scoreComposto || 0));

  const top = viable.slice(0, CONFIG.TOP_N);

  // Stats
  const totalScraped = allLots.length;
  const totalViable = viable.length;
  const bestROI = viable.length > 0 ? Math.max(...viable.map(l => l.analysis!.roiEstimado)) : 0;
  const avgDesagio = viable.length > 0
    ? viable.reduce((s, l) => s + l.analysis!.desagio, 0) / viable.length
    : 0;
  const totalLucroPotencial = viable.reduce((s, l) => s + Math.max(0, l.analysis!.lucroBrutoProjetado), 0);
  const minInvestimento = viable.length > 0
    ? Math.min(...viable.map(l => l.analysis!.investimentoTotal))
    : 0;

  let report = '';

  // Header
  report += `\n`;
  report += `╔══════════════════════════════════════════════════════════════════╗\n`;
  report += `║            COUSINSERVICES — RELATÓRIO DE OPORTUNIDADES         ║\n`;
  report += `║                  Especialista em Terrenos — SP                 ║\n`;
  report += `╚══════════════════════════════════════════════════════════════════╝\n`;
  report += `\n`;
  report += `📅 Data do Relatório: ${dateStr}\n`;
  report += `🤖 Gerado automaticamente pelo motor de análise CousinServices\n`;
  report += `\n`;

  // Scraping Summary
  report += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
  report += `📡 RESUMO DO SCRAPING\n`;
  report += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
  for (const r of scrapeResults) {
    const icon = r.status === 'success' ? '✅' : r.status === 'no-results' ? '⚠️' : '❌';
    report += `  ${icon} ${r.source.padEnd(20)} | ${String(r.lots.length).padStart(3)} lotes | ${(r.durationMs / 1000).toFixed(1)}s`;
    if (r.error) report += ` | Erro: ${r.error}`;
    report += `\n`;
  }
  report += `\n`;

  // KPIs
  report += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
  report += `📊 INDICADORES GERAIS\n`;
  report += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
  report += `  Total de terrenos encontrados:  ${totalScraped}\n`;
  report += `  Oportunidades viáveis (ROI≥${CONFIG.MIN_ROI}%): ${totalViable}\n`;
  report += `  Melhor ROI encontrado:          ${pct(bestROI)}\n`;
  report += `  Deságio médio:                  ${pct(avgDesagio)}\n`;
  report += `  Lucro potencial total:          ${fmt(totalLucroPotencial)}\n`;
  report += `  Menor investimento necessário:  ${fmt(minInvestimento)}\n`;
  report += `\n`;

  // Top Opportunities
  report += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
  report += `🏆 TOP ${Math.min(CONFIG.TOP_N, top.length)} MELHORES OPORTUNIDADES\n`;
  report += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
  report += `\n`;

  if (top.length === 0) {
    report += `  ⚠️  Nenhuma oportunidade encontrada com ROI ≥ ${CONFIG.MIN_ROI}%.\n`;
    report += `      Tente reduzir o threshold de ROI ou ampliar as fontes.\n\n`;
  }

  for (let i = 0; i < top.length; i++) {
    const lot = top[i];
    const a = lot.analysis!;
    report += generateLotEntry(lot, a, i + 1);
  }

  // Rejected
  const rejected = allLots.filter(l => l.analysis && l.analysis.roiEstimado < CONFIG.MIN_ROI);
  if (rejected.length > 0) {
    report += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    report += `🚫 OPORTUNIDADES DESCARTADAS (ROI < ${CONFIG.MIN_ROI}%): ${rejected.length} terrenos\n`;
    report += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    for (const lot of rejected.slice(0, 5)) {
      const a = lot.analysis!;
      report += `  ❌ ${lot.bairro}/${lot.cidade} — ${lot.areaM2}m² | Lance: ${fmt(a.lanceConsiderado)} | ROI: ${pct(a.roiEstimado)}\n`;
    }
    if (rejected.length > 5) {
      report += `  ... e mais ${rejected.length - 5} terrenos descartados.\n`;
    }
    report += `\n`;
  }

  // Footer
  report += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
  report += `📌 NOTAS IMPORTANTES\n`;
  report += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
  report += `  • Valores de mercado estimados com base na tabela FipeZAP e\n`;
  report += `    médias regionais. Recomenda-se validação adicional.\n`;
  report += `  • Custos extras incluem: Comissão (5%), ITBI (3-4%), Cartório (1.75%).\n`;
  report += `  • Dívidas de IPTU/Condomínio foram somadas quando identificadas.\n`;
  report += `  • Score composto = 70% ROI + 30% Liquidez da região.\n`;
  report += `  • Sempre consulte o edital completo antes de investir.\n`;
  report += `\n`;
  report += `  © CousinServices ${now.getFullYear()} — Plataforma de Inteligência Imobiliária\n`;
  report += `╚══════════════════════════════════════════════════════════════════╝\n`;

  return report;
}

function generateLotEntry(lot: AuctionLot, a: InvestmentAnalysis, rank: number): string {
  let entry = '';

  entry += `  ┌─────────────────────────────────────────────────────────────┐\n`;
  entry += `  │ #${rank} 📍 ${lot.bairro}/${lot.cidade} — Terreno de ${lot.areaM2.toLocaleString('pt-BR')}m²\n`;
  entry += `  ├─────────────────────────────────────────────────────────────┤\n`;
  entry += `  │\n`;
  entry += `  │  Status: ${lot.status} | Tipo: ${lot.tipoLeilao}\n`;
  entry += `  │  Data do Leilão: ${new Date(lot.dataLeilao).toLocaleDateString('pt-BR')}\n`;
  entry += `  │  Leiloeiro: ${lot.leiloeiro}\n`;
  entry += `  │  Endereço: ${lot.endereco}\n`;
  entry += `  │  Fonte: ${lot.source}\n`;
  entry += `  │\n`;
  entry += `  │  💰 Lance Inicial:           ${fmt(a.lanceConsiderado).padStart(18)} (${fmt(a.precoM2Leilao)}/m²)\n`;
  entry += `  │  📈 Valor de Mercado Est.:    ${fmt(a.valorMercadoEstimado).padStart(18)} (${fmt(a.precoM2Mercado)}/m²)\n`;
  entry += `  │\n`;
  entry += `  │  💸 Custos Extras Estimados:\n`;
  entry += `  │     Comissão Leiloeiro (5%):  ${fmt(a.custosOcultos.comissaoLeiloeiro).padStart(18)}\n`;
  entry += `  │     ITBI:                     ${fmt(a.custosOcultos.itbi).padStart(18)}\n`;
  entry += `  │     Registro/Escritura:       ${fmt(a.custosOcultos.registroEscritura).padStart(18)}\n`;
  if (a.custosOcultos.dividasIPTU > 0) {
    entry += `  │     Dívida IPTU:              ${fmt(a.custosOcultos.dividasIPTU).padStart(18)}\n`;
  }
  if (a.custosOcultos.dividasCondominio > 0) {
    entry += `  │     Dívida Condomínio:        ${fmt(a.custosOcultos.dividasCondominio).padStart(18)}\n`;
  }
  entry += `  │     TOTAL CUSTOS:             ${fmt(a.custosOcultos.total).padStart(18)}\n`;
  entry += `  │\n`;
  entry += `  │  🎯 Investimento Total:       ${fmt(a.investimentoTotal).padStart(18)}\n`;
  entry += `  │  📊 Lucro Projetado:          ${fmt(a.lucroBrutoProjetado).padStart(18)}\n`;
  entry += `  │  🏆 ROI Estimado:             ${pct(a.roiEstimado).padStart(18)}\n`;
  entry += `  │  📉 Deságio:                  ${pct(a.desagio).padStart(18)}\n`;
  entry += `  │  🔄 Liquidez da Região:       ${String(a.liquidez + '/10').padStart(18)}\n`;
  entry += `  │  ⭐ Score Composto:           ${a.scoreComposto.toFixed(1).padStart(18)} pts\n`;
  entry += `  │\n`;

  // Attention points
  const warnings: string[] = [];
  if (a.custosOcultos.dividasIPTU > 0) warnings.push(`Dívida IPTU de ${fmt(a.custosOcultos.dividasIPTU)}`);
  if (a.custosOcultos.dividasCondominio > 0) warnings.push(`Dívida condomínio de ${fmt(a.custosOcultos.dividasCondominio)}`);
  if (lot.tipoLeilao === 'Judicial') warnings.push('Leilão judicial — verifique embargos');
  if (a.liquidez <= 4) warnings.push('Região com liquidez baixa');
  if (warnings.length === 0) warnings.push('Sem restrições aparentes — consulte o edital');

  entry += `  │  ⚠️  ${warnings.join('. ')}.\n`;
  entry += `  │\n`;
  if (lot.sourceUrl) {
    entry += `  │  🔗 ${lot.sourceUrl}\n`;
  }
  entry += `  └─────────────────────────────────────────────────────────────┘\n`;
  entry += `\n`;

  return entry;
}

// ===================== MAIN EXECUTION =====================
async function main() {
  console.log(`\n🚀 CousinServices — Motor de Scraping & Análise v1.0`);
  console.log(`📅 ${new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}`);
  console.log(`${'═'.repeat(60)}\n`);

  // Phase 1: Scraping
  console.log(`\n📡 FASE 1 — Scraping de fontes de dados...\n`);
  let scrapeResults: ScrapeResult[];
  let scrapedLots: ScrapedLot[];

  try {
    scrapeResults = await runAllScrapers();
    scrapedLots = consolidateLots(scrapeResults);
  } catch (err) {
    console.error(`\n❌ Erro fatal no scraping: ${(err as Error).message}`);
    console.log(`\n📋 Usando dados de fallback (mock) para demonstrar a pipeline completa...\n`);

    // Fallback to mock data for demonstration
    const { mockAuctions } = await import('../data/mockAuctions');
    scrapedLots = mockAuctions.map(m => ({
      source: m.source,
      sourceUrl: m.sourceUrl,
      endereco: m.endereco,
      bairro: m.bairro,
      cidade: m.cidade,
      estado: m.estado,
      areaM2: m.areaM2,
      tipo: m.tipo,
      descricao: m.descricao || '',
      status: m.status,
      tipoLeilao: m.tipoLeilao,
      dataLeilao: m.dataLeilao,
      leiloeiro: m.leiloeiro,
      valorAvaliacao: m.valorAvaliacao,
      lanceInicial: m.lanceInicial,
      dividaIPTU: m.dividaIPTU,
      dividaCondominio: m.dividaCondominio,
    }));

    scrapeResults = [{
      source: 'Dados de Fallback (Mock)',
      status: 'success',
      lots: scrapedLots,
      durationMs: 0,
    }];
  }

  console.log(`\n📊 Total de lotes coletados: ${scrapedLots.length}\n`);

  // Phase 2: Analysis
  console.log(`\n💰 FASE 2 — Análise financeira e cálculo de ROI...\n`);

  const auctionLots: AuctionLot[] = scrapedLots.map((sl, idx) => {
    const lot = scrapedToAuctionLot(sl, idx);
    return analyzeAuctionLot(lot);
  });

  const viable = auctionLots.filter(l => l.analysis && l.analysis.roiEstimado >= CONFIG.MIN_ROI);
  console.log(`  ✅ ${auctionLots.length} terrenos analisados`);
  console.log(`  ✅ ${viable.length} oportunidades com ROI ≥ ${CONFIG.MIN_ROI}%`);
  console.log(`  ❌ ${auctionLots.length - viable.length} descartados (ROI insuficiente)`);

  // Phase 3: Report Generation
  console.log(`\n📝 FASE 3 — Gerando relatório final...\n`);

  const report = generateReport(auctionLots, scrapeResults);

  // Print to console
  console.log(report);

  // Save to file
  if (!fs.existsSync(CONFIG.OUTPUT_DIR)) {
    fs.mkdirSync(CONFIG.OUTPUT_DIR, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
  const filePath = path.join(CONFIG.OUTPUT_DIR, `relatorio-${timestamp}.txt`);
  fs.writeFileSync(filePath, report, 'utf-8');
  console.log(`\n💾 Relatório salvo em: ${filePath}`);

  // Also save JSON data for dashboard consumption
  const jsonPath = path.join(CONFIG.OUTPUT_DIR, `dados-${timestamp}.json`);
  fs.writeFileSync(jsonPath, JSON.stringify({
    generatedAt: new Date().toISOString(),
    scrapeResults: scrapeResults.map(r => ({ source: r.source, status: r.status, count: r.lots.length, durationMs: r.durationMs })),
    totalLots: auctionLots.length,
    viableLots: viable.length,
    opportunities: viable.sort((a, b) => (b.analysis?.scoreComposto || 0) - (a.analysis?.scoreComposto || 0)).map(l => ({
      id: l.id,
      bairro: l.bairro,
      cidade: l.cidade,
      areaM2: l.areaM2,
      lanceInicial: l.lanceInicial,
      valorMercado: l.analysis?.valorMercadoEstimado,
      investimentoTotal: l.analysis?.investimentoTotal,
      lucroProjetado: l.analysis?.lucroBrutoProjetado,
      roi: l.analysis?.roiEstimado,
      desagio: l.analysis?.desagio,
      liquidez: l.analysis?.liquidez,
      score: l.analysis?.scoreComposto,
      source: l.source,
      sourceUrl: l.sourceUrl,
    })),
  }, null, 2), 'utf-8');
  console.log(`📊 Dados JSON salvos em: ${jsonPath}`);
  console.log(`\n✅ Pipeline completa!\n`);
}

main().catch(err => {
  console.error(`\n💥 Erro fatal: ${err.message}`);
  process.exit(1);
});
