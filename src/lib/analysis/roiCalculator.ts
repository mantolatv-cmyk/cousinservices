// ============================================================
// CousinServices — Calculadora de ROI e Análise de Investimento
// ============================================================

import { AuctionLot, InvestmentAnalysis } from '@/lib/types';
import { calculateHiddenCosts } from './costCalculator';
import { getRegionByBairro } from '@/data/spRegions';

export function analyzeInvestment(lot: AuctionLot): InvestmentAnalysis {
  // Step 1: Get market price estimate
  const region = getRegionByBairro(lot.bairro);
  const precoM2Mercado = lot.precoM2Mercado || region?.precoM2MedioTerreno || 5000;
  const valorMercadoEstimado = lot.valorMercadoEstimado || (precoM2Mercado * lot.areaM2);

  // Step 2: Calculate hidden costs
  const custosOcultos = calculateHiddenCosts(lot);

  // Step 3: Calculate total investment
  const lanceConsiderado = lot.lanceInicial;
  const investimentoTotal = lanceConsiderado + custosOcultos.total;

  // Step 4: Calculate metrics
  const precoM2Leilao = lanceConsiderado / lot.areaM2;
  const desagio = ((valorMercadoEstimado - lanceConsiderado) / valorMercadoEstimado) * 100;
  const lucroBrutoProjetado = valorMercadoEstimado - investimentoTotal;
  const roiEstimado = (lucroBrutoProjetado / investimentoTotal) * 100;

  // Step 5: Calculate liquidity score
  const liquidez = region?.liquidez || 5;

  // Step 6: Composite score (70% ROI + 30% Liquidity normalized to 0-100)
  const roiNormalized = Math.min(Math.max(roiEstimado, 0), 100);
  const liquidezNormalized = liquidez * 10;
  const scoreComposto = (roiNormalized * 0.7) + (liquidezNormalized * 0.3);

  return {
    lanceConsiderado,
    custosOcultos,
    investimentoTotal,
    valorMercadoEstimado,
    desagio,
    lucroBrutoProjetado,
    roiEstimado,
    precoM2Leilao,
    precoM2Mercado,
    liquidez,
    scoreComposto,
  };
}

export function enrichLotWithAnalysis(lot: AuctionLot): AuctionLot {
  const region = getRegionByBairro(lot.bairro);

  // Set market data if not already set
  if (!lot.precoM2Mercado && region) {
    lot.precoM2Mercado = region.precoM2MedioTerreno;
  }
  if (!lot.valorMercadoEstimado && lot.precoM2Mercado) {
    lot.valorMercadoEstimado = lot.precoM2Mercado * lot.areaM2;
  }

  lot.analysis = analyzeInvestment(lot);
  return lot;
}
