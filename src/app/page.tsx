'use client';

import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, CartesianGrid } from 'recharts';
import { getAllZonas } from '@/data/spRegions';
import { formatCurrency, formatCurrencyCompact, formatPercent, formatArea, formatDate, formatDateTime, daysUntil, getAttentionPoints } from '@/lib/format';
import ChatBot from '@/components/ChatBot';
import type { AuctionLot, FilterState, ScrapingStatus as ScrapingStatusType } from '@/lib/types';

// ===================== METRICS CALCULATOR =====================
function calcMetrics(lots: AuctionLot[]) {
  const analyzed = lots.filter(l => l.analysis);
  if (analyzed.length === 0) {
    return { totalOportunidades: 0, melhorROI: 0, desagioMedio: 0, investimentoMinimo: 0, lucroPotencialTotal: 0, mediaPrecoM2: 0 };
  }
  return {
    totalOportunidades: analyzed.length,
    melhorROI: Math.max(...analyzed.map(l => l.analysis!.roiEstimado)),
    desagioMedio: analyzed.reduce((s, l) => s + l.analysis!.desagio, 0) / analyzed.length,
    investimentoMinimo: Math.min(...analyzed.map(l => l.analysis!.investimentoTotal)),
    lucroPotencialTotal: analyzed.reduce((s, l) => s + Math.max(0, l.analysis!.lucroBrutoProjetado), 0),
    mediaPrecoM2: analyzed.reduce((s, l) => s + l.analysis!.precoM2Leilao, 0) / analyzed.length,
  };
}

// ===================== MAIN PAGE =====================
export default function Home() {
  const [allLots, setAllLots] = useState<AuctionLot[]>([]);
  const [dataSource, setDataSource] = useState('Carregando...');
  const [lastUpdate, setLastUpdate] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  const [filters, setFilters] = useState<Partial<FilterState>>({
    zona: 'Todas',
    roiMinimo: 20,
    tipoLeilao: 'Todos',
    ordenarPor: 'roi',
    areaMinima: 0,
    areaMaxima: 100000,
  });
  const [botFilter, setBotFilter] = useState<string | null>(null);
  const [expandedCard, setExpandedCard] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // ===================== FETCH DATA FROM API =====================
  const fetchLots = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/lotes');
      const data = await res.json();
      setAllLots(data.lots || []);
      setDataSource(data.source || 'desconhecido');
      setLastUpdate(data.generatedAt ? new Date(data.generatedAt).toLocaleString('pt-BR') : '');
    } catch {
      setDataSource('Erro ao carregar dados');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLots();
  }, [fetchLots]);

  // ===================== FILTER + SORT =====================
  const filteredLots = useMemo(() => {
    let lots = [...allLots];

    // Bot filter (city search from chat)
    if (botFilter) {
      const q = botFilter.toLowerCase();
      lots = lots.filter(l =>
        l.cidade.toLowerCase().includes(q) ||
        l.bairro.toLowerCase().includes(q) ||
        l.endereco.toLowerCase().includes(q)
      );
    }

    // ROI minimum
    const minROI = filters.roiMinimo ?? 20;
    lots = lots.filter(l => (l.analysis?.roiEstimado || 0) >= minROI);

    // Zone filter
    if (filters.zona && filters.zona !== 'Todas') {
      lots = lots.filter(l => l.zona === filters.zona);
    }

    // Auction type
    if (filters.tipoLeilao && filters.tipoLeilao !== 'Todos') {
      lots = lots.filter(l => l.tipoLeilao === filters.tipoLeilao);
    }

    // Area
    if (filters.areaMinima) lots = lots.filter(l => l.areaM2 >= (filters.areaMinima || 0));
    if (filters.areaMaxima && filters.areaMaxima < 100000) lots = lots.filter(l => l.areaM2 <= (filters.areaMaxima || 100000));

    // Sort
    const sortBy = filters.ordenarPor || 'roi';
    lots.sort((a, b) => {
      const aa = a.analysis, bb = b.analysis;
      if (!aa || !bb) return 0;
      switch (sortBy) {
        case 'roi': return bb.scoreComposto - aa.scoreComposto;
        case 'desagio': return bb.desagio - aa.desagio;
        case 'preco': return aa.investimentoTotal - bb.investimentoTotal;
        case 'area': return b.areaM2 - a.areaM2;
        default: return bb.scoreComposto - aa.scoreComposto;
      }
    });

    return lots;
  }, [allLots, filters, botFilter]);

  const metrics = useMemo(() => calcMetrics(filteredLots), [filteredLots]);

  const chartData = useMemo(() => {
    return filteredLots.slice(0, 8).map(lot => ({
      name: lot.bairro.length > 12 ? lot.bairro.substring(0, 12) + '…' : lot.bairro,
      leilao: lot.analysis?.precoM2Leilao || 0,
      mercado: lot.analysis?.precoM2Mercado || 0,
      roi: lot.analysis?.roiEstimado || 0,
    }));
  }, [filteredLots]);

  // ===================== SCRAPING STATUS from real data =====================
  const scrapingSources: ScrapingStatusType[] = useMemo(() => {
    const sourceMap = new Map<string, number>();
    allLots.forEach(l => {
      sourceMap.set(l.source, (sourceMap.get(l.source) || 0) + 1);
    });
    const sources: ScrapingStatusType[] = [];
    sourceMap.forEach((count, src) => {
      sources.push({
        source: src as ScrapingStatusType['source'],
        status: 'success',
        lastScrape: lastUpdate,
        itemsFound: count,
      });
    });
    if (sources.length === 0) {
      sources.push({ source: 'Portal Zuk', status: 'idle', itemsFound: 0 });
    }
    return sources;
  }, [allLots, lastUpdate]);

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await fetchLots();
    setIsRefreshing(false);
  }, [fetchLots]);

  const updateFilter = useCallback((key: keyof FilterState, value: string | number) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  }, []);

  // ===================== BOT → DASHBOARD INTEGRATION =====================
  const handleBotFilter = useCallback((query: string | null) => {
    setBotFilter(query);
    // Scroll to top to show filtered results
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  return (
    <div className="app-container">
      {/* === HEADER === */}
      <header className="header">
        <div className="header-brand">
          <div className="header-logo">📍</div>
          <div>
            <div className="header-title">CousinServices</div>
            <div className="header-subtitle">Especialista em Terrenos — São Paulo</div>
          </div>
        </div>
        <div className="header-actions">
          <div className="header-status">
            <span className="status-dot" />
            <span>{lastUpdate ? `Última atualização: ${lastUpdate}` : dataSource}</span>
          </div>
          <button className="btn btn-primary" onClick={handleRefresh} disabled={isRefreshing}>
            {isRefreshing ? '⟳ Atualizando…' : '⟳ Atualizar Dados'}
          </button>
        </div>
      </header>

      {/* === BOT FILTER INDICATOR === */}
      {botFilter && (
        <div style={{
          margin: '0 24px',
          padding: '10px 16px',
          background: 'rgba(0, 255, 163, 0.1)',
          border: '1px solid rgba(0, 255, 163, 0.3)',
          borderRadius: '10px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontSize: '13px',
          color: '#00FFA3',
          animation: 'fadeIn 0.3s ease',
        }}>
          <span>🤖 Filtrado pelo AgentBot: <strong>&quot;{botFilter}&quot;</strong> — {filteredLots.length} resultado{filteredLots.length !== 1 ? 's' : ''}</span>
          <button
            onClick={() => setBotFilter(null)}
            style={{
              background: 'rgba(0, 255, 163, 0.2)',
              border: '1px solid rgba(0, 255, 163, 0.3)',
              borderRadius: '6px',
              color: '#00FFA3',
              padding: '4px 12px',
              fontSize: '12px',
              cursor: 'pointer',
            }}
          >
            ✕ Limpar filtro
          </button>
        </div>
      )}

      {/* === LOADING STATE === */}
      {isLoading ? (
        <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-muted)' }}>
          <div style={{ fontSize: '32px', marginBottom: '12px', animation: 'pulse 1.5s infinite' }}>⟳</div>
          <div>Carregando dados reais dos leilões...</div>
        </div>
      ) : (
        <>
          {/* === METRICS BAR === */}
          <div className="metrics-bar">
            <div className="metric-card animate-in">
              <div className="metric-label">📊 Oportunidades</div>
              <div className="metric-value">{metrics.totalOportunidades}</div>
              <div className="metric-change">terrenos com ROI &gt; {filters.roiMinimo || 20}%</div>
            </div>
            <div className="metric-card animate-in">
              <div className="metric-label">🏆 Melhor ROI</div>
              <div className="metric-value positive">{formatPercent(metrics.melhorROI)}</div>
              <div className="metric-change">retorno sobre investimento</div>
            </div>
            <div className="metric-card animate-in">
              <div className="metric-label">💰 Deságio Médio</div>
              <div className="metric-value warning">{formatPercent(metrics.desagioMedio)}</div>
              <div className="metric-change">desconto vs. mercado</div>
            </div>
            <div className="metric-card animate-in">
              <div className="metric-label">🎯 Investimento Mín.</div>
              <div className="metric-value">{formatCurrencyCompact(metrics.investimentoMinimo)}</div>
              <div className="metric-change">menor entrada necessária</div>
            </div>
            <div className="metric-card animate-in">
              <div className="metric-label">📈 Lucro Potencial Total</div>
              <div className="metric-value positive">{formatCurrencyCompact(metrics.lucroPotencialTotal)}</div>
              <div className="metric-change">soma de todas as oportunidades</div>
            </div>
            <div className="metric-card animate-in">
              <div className="metric-label">📐 Preço Médio/m²</div>
              <div className="metric-value">{formatCurrency(metrics.mediaPrecoM2)}</div>
              <div className="metric-change">nos leilões filtrados</div>
            </div>
          </div>

          {/* === FILTER BAR === */}
          <div className="filter-bar">
            <div className="filter-group">
              <label className="filter-label">Zona</label>
              <select className="filter-select" value={filters.zona || 'Todas'} onChange={e => updateFilter('zona', e.target.value)}>
                {getAllZonas().map(z => <option key={z} value={z}>{z}</option>)}
              </select>
            </div>
            <div className="filter-divider" />
            <div className="filter-group">
              <label className="filter-label">ROI Mínimo</label>
              <select className="filter-select" value={filters.roiMinimo || 20} onChange={e => updateFilter('roiMinimo', Number(e.target.value))}>
                <option value={0}>Sem filtro</option>
                <option value={10}>≥ 10%</option>
                <option value={20}>≥ 20%</option>
                <option value={30}>≥ 30%</option>
                <option value={50}>≥ 50%</option>
                <option value={80}>≥ 80%</option>
              </select>
            </div>
            <div className="filter-divider" />
            <div className="filter-group">
              <label className="filter-label">Tipo de Leilão</label>
              <select className="filter-select" value={filters.tipoLeilao || 'Todos'} onChange={e => updateFilter('tipoLeilao', e.target.value)}>
                <option value="Todos">Todos</option>
                <option value="Judicial">Judicial</option>
                <option value="Extrajudicial">Extrajudicial</option>
                <option value="Alienação Fiduciária">Alienação Fiduciária</option>
              </select>
            </div>
            <div className="filter-divider" />
            <div className="filter-group">
              <label className="filter-label">Ordenar por</label>
              <select className="filter-select" value={filters.ordenarPor || 'roi'} onChange={e => updateFilter('ordenarPor', e.target.value)}>
                <option value="roi">Maior ROI</option>
                <option value="desagio">Maior Deságio</option>
                <option value="preco">Menor Preço</option>
                <option value="area">Maior Área</option>
              </select>
            </div>
            <div style={{ flex: 1 }} />
            <div className="filter-group">
              <label className="filter-label" style={{ visibility: 'hidden' }}>_</label>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{filteredLots.length} resultado{filteredLots.length !== 1 ? 's' : ''}</span>
            </div>
          </div>

          {/* === PRICE COMPARISON CHART === */}
          {chartData.length > 0 && (
            <div className="chart-section animate-in">
              <div className="chart-title">📊 Comparativo Preço/m² — Leilão vs. Mercado</div>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={chartData} barGap={4}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.06)" />
                  <XAxis dataKey="name" tick={{ fill: '#94A3B8', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: '#94A3B8', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v: number) => `R$${(v/1000).toFixed(0)}K`} />
                  <Tooltip
                    contentStyle={{ background: '#111827', border: '1px solid rgba(148,163,184,0.15)', borderRadius: '10px', fontSize: '12px', color: '#F1F5F9' }}
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    formatter={(value: any, name: any) => [formatCurrency(Number(value)), name === 'leilao' ? 'Leilão (R$/m²)' : 'Mercado (R$/m²)']}
                  />
                  <Bar dataKey="mercado" name="Mercado" radius={[4, 4, 0, 0]} maxBarSize={32}>
                    {chartData.map((_, i) => <Cell key={i} fill="rgba(148,163,184,0.2)" />)}
                  </Bar>
                  <Bar dataKey="leilao" name="Leilão" radius={[4, 4, 0, 0]} maxBarSize={32}>
                    {chartData.map((_, i) => <Cell key={i} fill="#00FFA3" />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* === OPPORTUNITIES === */}
          <div className="cards-section">
            <div className="cards-header">
              <div className="cards-title">
                🏆 Top Oportunidades Ranqueadas
                <span className="cards-count">— {filteredLots.length} terreno{filteredLots.length !== 1 ? 's' : ''} encontrado{filteredLots.length !== 1 ? 's' : ''}</span>
                {botFilter && <span style={{ color: '#10B981', fontSize: '12px', marginLeft: '8px' }}>🤖 filtrado</span>}
              </div>
            </div>

            {filteredLots.length === 0 ? (
              <div className="empty-state">
                <div className="empty-state-icon">🔍</div>
                <div className="empty-state-title">Nenhuma oportunidade encontrada</div>
                <div className="empty-state-text">
                  {botFilter
                    ? `Nenhum terreno encontrado para "${botFilter}". Clique em "Limpar filtro" acima.`
                    : 'Tente ajustar os filtros ou reduzir o ROI mínimo'
                  }
                </div>
              </div>
            ) : (
              <div className="cards-grid">
                {filteredLots.map((lot, idx) => (
                  <OpportunityCard key={lot.id} lot={lot} rank={idx + 1} expanded={expandedCard === lot.id} onToggle={() => setExpandedCard(expandedCard === lot.id ? null : lot.id)} />
                ))}
              </div>
            )}
          </div>

          {/* === SCRAPING STATUS === */}
          <div className="scraping-section">
            <div className="cards-header">
              <div className="cards-title">🔗 Fontes de Dados — {dataSource}</div>
            </div>
            <div className="scraping-grid">
              {scrapingSources.map(s => (
                <div key={s.source} className="scraping-card animate-in">
                  <div className="scraping-name">
                    {s.source}
                    <span className={`scraping-status-dot ${s.status}`} />
                  </div>
                  <div className="scraping-info">
                    <span>{s.itemsFound} itens</span>
                    <span>{s.lastScrape ? formatDate(s.lastScrape) : '—'}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* === FOOTER === */}
          <footer style={{ borderTop: '1px solid var(--border)', padding: '20px 0', marginTop: '20px', textAlign: 'center', fontSize: '12px', color: 'var(--text-muted)' }}>
            CousinServices © 2026 — Plataforma de Inteligência Imobiliária | Dados reais via scraping automatizado
          </footer>
        </>
      )}

      {/* === AGENT BOT === */}
      <ChatBot onBotFilter={handleBotFilter} activeBotFilter={botFilter} />
    </div>
  );
}

// ===================== OPPORTUNITY CARD =====================
function OpportunityCard({ lot, rank, expanded, onToggle }: { lot: AuctionLot; rank: number; expanded: boolean; onToggle: () => void }) {
  const a = lot.analysis;
  if (!a) return null;

  const days = daysUntil(lot.dataLeilao);
  const daysLabel = days > 0 ? `em ${days} dia${days !== 1 ? 's' : ''}` : days === 0 ? 'HOJE' : 'Encerrado';
  const roiClass = a.roiEstimado >= 50 ? 'high' : '';

  return (
    <div className={`opportunity-card animate-in ${expanded ? 'expanded' : ''}`} onClick={onToggle}>
      <div className="card-rank">{rank}</div>

      <div className="card-header">
        <div className="card-icon">📍</div>
        <div className="card-location">
          <div className="card-bairro">{lot.bairro} — Terreno de {formatArea(lot.areaM2)}</div>
          <div className="card-endereco">{lot.endereco}, {lot.cidade}/{lot.estado}</div>
        </div>
      </div>

      <div className="card-badges">
        <span className="badge badge-praca">{lot.status}</span>
        <span className="badge badge-tipo">{lot.tipoLeilao}</span>
        <span className="badge badge-source">{lot.source}</span>
        <span className={`badge badge-roi ${roiClass}`}>ROI {formatPercent(a.roiEstimado)}</span>
      </div>

      <div className="card-financials">
        <div className="financial-item">
          <span className="financial-label">Lance Inicial</span>
          <span className="financial-value">{formatCurrency(a.lanceConsiderado)}</span>
          <span className="financial-sub">{formatCurrency(a.precoM2Leilao)}/m²</span>
        </div>
        <div className="financial-item">
          <span className="financial-label">Valor de Mercado</span>
          <span className="financial-value">{formatCurrency(a.valorMercadoEstimado)}</span>
          <span className="financial-sub">{formatCurrency(a.precoM2Mercado)}/m²</span>
        </div>
        <div className="financial-item">
          <span className="financial-label">Investimento Total</span>
          <span className="financial-value gold">{formatCurrency(a.investimentoTotal)}</span>
          <span className="financial-sub">lance + custos extras</span>
        </div>
        <div className="financial-item">
          <span className="financial-label">Lucro Projetado</span>
          <span className={`financial-value ${a.lucroBrutoProjetado >= 0 ? 'highlight' : 'danger'}`}>{formatCurrency(a.lucroBrutoProjetado)}</span>
          <span className="financial-sub">Deságio: {formatPercent(a.desagio)}</span>
        </div>
      </div>

      <div className="card-date">📅 Leilão: {formatDateTime(lot.dataLeilao)} — <strong>{daysLabel}</strong>&nbsp; | &nbsp;Leiloeiro: {lot.leiloeiro}</div>

      {expanded && (
        <div className="card-details">
          <div className="detail-grid">
            <div className="financial-item">
              <span className="financial-label">Comissão Leiloeiro (5%)</span>
              <span className="financial-value" style={{ fontSize: '13px' }}>{formatCurrency(a.custosOcultos.comissaoLeiloeiro)}</span>
            </div>
            <div className="financial-item">
              <span className="financial-label">ITBI</span>
              <span className="financial-value" style={{ fontSize: '13px' }}>{formatCurrency(a.custosOcultos.itbi)}</span>
            </div>
            <div className="financial-item">
              <span className="financial-label">Registro/Escritura</span>
              <span className="financial-value" style={{ fontSize: '13px' }}>{formatCurrency(a.custosOcultos.registroEscritura)}</span>
            </div>
            <div className="financial-item">
              <span className="financial-label">Custos Extras Total</span>
              <span className="financial-value gold" style={{ fontSize: '13px' }}>{formatCurrency(a.custosOcultos.total)}</span>
            </div>
            {a.custosOcultos.dividasIPTU > 0 && (
              <div className="financial-item">
                <span className="financial-label">Dívida IPTU</span>
                <span className="financial-value danger" style={{ fontSize: '13px' }}>{formatCurrency(a.custosOcultos.dividasIPTU)}</span>
              </div>
            )}
            {a.custosOcultos.dividasCondominio > 0 && (
              <div className="financial-item">
                <span className="financial-label">Dívida Condomínio</span>
                <span className="financial-value danger" style={{ fontSize: '13px' }}>{formatCurrency(a.custosOcultos.dividasCondominio)}</span>
              </div>
            )}
            <div className="financial-item">
              <span className="financial-label">Índice de Liquidez</span>
              <span className="financial-value" style={{ fontSize: '13px' }}>{a.liquidez}/10 {a.liquidez >= 7 ? '🟢' : a.liquidez >= 4 ? '🟡' : '🔴'}</span>
            </div>
            <div className="financial-item">
              <span className="financial-label">Score Composto</span>
              <span className="financial-value highlight" style={{ fontSize: '13px' }}>{a.scoreComposto.toFixed(1)} pts</span>
            </div>
          </div>

          {lot.descricao && (
            <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '12px', lineHeight: '1.5' }}>📝 {lot.descricao}</p>
          )}

          <div className="card-attention">
            <span className="card-attention-icon">⚠️</span>
            <span>{getAttentionPoints(lot)}</span>
          </div>

          {lot.sourceUrl && (
            <div style={{ marginTop: '12px' }}>
              <a href={lot.sourceUrl} target="_blank" rel="noopener noreferrer" className="card-link" onClick={e => e.stopPropagation()}>🔗 Ver no site do leiloeiro →</a>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
