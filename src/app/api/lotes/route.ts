// ============================================================
// CousinServices — API Route: /api/lotes
// Fonte Única de Verdade — serve dados reais para dashboard + bot
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import * as fs from 'fs';
import * as path from 'path';
import type { AuctionLot, AuctionSource, HiddenCosts, InvestmentAnalysis } from '@/lib/types';

interface RawAnaliseItem {
  id: string;
  fonte: string;
  url: string;
  endereco: string;
  bairro: string;
  cidade: string;
  estado: string;
  cep: string;
  areaM2: number;
  lanceInicial: number;
  valorAvaliacao: number;
  status: string;
  tipoLeilao: string;
  dataLeilao: string;
  leiloeiro: string;
  descricao: string;
  scrapedAt: string;
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

function cleanBairro(raw: string): string {
  // Remove newlines and extra whitespace from scraped bairro
  return raw.split('\n')[0].trim();
}

function cleanCidade(raw: string): string {
  // Remove "Terreno\n" prefix that scraper sometimes adds
  return raw.replace(/^(Terreno|Desocupado|Área Rural)\n/gi, '').trim();
}

function mapSource(fonte: string): AuctionSource {
  if (fonte.includes('Zuk')) return 'Portal Zuk';
  if (fonte.includes('Mega')) return 'Mega Leilões';
  if (fonte.includes('Sodré')) return 'Sodré Santoro';
  if (fonte.includes('Milan')) return 'Milan Leilões';
  if (fonte.includes('Freitas')) return 'Freitas Leiloeiro';
  if (fonte.includes('Caixa')) return 'Caixa Econômica';
  return 'Portal Zuk';
}

function convertToAuctionLot(raw: RawAnaliseItem): AuctionLot {
  const bairro = cleanBairro(raw.bairro);
  const cidade = cleanCidade(raw.cidade);
  const precoM2Leilao = raw.areaM2 > 0 ? raw.lanceInicial / raw.areaM2 : 0;
  const liquidez = 5; // Default — will be enriched by spRegions later

  const custosOcultos: HiddenCosts = {
    comissaoLeiloeiro: raw.comissaoLeiloeiro,
    itbi: raw.itbi,
    registroEscritura: raw.registroEscritura,
    dividasIPTU: 0,
    dividasCondominio: 0,
    total: raw.custosExtrasTotal,
  };

  const roiCapped = Math.min(raw.roiEstimado, 100);
  const scoreComposto = (roiCapped * 0.7) + (liquidez * 10 * 0.3);

  const analysis: InvestmentAnalysis = {
    lanceConsiderado: raw.lanceInicial,
    custosOcultos,
    investimentoTotal: raw.investimentoTotal,
    valorMercadoEstimado: raw.valorMercadoEstimado,
    desagio: raw.desagio,
    lucroBrutoProjetado: raw.lucroBrutoProjetado,
    roiEstimado: raw.roiEstimado,
    precoM2Leilao,
    precoM2Mercado: raw.precoM2Mercado,
    liquidez,
    scoreComposto,
  };

  return {
    id: raw.id,
    source: mapSource(raw.fonte),
    sourceUrl: raw.url,
    endereco: raw.endereco.replace(/\n\s+/g, ' ').trim(),
    bairro,
    cidade,
    estado: raw.estado,
    cep: raw.cep || undefined,
    areaM2: raw.areaM2,
    tipo: 'Terreno',
    descricao: raw.descricao?.replace(/\n/g, ' ').trim(),
    status: raw.status as AuctionLot['status'],
    tipoLeilao: raw.tipoLeilao as AuctionLot['tipoLeilao'],
    dataLeilao: raw.dataLeilao,
    leiloeiro: raw.leiloeiro,
    valorAvaliacao: raw.valorAvaliacao,
    lanceInicial: raw.lanceInicial,
    valorMercadoEstimado: raw.valorMercadoEstimado,
    precoM2Mercado: raw.precoM2Mercado,
    analysis,
    scrapedAt: raw.scrapedAt,
  };
}

function loadData(): { lots: AuctionLot[]; generatedAt: string; source: string } {
  // Priority: analise-resultado.json > reports/dados-*.json > mock
  const analysisPath = path.resolve(process.cwd(), 'analise-resultado.json');
  if (fs.existsSync(analysisPath)) {
    const data = JSON.parse(fs.readFileSync(analysisPath, 'utf-8'));
    const rawItems: RawAnaliseItem[] = data.items || [];
    // Deduplicate by id
    const seen = new Set<string>();
    const unique = rawItems.filter(item => {
      const key = `${item.endereco}-${item.areaM2}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    return {
      lots: unique.map(convertToAuctionLot),
      generatedAt: data.generatedAt,
      source: 'analise-resultado.json (dados reais)',
    };
  }

  return { lots: [], generatedAt: new Date().toISOString(), source: 'nenhum dado disponível' };
}

export async function GET(req: NextRequest) {
  const { lots, generatedAt, source } = loadData();

  // Parse query params for optional filtering
  const url = new URL(req.url);
  const cidade = url.searchParams.get('cidade');
  const minROI = parseFloat(url.searchParams.get('minROI') || '0');
  const tipo = url.searchParams.get('tipo');
  const sortBy = url.searchParams.get('sort') || 'score';

  let filtered = lots;

  if (cidade) {
    const q = cidade.toLowerCase();
    filtered = filtered.filter(l =>
      l.cidade.toLowerCase().includes(q) ||
      l.bairro.toLowerCase().includes(q) ||
      l.endereco.toLowerCase().includes(q)
    );
  }

  if (minROI > 0) {
    filtered = filtered.filter(l => (l.analysis?.roiEstimado || 0) >= minROI);
  }

  if (tipo && tipo !== 'Todos') {
    filtered = filtered.filter(l => l.tipoLeilao === tipo);
  }

  // Sort
  filtered.sort((a, b) => {
    const aa = a.analysis, bb = b.analysis;
    if (!aa || !bb) return 0;
    switch (sortBy) {
      case 'roi': return bb.roiEstimado - aa.roiEstimado;
      case 'desagio': return bb.desagio - aa.desagio;
      case 'preco': return aa.investimentoTotal - bb.investimentoTotal;
      case 'area': return b.areaM2 - a.areaM2;
      default: return bb.scoreComposto - aa.scoreComposto;
    }
  });

  return NextResponse.json({
    generatedAt,
    source,
    total: filtered.length,
    lots: filtered,
  });
}
