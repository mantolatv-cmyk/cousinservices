// ============================================================
// CousinServices — Engine de Ranqueamento
// Filtra e ordena oportunidades por ROI e liquidez
// ============================================================

import { AuctionLot, FilterState, DashboardMetrics } from '@/lib/types';
import { enrichLotWithAnalysis } from './roiCalculator';

const DEFAULT_MIN_ROI = 20; // Minimum ROI threshold

export function processAndRankLots(
  lots: AuctionLot[],
  filters?: Partial<FilterState>
): AuctionLot[] {
  // Step 1: Enrich all lots with analysis
  const enrichedLots = lots.map(lot => enrichLotWithAnalysis({ ...lot }));

  // Step 2: Apply filters
  let filtered = enrichedLots.filter(lot => {
    if (!lot.analysis) return false;

    // ROI minimum filter
    const minROI = filters?.roiMinimo ?? DEFAULT_MIN_ROI;
    if (lot.analysis.roiEstimado < minROI) return false;

    // Region filter
    if (filters?.regiao && filters.regiao !== 'Todos' && filters.regiao !== '') {
      if (lot.bairro !== filters.regiao) return false;
    }

    // Zone filter
    if (filters?.zona && filters.zona !== 'Todas' && filters.zona !== '') {
      if (lot.zona !== filters.zona) return false;
    }

    // Area filter
    if (filters?.areaMinima && lot.areaM2 < filters.areaMinima) return false;
    if (filters?.areaMaxima && lot.areaM2 > filters.areaMaxima) return false;

    // Auction type filter
    if (filters?.tipoLeilao && filters.tipoLeilao !== 'Todos' && filters.tipoLeilao !== '') {
      if (lot.tipoLeilao !== filters.tipoLeilao) return false;
    }

    return true;
  });

  // Step 3: Sort by composite score (ROI + Liquidity)
  const sortBy = filters?.ordenarPor || 'roi';
  filtered.sort((a, b) => {
    if (!a.analysis || !b.analysis) return 0;
    switch (sortBy) {
      case 'roi':
        return b.analysis.scoreComposto - a.analysis.scoreComposto;
      case 'desagio':
        return b.analysis.desagio - a.analysis.desagio;
      case 'preco':
        return a.analysis.investimentoTotal - b.analysis.investimentoTotal;
      case 'area':
        return b.areaM2 - a.areaM2;
      default:
        return b.analysis.scoreComposto - a.analysis.scoreComposto;
    }
  });

  return filtered;
}

export function calculateMetrics(lots: AuctionLot[]): DashboardMetrics {
  if (lots.length === 0) {
    return {
      totalOportunidades: 0,
      melhorROI: 0,
      desagioMedio: 0,
      investimentoMinimo: 0,
      lucroPotencialTotal: 0,
      mediaPrecoM2: 0,
    };
  }

  const analyzed = lots.filter(l => l.analysis);

  const melhorROI = Math.max(...analyzed.map(l => l.analysis!.roiEstimado));
  const desagioMedio =
    analyzed.reduce((sum, l) => sum + l.analysis!.desagio, 0) / analyzed.length;
  const investimentoMinimo = Math.min(
    ...analyzed.map(l => l.analysis!.investimentoTotal)
  );
  const lucroPotencialTotal = analyzed.reduce(
    (sum, l) => sum + Math.max(0, l.analysis!.lucroBrutoProjetado),
    0
  );
  const mediaPrecoM2 =
    analyzed.reduce((sum, l) => sum + l.analysis!.precoM2Leilao, 0) / analyzed.length;

  return {
    totalOportunidades: analyzed.length,
    melhorROI,
    desagioMedio,
    investimentoMinimo,
    lucroPotencialTotal,
    mediaPrecoM2,
  };
}

export function getTopOpportunities(
  lots: AuctionLot[],
  count: number = 5,
  filters?: Partial<FilterState>
): AuctionLot[] {
  const ranked = processAndRankLots(lots, filters);
  return ranked.slice(0, count);
}
