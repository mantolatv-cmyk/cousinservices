// ============================================================
// CousinServices — API Route: /api/exportar
// Gera relatório HTML executivo otimizado para impressão/PDF
// ============================================================

import { NextResponse } from 'next/server';
import * as fs from 'fs';
import * as path from 'path';

function fmt(n: number): string {
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

export async function GET() {
  const analysisPath = path.resolve(process.cwd(), 'analise-resultado.json');
  let items: Array<Record<string, unknown>> = [];
  let generatedAt = new Date().toISOString();

  if (fs.existsSync(analysisPath)) {
    const data = JSON.parse(fs.readFileSync(analysisPath, 'utf-8'));
    items = data.items || [];
    generatedAt = data.generatedAt || generatedAt;
  }

  const viable = items.filter(i => ((i.roiEstimado as number) || 0) >= 20);
  const top10 = viable.sort((a, b) => ((b.roiEstimado as number) || 0) - ((a.roiEstimado as number) || 0)).slice(0, 10);

  const totalLucro = viable.reduce((s, i) => s + Math.max(0, (i.lucroBrutoProjetado as number) || 0), 0);
  const bestROI = viable.length > 0 ? Math.max(...viable.map(i => (i.roiEstimado as number) || 0)) : 0;
  const avgDesagio = viable.length > 0 ? viable.reduce((s, i) => s + ((i.desagio as number) || 0), 0) / viable.length : 0;
  const minInv = viable.length > 0 ? Math.min(...viable.map(i => (i.investimentoTotal as number) || Infinity)) : 0;

  const lotRows = top10.map((item, idx) => {
    const bairro = ((item.bairro as string) || '').split('\n')[0];
    const cidade = ((item.cidade as string) || '').replace(/^(Terreno|Desocupado|Área Rural)\n/gi, '');
    return `
    <tr class="${idx % 2 === 0 ? 'even' : ''}">
      <td class="rank">${idx + 1}</td>
      <td><strong>${bairro}</strong><br><small>${cidade}/${item.estado || 'SP'}</small></td>
      <td class="num">${((item.areaM2 as number) || 0).toLocaleString('pt-BR')}m²</td>
      <td class="num">${fmt((item.lanceInicial as number) || 0)}</td>
      <td class="num">${fmt((item.valorMercadoEstimado as number) || 0)}</td>
      <td class="num">${fmt((item.investimentoTotal as number) || 0)}</td>
      <td class="num highlight">${fmt((item.lucroBrutoProjetado as number) || 0)}</td>
      <td class="num roi">${((item.roiEstimado as number) || 0).toFixed(1)}%</td>
      <td class="num">${((item.desagio as number) || 0).toFixed(1)}%</td>
    </tr>`;
  }).join('');

  const detailCards = top10.map((item, idx) => {
    const bairro = ((item.bairro as string) || '').split('\n')[0];
    const cidade = ((item.cidade as string) || '').replace(/^(Terreno|Desocupado|Área Rural)\n/gi, '');
    return `
    <div class="detail-card">
      <div class="detail-header">
        <span class="detail-rank">#${idx + 1}</span>
        <span class="detail-title">${bairro} — ${cidade}/${item.estado || 'SP'}</span>
        <span class="detail-roi">ROI ${((item.roiEstimado as number) || 0).toFixed(1)}%</span>
      </div>
      <div class="detail-grid">
        <div><small>Área</small><br>${((item.areaM2 as number) || 0).toLocaleString('pt-BR')}m²</div>
        <div><small>Lance Inicial</small><br>${fmt((item.lanceInicial as number) || 0)}</div>
        <div><small>Valor Mercado</small><br>${fmt((item.valorMercadoEstimado as number) || 0)}</div>
        <div><small>Comissão (5%)</small><br>${fmt((item.comissaoLeiloeiro as number) || 0)}</div>
        <div><small>ITBI (4%)</small><br>${fmt((item.itbi as number) || 0)}</div>
        <div><small>Cartório</small><br>${fmt((item.registroEscritura as number) || 0)}</div>
        <div><small>Custos Extras</small><br><strong>${fmt((item.custosExtrasTotal as number) || 0)}</strong></div>
        <div><small>Investimento Total</small><br><strong>${fmt((item.investimentoTotal as number) || 0)}</strong></div>
        <div><small>Lucro Projetado</small><br><strong class="green">${fmt((item.lucroBrutoProjetado as number) || 0)}</strong></div>
      </div>
      <div class="detail-footer">
        ${item.status || 'N/A'} | ${item.tipoLeilao || 'N/A'} | ${item.leiloeiro || 'N/A'}
        ${item.url ? ` | <a href="${item.url}">${item.url}</a>` : ''}
      </div>
    </div>`;
  }).join('');

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>CousinServices — Relatório Executivo</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Segoe UI', system-ui, sans-serif; color: #1E293B; background: #fff; font-size: 11px; line-height: 1.4; }
    .page { max-width: 1100px; margin: 0 auto; padding: 30px 40px; }
    .header { border-bottom: 3px solid #10B981; padding-bottom: 16px; margin-bottom: 24px; display: flex; justify-content: space-between; align-items: flex-end; }
    .header h1 { font-size: 22px; color: #0F172A; }
    .header h1 span { color: #10B981; }
    .header .meta { text-align: right; font-size: 10px; color: #64748B; }
    .kpi-bar { display: grid; grid-template-columns: repeat(5, 1fr); gap: 12px; margin-bottom: 24px; }
    .kpi { border: 1px solid #E2E8F0; border-radius: 8px; padding: 12px; text-align: center; }
    .kpi .label { font-size: 9px; color: #64748B; text-transform: uppercase; letter-spacing: 0.5px; }
    .kpi .value { font-size: 18px; font-weight: 700; color: #0F172A; margin-top: 4px; }
    .kpi .value.green { color: #10B981; }
    h2 { font-size: 14px; color: #0F172A; margin: 20px 0 10px; border-left: 4px solid #10B981; padding-left: 10px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 10px; }
    th { background: #0F172A; color: #fff; padding: 8px 6px; text-align: left; font-size: 9px; text-transform: uppercase; letter-spacing: 0.3px; }
    td { padding: 6px; border-bottom: 1px solid #E2E8F0; }
    tr.even td { background: #F8FAFC; }
    .rank { font-weight: 700; color: #10B981; text-align: center; width: 30px; }
    .num { text-align: right; font-family: 'Cascadia Code', monospace; }
    .highlight { color: #10B981; font-weight: 600; }
    .roi { color: #10B981; font-weight: 700; font-size: 11px; }
    .detail-card { border: 1px solid #E2E8F0; border-radius: 8px; padding: 14px; margin-bottom: 12px; page-break-inside: avoid; }
    .detail-header { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
    .detail-rank { background: #10B981; color: #fff; width: 24px; height: 24px; border-radius: 6px; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 11px; }
    .detail-title { font-weight: 600; font-size: 12px; flex: 1; }
    .detail-roi { background: #ECFDF5; color: #10B981; padding: 3px 8px; border-radius: 4px; font-weight: 700; font-size: 11px; }
    .detail-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
    .detail-grid div { padding: 6px; background: #F8FAFC; border-radius: 4px; font-family: monospace; font-size: 11px; }
    .detail-grid small { color: #64748B; font-family: sans-serif; font-size: 9px; }
    .green { color: #10B981; }
    .detail-footer { margin-top: 8px; font-size: 9px; color: #94A3B8; }
    .detail-footer a { color: #3B82F6; }
    .notes { border-top: 2px solid #E2E8F0; padding-top: 16px; margin-top: 20px; font-size: 9px; color: #64748B; }
    .notes li { margin-bottom: 4px; }
    .footer { text-align: center; margin-top: 24px; padding-top: 16px; border-top: 1px solid #E2E8F0; font-size: 9px; color: #94A3B8; }
    @media print { body { font-size: 10px; } .page { padding: 10px 20px; } }
  </style>
</head>
<body>
  <div class="page">
    <div class="header">
      <h1>📍 <span>CousinServices</span> — Relatório Executivo</h1>
      <div class="meta">
        Gerado em: ${new Date(generatedAt).toLocaleDateString('pt-BR')}<br>
        ${items.length} terrenos analisados | ${viable.length} viáveis
      </div>
    </div>

    <div class="kpi-bar">
      <div class="kpi"><div class="label">Oportunidades</div><div class="value">${viable.length}</div></div>
      <div class="kpi"><div class="label">Melhor ROI</div><div class="value green">${bestROI.toFixed(1)}%</div></div>
      <div class="kpi"><div class="label">Deságio Médio</div><div class="value">${avgDesagio.toFixed(1)}%</div></div>
      <div class="kpi"><div class="label">Menor Investimento</div><div class="value">${fmt(minInv)}</div></div>
      <div class="kpi"><div class="label">Lucro Potencial</div><div class="value green">${fmt(totalLucro)}</div></div>
    </div>

    <h2>Ranking — Top 10 Oportunidades</h2>
    <table>
      <thead><tr>
        <th>#</th><th>Localização</th><th>Área</th><th>Lance</th><th>Mercado</th><th>Investimento</th><th>Lucro</th><th>ROI</th><th>Deságio</th>
      </tr></thead>
      <tbody>${lotRows}</tbody>
    </table>

    <h2>Análise Detalhada</h2>
    ${detailCards}

    <div class="notes">
      <h2>Notas e Disclaimers</h2>
      <ul>
        <li>Valores de mercado estimados com base em dados FipeZAP e médias regionais</li>
        <li>Custos extras: Comissão 5% + ITBI 4% + Cartório 1.75%</li>
        <li>ROI = (Valor Mercado - Investimento Total) / Investimento Total × 100</li>
        <li>Sempre consulte o edital completo antes de investir</li>
        <li>Dados obtidos via scraping automatizado — sujeitos a atualização dos sites-fonte</li>
      </ul>
    </div>

    <div class="footer">
      © CousinServices ${new Date().getFullYear()} — Plataforma de Inteligência Imobiliária<br>
      Este relatório é confidencial e destinado exclusivamente ao destinatário.
    </div>
  </div>
</body>
</html>`;

  return new NextResponse(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}
