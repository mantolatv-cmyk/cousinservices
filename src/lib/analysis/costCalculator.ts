// ============================================================
// CousinServices — Calculadora de Custos Ocultos
// Calcula todos os custos adicionais de uma operação de leilão
// ============================================================

import { AuctionLot, HiddenCosts } from '@/lib/types';

// Tax rates by municipality type
const ITBI_RATES: Record<string, number> = {
  'São Paulo': 0.03,        // 3%
  'Guarulhos': 0.03,
  'Osasco': 0.035,
  'São Bernardo do Campo': 0.03,
  'Santo André': 0.03,
  'São Caetano do Sul': 0.03,
  'Barueri': 0.035,
  'Diadema': 0.03,
  'Mauá': 0.03,
  'Cotia': 0.04,
  'Taboão da Serra': 0.035,
  'Carapicuíba': 0.04,
  'default': 0.035,         // 3.5% default
};

const COMISSAO_LEILOEIRO = 0.05;           // 5%
const REGISTRO_ESCRITURA_MIN = 0.015;      // 1.5%
const REGISTRO_ESCRITURA_MAX = 0.02;       // 2%

export function calculateHiddenCosts(lot: AuctionLot): HiddenCosts {
  const lance = lot.lanceInicial;

  // Comissão do leiloeiro: 5% do lance
  const comissaoLeiloeiro = lance * COMISSAO_LEILOEIRO;

  // ITBI: varies by municipality
  const itbiRate = ITBI_RATES[lot.cidade] || ITBI_RATES['default'];
  const itbi = lance * itbiRate;

  // Registro e escritura: 1.5-2% (using average 1.75%)
  const registroEscritura = lance * ((REGISTRO_ESCRITURA_MIN + REGISTRO_ESCRITURA_MAX) / 2);

  // Dívidas mencionadas no edital
  const dividasIPTU = lot.dividaIPTU || 0;
  const dividasCondominio = lot.dividaCondominio || 0;

  const total = comissaoLeiloeiro + itbi + registroEscritura + dividasIPTU + dividasCondominio;

  return {
    comissaoLeiloeiro,
    itbi,
    registroEscritura,
    dividasIPTU,
    dividasCondominio,
    total,
  };
}

export function formatCostBreakdown(costs: HiddenCosts): string {
  const lines = [
    `Comissão Leiloeiro (5%): R$ ${costs.comissaoLeiloeiro.toLocaleString('pt-BR')}`,
    `ITBI: R$ ${costs.itbi.toLocaleString('pt-BR')}`,
    `Registro/Escritura: R$ ${costs.registroEscritura.toLocaleString('pt-BR')}`,
  ];

  if (costs.dividasIPTU > 0) {
    lines.push(`Dívida IPTU: R$ ${costs.dividasIPTU.toLocaleString('pt-BR')}`);
  }
  if (costs.dividasCondominio > 0) {
    lines.push(`Dívida Condomínio: R$ ${costs.dividasCondominio.toLocaleString('pt-BR')}`);
  }

  lines.push(`TOTAL: R$ ${costs.total.toLocaleString('pt-BR')}`);
  return lines.join('\n');
}
