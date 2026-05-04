// ============================================================
// CousinServices — Bot API Route
// Processa comandos do chat bot (/buscar, /top, /ajuda, etc.)
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import * as fs from 'fs';
import * as path from 'path';

interface AnaliseItem {
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
  status: string;
  tipoLeilao: string;
  dataLeilao: string;
  leiloeiro: string;
}

function fmt(n: number): string {
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function loadAnalysisData(): { items: AnaliseItem[]; generatedAt: string } | null {
  // Try analise-resultado.json first, then reports folder
  const paths = [
    path.resolve(process.cwd(), 'analise-resultado.json'),
    path.resolve(process.cwd(), 'reports', 'dados-latest.json'),
  ];

  for (const p of paths) {
    if (fs.existsSync(p)) {
      try {
        return JSON.parse(fs.readFileSync(p, 'utf-8'));
      } catch { continue; }
    }
  }

  // Try any report JSON in reports folder
  const reportsDir = path.resolve(process.cwd(), 'reports');
  if (fs.existsSync(reportsDir)) {
    const files = fs.readdirSync(reportsDir)
      .filter(f => f.startsWith('dados-') && f.endsWith('.json'))
      .sort()
      .reverse();
    if (files.length > 0) {
      try {
        const data = JSON.parse(fs.readFileSync(path.join(reportsDir, files[0]), 'utf-8'));
        // Convert from the other format if needed
        if (data.opportunities) {
          return {
            generatedAt: data.generatedAt,
            items: data.opportunities.map((o: Record<string, unknown>) => ({
              ...o,
              precoM2Mercado: 0,
              valorMercadoEstimado: o.valorMercado || 0,
              comissaoLeiloeiro: (o.lanceInicial as number || 0) * 0.05,
              itbi: (o.lanceInicial as number || 0) * 0.04,
              registroEscritura: (o.lanceInicial as number || 0) * 0.0175,
              custosExtrasTotal: (o.investimentoTotal as number || 0) - (o.lanceInicial as number || 0),
              roiEstimado: o.roi || 0,
              desagio: o.desagio || 0,
              lucroBrutoProjetado: o.lucroProjetado || 0,
            })),
          };
        }
        return data;
      } catch { /* ignore */ }
    }
  }

  return null;
}

function formatLotReport(item: AnaliseItem, rank?: number): string {
  const prefix = rank ? `#${rank} ` : '';
  let msg = `📍 ${prefix}${item.bairro || 'N/A'}/${item.cidade || 'SP'} — Terreno de ${(item.areaM2 || 0).toLocaleString('pt-BR')}m²\n\n`;
  msg += `▸ Status: ${item.status || 'N/A'} | ${item.tipoLeilao || 'N/A'}\n`;
  msg += `▸ Leiloeiro: ${item.leiloeiro || 'N/A'}\n`;
  if (item.dataLeilao) msg += `▸ Data: ${new Date(item.dataLeilao).toLocaleDateString('pt-BR')}\n`;
  msg += `\n`;
  msg += `▸ Lance Inicial: ${fmt(item.lanceInicial || 0)}\n`;
  msg += `▸ Valor de Mercado: ${fmt(item.valorMercadoEstimado || 0)}\n`;
  msg += `▸ Custos Extras: ${fmt(item.custosExtrasTotal || 0)}\n`;
  msg += `▸ Investimento Total: ${fmt(item.investimentoTotal || 0)}\n`;
  msg += `▸ Lucro Projetado: ${fmt(item.lucroBrutoProjetado || 0)}\n`;
  msg += `▸ ROI: ${(item.roiEstimado || 0).toFixed(1)}%\n`;
  msg += `▸ Deságio: ${(item.desagio || 0).toFixed(1)}%\n`;
  if (item.url) msg += `\n🔗 ${item.url}`;
  return msg;
}

function processCommand(input: string): string {
  const trimmed = input.trim();
  const lower = trimmed.toLowerCase();

  // /ajuda
  if (lower === '/ajuda' || lower === '/help' || lower === '?') {
    return `🤖 **CousinServices Bot — Comandos Disponíveis**\n\n` +
      `📍 **Busca & Filtros**\n` +
      `▸ \`/buscar [cidade]\` — Busca terrenos e filtra o dashboard\n` +
      `▸ \`/top [N]\` — Top N melhores oportunidades\n` +
      `▸ \`/barato\` — Menor investimento\n` +
      `▸ \`/roi [min]\` — Filtra por ROI mínimo\n` +
      `▸ \`/cidade\` — Lista cidades\n` +
      `▸ \`/limpar\` — Remove filtro do dashboard\n\n` +
      `📊 **Análise**\n` +
      `▸ \`/comparar #1 #3\` — Compara dois terrenos\n` +
      `▸ \`/urgente\` — Leilões nos próximos 3 dias\n` +
      `▸ \`/resumo\` — Resumo geral\n` +
      `▸ \`/historico\` — Evolução entre scraping\n\n` +
      `📄 **Exportar**\n` +
      `▸ \`/exportar\` — Gera relatório PDF executivo\n\n` +
      `🔗 \`/buscar\` sincroniza com o dashboard!`;
  }

  // /limpar /todos /reset
  if (lower === '/limpar' || lower === '/todos' || lower === '/reset') {
    return `✅ Filtro do dashboard removido.\n\nO dashboard agora mostra todos os terrenos disponíveis.\n\n💡 Use \`/buscar [cidade]\` para filtrar novamente.`;
  }

  const data = loadAnalysisData();
  if (!data || !data.items || data.items.length === 0) {
    return `⚠️ Nenhum dado de análise disponível.\n\nExecute primeiro os scripts:\n\`\`\`\nnpm run scrape:pw\nnpm run analise\n\`\`\`\nPara coletar e analisar os dados dos leilões.`;
  }

  const items = data.items;
  const lastUpdate = data.generatedAt ? new Date(data.generatedAt).toLocaleString('pt-BR') : 'desconhecido';

  // /buscar [cidade]
  if (lower.startsWith('/buscar ')) {
    const query = trimmed.substring(8).trim();
    const filtered = items.filter(i =>
      (i.cidade || '').toLowerCase().includes(query.toLowerCase()) ||
      (i.bairro || '').toLowerCase().includes(query.toLowerCase()) ||
      (i.endereco || '').toLowerCase().includes(query.toLowerCase())
    );

    if (filtered.length === 0) {
      const cidades = [...new Set(items.map(i => i.cidade || 'N/A'))].sort();
      return `🔍 Nenhum terreno encontrado para "${query}".\n\n` +
        `Cidades disponíveis: ${cidades.join(', ')}\n\n` +
        `💡 Tente: \`/buscar ${cidades[0]}\``;
    }

    const top = filtered
      .sort((a, b) => (b.roiEstimado || 0) - (a.roiEstimado || 0))
      .slice(0, 5);

    let msg = `🔍 Resultados para "${query}" — ${filtered.length} terreno(s) encontrado(s)\n`;
    msg += `📅 Última atualização: ${lastUpdate}\n\n`;

    top.forEach((item, idx) => {
      msg += formatLotReport(item, idx + 1);
      msg += '\n\n' + '─'.repeat(50) + '\n\n';
    });

    if (filtered.length > 5) {
      msg += `\n📊 Mostrando top 5 de ${filtered.length}. Use \`/buscar ${query}\` com filtros mais específicos.`;
    }

    return msg;
  }

  // /top [N]
  if (lower.startsWith('/top')) {
    const nMatch = lower.match(/\/top\s*(\d+)?/);
    const n = Math.min(parseInt(nMatch?.[1] || '5'), 10);

    const top = items
      .filter(i => (i.roiEstimado || 0) >= 20)
      .sort((a, b) => (b.roiEstimado || 0) - (a.roiEstimado || 0))
      .slice(0, n);

    let msg = `🏆 **Top ${n} Melhores Oportunidades**\n`;
    msg += `📅 Dados de: ${lastUpdate}\n\n`;

    top.forEach((item, idx) => {
      msg += formatLotReport(item, idx + 1);
      msg += '\n\n' + '─'.repeat(50) + '\n\n';
    });

    return msg;
  }

  // /resumo
  if (lower === '/resumo') {
    const viable = items.filter(i => (i.roiEstimado || 0) >= 20);
    const bestROI = viable.length > 0 ? Math.max(...viable.map(i => i.roiEstimado || 0)) : 0;
    const avgDesagio = viable.length > 0
      ? viable.reduce((s, i) => s + (i.desagio || 0), 0) / viable.length : 0;
    const minInv = viable.length > 0
      ? Math.min(...viable.map(i => i.investimentoTotal || Infinity)) : 0;
    const totalLucro = viable.reduce((s, i) => s + Math.max(0, i.lucroBrutoProjetado || 0), 0);
    const cidades = [...new Set(items.map(i => i.cidade || 'N/A'))];

    return `📊 **Resumo Geral — CousinServices**\n\n` +
      `📅 Última atualização: ${lastUpdate}\n\n` +
      `▸ Total de terrenos: ${items.length}\n` +
      `▸ Oportunidades viáveis (ROI≥20%): ${viable.length}\n` +
      `▸ Melhor ROI: ${bestROI.toFixed(1)}%\n` +
      `▸ Deságio médio: ${avgDesagio.toFixed(1)}%\n` +
      `▸ Menor investimento: ${fmt(minInv)}\n` +
      `▸ Lucro potencial total: ${fmt(totalLucro)}\n` +
      `▸ Cidades: ${cidades.join(', ')}\n\n` +
      `💡 Use \`/top\` para ver o ranking ou \`/buscar [cidade]\` para filtrar.`;
  }

  // /barato
  if (lower === '/barato') {
    const sorted = items
      .filter(i => (i.roiEstimado || 0) >= 20)
      .sort((a, b) => (a.investimentoTotal || Infinity) - (b.investimentoTotal || Infinity))
      .slice(0, 5);

    let msg = `💸 **Top 5 Menor Investimento (com ROI ≥ 20%)**\n\n`;
    sorted.forEach((item, idx) => {
      msg += formatLotReport(item, idx + 1);
      msg += '\n\n' + '─'.repeat(50) + '\n\n';
    });
    return msg;
  }

  // /roi [min]
  if (lower.startsWith('/roi')) {
    const minROI = parseFloat(lower.replace('/roi', '').trim()) || 50;
    const filtered = items
      .filter(i => (i.roiEstimado || 0) >= minROI)
      .sort((a, b) => (b.roiEstimado || 0) - (a.roiEstimado || 0))
      .slice(0, 5);

    let msg = `📊 **Terrenos com ROI ≥ ${minROI}%** (${filtered.length} encontrados)\n\n`;
    filtered.forEach((item, idx) => {
      msg += formatLotReport(item, idx + 1);
      msg += '\n\n' + '─'.repeat(50) + '\n\n';
    });
    return msg || `⚠️ Nenhum terreno com ROI ≥ ${minROI}%.`;
  }

  // /cidade
  if (lower.startsWith('/cidade')) {
    const cidades = [...new Set(items.map(i => i.cidade || 'N/A'))].sort();
    const counts = cidades.map(c => {
      const count = items.filter(i => i.cidade === c).length;
      return `▸ ${c}: ${count} terreno(s)`;
    });
    return `🏙️ **Cidades com terrenos disponíveis:**\n\n${counts.join('\n')}\n\n💡 Use \`/buscar [cidade]\` para ver os detalhes.`;
  }

  // /comparar #X #Y
  if (lower.startsWith('/comparar')) {
    const nums = lower.match(/#?(\d+)/g);
    if (!nums || nums.length < 2) {
      return `⚠️ Use: \`/comparar #1 #3\` para comparar o terreno #1 com o #3 do ranking.`;
    }
    const ranked = items.filter(i => (i.roiEstimado || 0) >= 20).sort((a, b) => (b.roiEstimado || 0) - (a.roiEstimado || 0));
    const i1 = parseInt(nums[0].replace('#', '')) - 1;
    const i2 = parseInt(nums[1].replace('#', '')) - 1;
    if (i1 < 0 || i1 >= ranked.length || i2 < 0 || i2 >= ranked.length) {
      return `⚠️ Índices inválidos. Use números entre 1 e ${ranked.length}.`;
    }
    const a = ranked[i1], b = ranked[i2];
    let msg = `⚖️ **Comparativo de Terrenos**\n\n`;
    msg += `┌─────────────────────────────────────┐\n`;
    msg += `│          #${i1+1} vs #${i2+1}               │\n`;
    msg += `├─────────────────────────────────────┤\n`;
    msg += `│ Bairro:\n`;
    msg += `│  A: ${(a.bairro||'').split('\n')[0]}\n`;
    msg += `│  B: ${(b.bairro||'').split('\n')[0]}\n`;
    msg += `│ Cidade:\n`;
    msg += `│  A: ${a.cidade}  |  B: ${b.cidade}\n`;
    msg += `│ Área:\n`;
    msg += `│  A: ${a.areaM2.toLocaleString('pt-BR')}m²  |  B: ${b.areaM2.toLocaleString('pt-BR')}m²\n`;
    msg += `│ Lance Inicial:\n`;
    msg += `│  A: ${fmt(a.lanceInicial)}  |  B: ${fmt(b.lanceInicial)}\n`;
    msg += `│ Valor Mercado:\n`;
    msg += `│  A: ${fmt(a.valorMercadoEstimado)}  |  B: ${fmt(b.valorMercadoEstimado)}\n`;
    msg += `│ Investimento Total:\n`;
    msg += `│  A: ${fmt(a.investimentoTotal)}  |  B: ${fmt(b.investimentoTotal)}\n`;
    msg += `│ Lucro Projetado:\n`;
    msg += `│  A: ${fmt(a.lucroBrutoProjetado)}  |  B: ${fmt(b.lucroBrutoProjetado)}\n`;
    msg += `│ ROI:\n`;
    msg += `│  A: ${a.roiEstimado.toFixed(1)}%  |  B: ${b.roiEstimado.toFixed(1)}%\n`;
    msg += `│ Deságio:\n`;
    msg += `│  A: ${a.desagio.toFixed(1)}%  |  B: ${b.desagio.toFixed(1)}%\n`;
    msg += `└─────────────────────────────────────┘\n\n`;
    const winner = a.roiEstimado > b.roiEstimado ? 'A' : 'B';
    const winnerItem = winner === 'A' ? a : b;
    const roiDiff = Math.abs(a.roiEstimado - b.roiEstimado).toFixed(1);
    const invDiff = fmt(Math.abs(a.investimentoTotal - b.investimentoTotal));
    msg += `🏆 Vencedor: Terreno ${winner} (#${winner === 'A' ? i1+1 : i2+1})\n`;
    msg += `  ROI ${roiDiff}% superior | Investimento: ${fmt(winnerItem.investimentoTotal)}\n`;
    msg += `  Diferença de investimento: ${invDiff}`;
    return msg;
  }

  // /urgente
  if (lower === '/urgente') {
    const now = new Date();
    const threeDays = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
    const urgent = items
      .filter(i => {
        if (!i.dataLeilao) return false;
        const d = new Date(i.dataLeilao);
        return d >= now && d <= threeDays;
      })
      .sort((a, b) => new Date(a.dataLeilao).getTime() - new Date(b.dataLeilao).getTime());

    if (urgent.length === 0) {
      return `⏰ Nenhum leilão nos próximos 3 dias.\n\n💡 Use \`/top\` para ver as melhores oportunidades futuras.`;
    }

    let msg = `🚨 **URGENTE — ${urgent.length} leilão(ões) nos próximos 3 dias!**\n\n`;
    urgent.slice(0, 5).forEach((item, idx) => {
      const d = new Date(item.dataLeilao);
      const diffH = Math.round((d.getTime() - now.getTime()) / (1000 * 60 * 60));
      const timeLabel = diffH < 24 ? `⚡ em ${diffH}h` : `📅 em ${Math.ceil(diffH/24)} dia(s)`;
      msg += `${timeLabel} — #${idx+1} ${(item.bairro||'').split('\n')[0]}\n`;
      msg += `  Lance: ${fmt(item.lanceInicial)} | ROI: ${item.roiEstimado.toFixed(1)}%\n`;
      msg += `  Data: ${d.toLocaleDateString('pt-BR')} às ${d.toLocaleTimeString('pt-BR', {hour:'2-digit',minute:'2-digit'})}\n`;
      if (item.url) msg += `  🔗 ${item.url}\n`;
      msg += `\n`;
    });
    msg += `⚠️ Consulte o edital antes de dar lance!`;
    return msg;
  }

  // /exportar
  if (lower === '/exportar') {
    return `📄 **Relatório Executivo disponível!**\n\nClique no link abaixo para abrir o relatório formatado para impressão/PDF:\n\n🔗 [Abrir Relatório](/api/exportar)\n\n💡 No navegador, use Ctrl+P para salvar como PDF.\n\nO relatório inclui:\n▸ Top 10 oportunidades ranqueadas\n▸ Análise financeira completa\n▸ Custos detalhados\n▸ Recomendações`;
  }

  // /historico
  if (lower === '/historico') {
    const reportsDir = path.resolve(process.cwd(), 'reports');
    if (!fs.existsSync(reportsDir)) {
      return `📁 Nenhum histórico disponível. Execute \`npm run analise\` mais de uma vez.`;
    }
    const files = fs.readdirSync(reportsDir)
      .filter(f => f.startsWith('analise-') && f.endsWith('.txt'))
      .sort()
      .reverse();

    if (files.length === 0) {
      return `📁 Nenhum histórico de análise encontrado.\nExecute \`npm run analise\` para gerar relatórios.`;
    }

    let msg = `📈 **Histórico de Scraping**\n\n`;
    msg += `Total de varreduras salvas: ${files.length}\n\n`;
    files.slice(0, 5).forEach((f, idx) => {
      const ts = f.replace('analise-', '').replace('.txt', '').replace(/T/,  ' ').replace(/-/g, (m, offset) => offset > 10 ? ':' : '-');
      msg += `▸ ${idx === 0 ? '🟢 Atual' : `#${idx+1}`}: ${ts}\n`;
    });

    // Compare current vs totals
    const currentCount = items.length;
    const viable = items.filter(i => (i.roiEstimado || 0) >= 20).length;
    const bestROI = Math.max(...items.map(i => i.roiEstimado || 0));
    msg += `\n📊 **Snapshot Atual**\n`;
    msg += `▸ ${currentCount} terrenos coletados\n`;
    msg += `▸ ${viable} com ROI ≥ 20%\n`;
    msg += `▸ Melhor ROI: ${bestROI.toFixed(1)}%\n\n`;
    msg += `💡 Execute \`npm run scrape:pw && npm run analise\` para nova varredura.\nO histórico anterior será preservado.`;
    return msg;
  }

  // Natural language fallback
  if (lower.includes('melhor') || lower.includes('top') || lower.includes('ranking')) {
    return processCommand('/top 5');
  }
  if (lower.includes('barato') || lower.includes('menor') || lower.includes('investimento')) {
    return processCommand('/barato');
  }
  if (lower.includes('urgente') || lower.includes('próximo') || lower.includes('amanhã') || lower.includes('hoje')) {
    return processCommand('/urgente');
  }
  if (lower.includes('comparar') || lower.includes('versus') || lower.includes(' vs ')) {
    return `💡 Use \`/comparar #1 #3\` para comparar dois terrenos do ranking.`;
  }
  if (lower.includes('exportar') || lower.includes('pdf') || lower.includes('relatório')) {
    return processCommand('/exportar');
  }
  if (lower.includes('histórico') || lower.includes('historico') || lower.includes('evolução')) {
    return processCommand('/historico');
  }
  if (lower.includes('resumo') || lower.includes('status') || lower.includes('geral')) {
    return processCommand('/resumo');
  }
  const cityMatch = items.find(i =>
    lower.includes((i.cidade || '').toLowerCase()) ||
    lower.includes((i.bairro || '').toLowerCase())
  );
  if (cityMatch) {
    return processCommand(`/buscar ${cityMatch.cidade}`);
  }

  return `🤖 Não entendi o comando "${trimmed}".\n\nDigite \`/ajuda\` para ver os comandos disponíveis.`;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const message = body.message || '';
    const response = processCommand(message);
    return NextResponse.json({ response });
  } catch (err) {
    return NextResponse.json(
      { response: `❌ Erro interno: ${(err as Error).message}` },
      { status: 500 }
    );
  }
}
