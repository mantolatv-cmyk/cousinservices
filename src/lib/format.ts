// ============================================================
// CousinServices — Formatting Utilities
// ============================================================

export function formatCurrency(value: number): string {
  return value.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

export function formatCurrencyCompact(value: number): string {
  if (value >= 1_000_000) {
    return `R$ ${(value / 1_000_000).toFixed(1)}M`;
  }
  if (value >= 1_000) {
    return `R$ ${(value / 1_000).toFixed(0)}K`;
  }
  return formatCurrency(value);
}

export function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}

export function formatArea(m2: number): string {
  return `${m2.toLocaleString('pt-BR')}m²`;
}

export function formatDate(isoDate: string): string {
  const d = new Date(isoDate);
  return d.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

export function formatDateTime(isoDate: string): string {
  const d = new Date(isoDate);
  return d.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function daysUntil(isoDate: string): number {
  const now = new Date();
  const target = new Date(isoDate);
  const diff = target.getTime() - now.getTime();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

export function getAttentionPoints(lot: { dividaIPTU?: number; dividaCondominio?: number; tipoLeilao: string; status: string; bairro: string }): string {
  const points: string[] = [];

  if (lot.dividaIPTU && lot.dividaIPTU > 0) {
    points.push(`Dívida de IPTU de ${formatCurrency(lot.dividaIPTU)} mencionada no edital`);
  }
  if (lot.dividaCondominio && lot.dividaCondominio > 0) {
    points.push(`Dívida de condomínio de ${formatCurrency(lot.dividaCondominio)} pendente`);
  }
  if (lot.tipoLeilao === 'Judicial') {
    points.push('Leilão judicial — verificar situação processual e eventuais embargos');
  }
  if (lot.status === '2ª Praça') {
    points.push('2ª Praça — deságio maior, mas verifique condições do edital');
  }

  if (points.length === 0) {
    points.push('Sem restrições aparentes identificadas. Recomenda-se análise do edital completo');
  }

  return points.join('. ') + '.';
}
