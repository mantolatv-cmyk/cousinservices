// ============================================================
// CousinServices — Bot API Route
// Processa comandos do chat bot (/buscar, /top, /ajuda, etc.)
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import * as fs from 'fs';
import * as path from 'path';
import { GoogleGenerativeAI } from '@google/generative-ai';

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

  const reportsDir = path.resolve(process.cwd(), 'reports');
  if (fs.existsSync(reportsDir)) {
    const files = fs.readdirSync(reportsDir)
      .filter(f => f.startsWith('dados-') && f.endsWith('.json'))
      .sort()
      .reverse();
    if (files.length > 0) {
      try {
        const data = JSON.parse(fs.readFileSync(path.join(reportsDir, files[0]), 'utf-8'));
        if (data.opportunities) {
          return {
            generatedAt: data.generatedAt,
            items: data.opportunities.map((o: any) => ({
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
  msg += `▸ Lance Inicial: ${fmt(item.lanceInicial)}\n`;
  msg += `▸ Est. Mercado: ${fmt(item.valorMercadoEstimado)}\n`;
  msg += `▸ ROI Estimado: **${(item.roiEstimado || 0).toFixed(1)}%**\n`;
  if (item.url) msg += `\n🔗 [Ver no site](${item.url})`;
  return msg;
}

function processCommand(input: string): string {
  const trimmed = input.trim();
  const lower = trimmed.toLowerCase();

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

  if (lower === '/limpar' || lower === '/todos' || lower === '/reset') {
    return `✅ Filtro do dashboard removido.\n\nO dashboard agora mostra todos os terrenos disponíveis.\n\n💡 Use \`/buscar [cidade]\` para filtrar novamente.`;
  }

  const data = loadAnalysisData();
  if (!data || !data.items || data.items.length === 0) {
    return `⚠️ Nenhum dado de análise disponível.\n\nExecute primeiro os scripts:\n\`\`\`\nnpm run scrape:pw\nnpm run analise\n\`\`\`\nPara coletar e analisar os dados dos leilões.`;
  }

  const items = data.items;
  const lastUpdate = data.generatedAt ? new Date(data.generatedAt).toLocaleString('pt-BR') : 'desconhecido';

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

  if (lower === '/resumo') {
    const viable = items.filter(i => (i.roiEstimado || 0) >= 20);
    const bestROI = viable.length > 0 ? Math.max(...viable.map(i => i.roiEstimado || 0)) : 0;
    const cidades = [...new Set(items.map(i => i.cidade || 'N/A'))];

    return `📊 **Resumo Geral — CousinServices**\n\n` +
      `📅 Última atualização: ${lastUpdate}\n\n` +
      `▸ Total de terrenos: ${items.length}\n` +
      `▸ Oportunidades viáveis: ${viable.length}\n` +
      `▸ Melhor ROI: ${bestROI.toFixed(1)}%\n` +
      `▸ Cidades: ${cidades.join(', ')}\n\n` +
      `💡 Use \`/top\` para ver o ranking.`;
  }

  if (lower === '/barato') {
    const sorted = items
      .filter(i => (i.roiEstimado || 0) >= 20)
      .sort((a, b) => (a.investimentoTotal || Infinity) - (b.investimentoTotal || Infinity))
      .slice(0, 5);

    let msg = `💸 **Top 5 Menor Investimento**\n\n`;
    sorted.forEach((item, idx) => {
      msg += formatLotReport(item, idx + 1);
      msg += '\n\n' + '─'.repeat(50) + '\n\n';
    });
    return msg;
  }

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
      return `⏰ Nenhum leilão nos próximos 3 dias.`;
    }

    let msg = `🚨 **URGENTE — ${urgent.length} leilão(ões) em breve!**\n\n`;
    urgent.slice(0, 5).forEach((item, idx) => {
      msg += formatLotReport(item, idx + 1);
      msg += '\n\n' + '─'.repeat(50) + '\n\n';
    });
    return msg;
  }

  if (lower === '/exportar') {
    return `📄 **Relatório Executivo**\n\n🔗 [Abrir Relatório](/api/exportar)`;
  }

  if (lower === '/historico') {
    return `📈 Histórico de varreduras disponível no painel de relatórios local.`;
  }

  // Fallback for commands
  return `🤖 Comando não reconhecido. Digite \`/ajuda\` para ver a lista.`;
}

// ===================== AI INTEGRATIONS =====================
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_KEY || '');
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

async function getDeepSeekResponse(userMessage: string, contextItems: AnaliseItem[], apiKey: string): Promise<string> {
  const key = (apiKey && apiKey.trim().length > 0) ? apiKey : process.env.DEEPSEEK_API_KEY;
  console.log('Bot API: DeepSeek Key Status:', key ? 'Key Found' : 'Key MISSING');
  if (!key || key.length < 10) {
    return "🤖 Modo offline DeepSeek (API Key não detectada). Verifique as configurações.";
  }

  try {
    const top5 = contextItems
      .sort((a, b) => (b.roiEstimado || 0) - (a.roiEstimado || 0))
      .slice(0, 5)
      .map((item, i) => `#${i+1}: ${item.bairro}/${item.cidade} - ROI ${item.roiEstimado.toFixed(1)}% - Lance ${fmt(item.lanceInicial)}`)
      .join('\n');

    const prompt = `
      Você é o AgentBot, um assistente virtual especialista em leilões de terrenos para a plataforma CousinServices.
      CONTEXTO ATUAL (Top 5 Oportunidades):
      ${top5}
      
      TOTAL DE TERRENOS: ${contextItems.length}
      
      INSTRUÇÕES:
      - Responda de forma profissional e curta. Em português.
      - Se o usuário quiser filtrar algo, recomende o comando /buscar [cidade].
      - Indique que está usando DeepSeek no final da resposta discretamente.
      - Pergunta: "${userMessage}"
    `;

    const res = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${key}`
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7,
        max_tokens: 500
      })
    });

    const data = await res.json();
    return (data.choices?.[0]?.message?.content || "Sem resposta do DeepSeek.") + "\n\n*✨ Powered by DeepSeek*";
  } catch (err) {
    console.error('DeepSeek Error:', err);
    return "🤖 Erro ao conectar com DeepSeek. Tente comandos (/ajuda).";
  }
}

async function getGeminiResponse(userMessage: string, contextItems: AnaliseItem[]): Promise<string> {
  console.log('Bot API: Checking Key...', process.env.GOOGLE_AI_KEY ? 'Present' : 'MISSING');
  
  if (!process.env.GOOGLE_AI_KEY || process.env.GOOGLE_AI_KEY.length < 10) {
    return "🤖 Modo offline (API Key não detectada). Use comandos como `/buscar` ou `/ajuda`.";
  }

  try {
    const top5 = contextItems
      .sort((a, b) => (b.roiEstimado || 0) - (a.roiEstimado || 0))
      .slice(0, 5)
      .map((item, i) => `#${i+1}: ${item.bairro}/${item.cidade} - ROI ${item.roiEstimado.toFixed(1)}% - Lance ${fmt(item.lanceInicial)}`)
      .join('\n');

    const prompt = `
      Você é o AgentBot, um assistente virtual especialista em leilões de terrenos para a plataforma CousinServices.
      CONTEXTO ATUAL (Top 5 Oportunidades):
      ${top5}
      
      TOTAL DE TERRENOS: ${contextItems.length}
      
      INSTRUÇÕES:
      - Responda de forma profissional e curta.
      - Se o usuário quiser filtrar algo, recomende o comando /buscar [cidade].
      - Pergunta: "${userMessage}"
    `;

    const result = await model.generateContent(prompt);
    return result.response.text();
  } catch (err) {
    console.error('Gemini Error:', err);
    return "🤖 Desculpe, tive um problema técnico. Tente usar comandos (/ajuda).";
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const message = body.message || '';
    
    console.log(`Bot API: Request received. Message: "${message.substring(0, 20)}..."`);
    
    if (message.startsWith('/')) {
      return NextResponse.json({ response: processCommand(message) });
    }

    const itemsData = loadAnalysisData();
    const items = itemsData?.items || [];
    
    // Detection logic: Priority to header, then .env
    const geminiKey = process.env.GOOGLE_AI_KEY || '';
    const deepseekEnvKey = process.env.DEEPSEEK_API_KEY || '';
    const clientDeepseekKey = req.headers.get('x-deepseek-key') || '';
    
    let provider = req.headers.get('x-ai-provider');
    
    // Auto-switch if default gemini is missing but deepseek is available
    if (!provider || provider === 'gemini') {
      if ((!geminiKey || geminiKey.length < 10) && (deepseekEnvKey || clientDeepseekKey)) {
        provider = 'deepseek';
      } else {
        provider = 'gemini';
      }
    }
    
    console.log(`Bot API: Selected Provider: ${provider}`);
    
    let response = '';
    if (provider === 'deepseek') {
      response = await getDeepSeekResponse(message, items, clientDeepseekKey);
    } else {
      response = await getGeminiResponse(message, items);
    }
    
    return NextResponse.json({ response });
  } catch (err) {
    return NextResponse.json({ response: `❌ Erro: ${(err as Error).message}` }, { status: 500 });
  }
}
