'use client';

import React, { useState, useMemo, useCallback, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, CartesianGrid, Legend, PieChart, Pie } from 'recharts';
import { getAllZonas } from '@/data/spRegions';
import { formatCurrency, formatCurrencyCompact, formatPercent, formatArea, formatDate, formatDateTime, daysUntil, getAttentionPoints } from '@/lib/format';
import ChatBot from '@/components/ChatBot';
import type { AuctionLot, FilterState, ScrapingStatus as ScrapingStatusType } from '@/lib/types';



// ===================== CONFIDENCE SEMAPHORE =====================
function getConfidence(lot: AuctionLot): { level: 'high' | 'medium' | 'low'; label: string; color: string } {
  const roi = lot.analysis?.roiEstimado || 0;
  const hasZone = !!lot.zona;
  const hasCEP = !!lot.cep;
  // If ROI is absurdly high, it's likely a pricing fallback
  if (roi > 2000) return { level: 'low', label: 'Baixa', color: '#FF3366' };
  if (roi > 500 && !hasCEP) return { level: 'low', label: 'Baixa', color: '#FF3366' };
  if (roi > 200 || !hasZone) return { level: 'medium', label: 'Média', color: '#FFB800' };
  return { level: 'high', label: 'Alta', color: '#00FFA3' };
}

const ITEMS_PER_PAGE = 20;
const PIE_COLORS = ['#00FFA3', '#00E0FF', '#FFB800', '#C084FC', '#FF3366', '#60A5FA'];

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
    ordenarPor: 'confianca',
    areaMinima: 0,
    areaMaxima: 100000,
  });
  const [botFilter, setBotFilter] = useState<string | null>(null);
  const [expandedCard, setExpandedCard] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [priceRange, setPriceRange] = useState<string>('all');
  const [isDark, setIsDark] = useState(true);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [aiSettings, setAiSettings] = useState({
    provider: 'gemini',
    deepseekKey: ''
  });

  // Load favorites and settings from localStorage
  useEffect(() => {
    try {
      const savedFavs = localStorage.getItem('cs-favorites');
      if (savedFavs) setFavorites(new Set(JSON.parse(savedFavs)));

      const savedSettings = localStorage.getItem('cs-ai-settings');
      if (savedSettings) {
        setAiSettings(JSON.parse(savedSettings));
      } else {
        // Pre-fill with the provided key if available in the environment or as a fallback
        // For now, just a placeholder or the one from user if we want to be helpful
        // But better to let them paste it or get it from .env on backend
      }
    } catch {}
  }, []);

  const toggleFavorite = useCallback((id: string) => {
    setFavorites(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      localStorage.setItem('cs-favorites', JSON.stringify([...next]));
      return next;
    });
  }, []);

  // Dark/Light mode
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
  }, [isDark]);

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

    // Price range filter
    if (priceRange !== 'all') {
      const [minP, maxP] = priceRange.split('-').map(Number);
      lots = lots.filter(l => {
        const inv = l.analysis?.investimentoTotal || 0;
        if (maxP === 0) return inv >= minP; // "500000-0" means >= 500k
        return inv >= minP && inv <= maxP;
      });
    }

    // Sort
    const sortBy = filters.ordenarPor || 'roi';
    lots.sort((a, b) => {
      const aa = a.analysis, bb = b.analysis;
      if (!aa || !bb) return 0;
      switch (sortBy) {
        case 'confianca': {
          const scoreA = getConfidence(a).level === 'high' ? 3 : getConfidence(a).level === 'medium' ? 2 : 1;
          const scoreB = getConfidence(b).level === 'high' ? 3 : getConfidence(b).level === 'medium' ? 2 : 1;
          if (scoreA !== scoreB) return scoreB - scoreA;
          return bb.scoreComposto - aa.scoreComposto;
        }
        case 'roi': return bb.scoreComposto - aa.scoreComposto;
        case 'desagio': return bb.desagio - aa.desagio;
        case 'preco': return aa.investimentoTotal - bb.investimentoTotal;
        case 'area': return b.areaM2 - a.areaM2;
        default: return bb.scoreComposto - aa.scoreComposto;
      }

    });

    return lots;
  }, [allLots, filters, botFilter, priceRange]);

  const metrics = useMemo(() => calcMetrics(filteredLots), [filteredLots]);

  // Reset page when filters change
  useEffect(() => { setCurrentPage(1); }, [filters, botFilter, priceRange]);

  const chartData = useMemo(() => {
    return filteredLots.slice(0, 8).map(lot => ({
      name: lot.bairro.length > 20 ? lot.bairro.substring(0, 20) + '…' : lot.bairro,
      leilao: lot.analysis?.precoM2Leilao || 0,
      mercado: lot.analysis?.precoM2Mercado || 0,
      roi: lot.analysis?.roiEstimado || 0,
    }));
  }, [filteredLots]);

  // Region distribution for PieChart
  const regionData = useMemo(() => {
    const map = new Map<string, number>();
    filteredLots.forEach(l => {
      const zone = l.zona || 'Outros';
      map.set(zone, (map.get(zone) || 0) + 1);
    });
    return Array.from(map.entries()).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [filteredLots]);

  // Pagination
  const totalPages = Math.ceil(filteredLots.length / ITEMS_PER_PAGE);
  const paginatedLots = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredLots.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredLots, currentPage]);

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
    try {
      // 1. Trigger the server-side update (scraping + analysis + git push)
      const res = await fetch('/api/update', { method: 'POST' });
      const result = await res.json();
      
      if (result.success) {
        // 2. Refresh the UI with the newly generated data
        await fetchLots();
        alert('🚀 Atualização Completa!\nNovos dados coletados, analisados e sincronizados no GitHub.');
      } else {
        alert('⚠️ Houve um problema na atualização:\n' + result.message);
      }
    } catch (err) {
      console.error('Update failed:', err);
      alert('❌ Erro de conexão ao tentar atualizar os dados.');
    } finally {
      setIsRefreshing(false);
    }
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
          <button className="btn btn-sm" onClick={() => setIsSettingsOpen(true)} title="Configurações AI">
            ⚙️
          </button>
          <button className="btn btn-sm" onClick={() => setIsDark(!isDark)} title="Alternar tema" style={{ fontSize: '16px', padding: '8px 12px' }}>
            {isDark ? '☀️' : '🌙'}
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
                <option value="confianca">Confiança</option>
                <option value="roi">Maior ROI</option>
                <option value="desagio">Maior Deságio</option>
                <option value="preco">Menor Preço</option>
                <option value="area">Maior Área</option>
              </select>
            </div>
            <div className="filter-divider" />
            <div className="filter-group">
              <label className="filter-label">Investimento</label>
              <select className="filter-select" value={priceRange} onChange={e => setPriceRange(e.target.value)}>
                <option value="all">Todos</option>
                <option value="0-50000">Até R$ 50K</option>
                <option value="50000-200000">R$ 50K — R$ 200K</option>
                <option value="200000-500000">R$ 200K — R$ 500K</option>
                <option value="500000-0">Acima de R$ 500K</option>
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
              <div className="chart-title">📊 Preço m²: Oportunidade vs. Valor de Mercado</div>
              
              <svg width="0" height="0">
                <defs>
                  <linearGradient id="neonGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#00FFA3" stopOpacity={1} />
                    <stop offset="100%" stopColor="#00D185" stopOpacity={0.8} />
                  </linearGradient>
                  <filter id="neonGlow" x="-20%" y="-20%" width="140%" height="140%">
                    <feGaussianBlur in="SourceGraphic" stdDeviation="3" result="blur" />
                    <feComposite in="SourceGraphic" in2="blur" operator="over" />
                  </filter>
                  <filter id="whiteGlow" x="-20%" y="-20%" width="140%" height="140%">
                    <feGaussianBlur in="SourceGraphic" stdDeviation="2" result="blur" />
                    <feComposite in="SourceGraphic" in2="blur" operator="over" />
                  </filter>
                </defs>
              </svg>

              <ResponsiveContainer width="100%" height={320}>
                <ComposedChart data={chartData} margin={{ top: 20, right: 20, bottom: 60, left: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                  <XAxis 
                    dataKey="name" 
                    tick={{ fill: '#94A3B8', fontSize: 10, fontWeight: 600 }} 
                    axisLine={false} 
                    tickLine={false}
                    interval={0}
                    angle={-45}
                    textAnchor="end"
                    height={70}
                  />
                  <YAxis 
                    tick={{ fill: '#94A3B8', fontSize: 10 }} 
                    axisLine={false} 
                    tickLine={false} 
                    tickFormatter={(v: number) => `R$${(v/1000).toFixed(1)}k`} 
                  />
                  <Tooltip
                    cursor={{ fill: 'rgba(255,255,255,0.03)' }}
                    contentStyle={{ 
                      background: 'rgba(5, 8, 15, 0.95)', 
                      border: '1px solid rgba(0, 255, 163, 0.4)', 
                      borderRadius: '16px', 
                      fontSize: '12px',
                      backdropFilter: 'blur(15px)',
                      boxShadow: '0 10px 40px rgba(0,0,0,0.8), 0 0 20px rgba(0, 255, 163, 0.1)'
                    }}
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    formatter={(value: any, name: any) => [
                      <span key={name} style={{ color: name === 'leilao' ? '#00FFA3' : '#FFFFFF', fontWeight: 800, textShadow: name === 'leilao' ? '0 0 10px rgba(0,255,163,0.5)' : 'none' }}>
                        {formatCurrency(Number(value))}
                      </span>,
                      name === 'leilao' ? 'Preço Leilão' : 'Valor Mercado'
                    ]}
                  />
                  <Legend 
                    verticalAlign="top" 
                    align="right" 
                    iconType="circle"
                    wrapperStyle={{ paddingBottom: '30px', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em' }} 
                  />
                  <Bar 
                    dataKey="leilao" 
                    name="Preço Leilão" 
                    fill="url(#neonGradient)" 
                    radius={[6, 6, 0, 0]} 
                    barSize={28}
                    style={{ filter: 'url(#neonGlow)' }}
                    animationDuration={2000}
                    animationEasing="ease-out"
                  />
                  <Line 
                    type="monotone" 
                    dataKey="mercado" 
                    name="Valor Mercado" 
                    stroke="#FFFFFF" 
                    strokeWidth={3}
                    strokeDasharray="6 4"
                    dot={{ fill: '#FFFFFF', r: 5, strokeWidth: 2, stroke: '#00FFA3', filter: 'url(#whiteGlow)' }}
                    activeDot={{ r: 8, stroke: '#FFFFFF', strokeWidth: 2, fill: '#00FFA3', filter: 'url(#neonGlow)' }}
                    animationDuration={2500}
                    animationEasing="ease-in-out"
                  />
                </ComposedChart>
              </ResponsiveContainer>
              <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)', marginTop: '12px', textAlign: 'center', fontStyle: 'italic', letterSpacing: '0.02em' }}>
                * A barra em <span style={{ color: '#00FFA3', fontWeight: 700 }}>NEON EMERALD</span> representa a oportunidade; o horizonte <span style={{ color: '#FFFFFF', fontWeight: 700 }}>BRANCO</span> é o teto de mercado.
              </div>
            </div>
          )}

          {/* === REGION DISTRIBUTION CHART === */}
          {regionData.length > 1 && (
            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '24px',
              marginBottom: '32px',
            }}>
              <div className="chart-section animate-in" style={{ marginBottom: 0 }}>
                <div className="chart-title" style={{ fontSize: '16px' }}>🗺️ Distribuição por Região</div>
                <ResponsiveContainer width="100%" height={250}>
                  <PieChart>
                    <Pie
                      data={regionData}
                      cx="50%" cy="50%"
                      innerRadius={55} outerRadius={95}
                      paddingAngle={3}
                      dataKey="value"
                      stroke="rgba(0,0,0,0.3)"
                      strokeWidth={2}
                      animationDuration={1500}
                      label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}
                    >
                      {regionData.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        background: 'rgba(5, 8, 15, 0.95)',
                        border: '1px solid rgba(0, 255, 163, 0.3)',
                        borderRadius: '12px',
                        fontSize: '12px',
                      }}
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      formatter={(value: any) => [`${value} terreno${value !== 1 ? 's' : ''}`, 'Quantidade']}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="chart-section animate-in" style={{ marginBottom: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                <div className="chart-title" style={{ fontSize: '16px' }}>📊 Resumo por Zona</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {regionData.map((r, i) => (
                    <div key={r.name} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div style={{ width: '12px', height: '12px', borderRadius: '3px', background: PIE_COLORS[i % PIE_COLORS.length], flexShrink: 0 }} />
                      <span style={{ flex: 1, fontSize: '13px', fontWeight: 600 }}>{r.name}</span>
                      <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '14px', fontWeight: 700, color: PIE_COLORS[i % PIE_COLORS.length] }}>{r.value}</span>
                      <div style={{ width: '80px', height: '6px', background: 'rgba(255,255,255,0.05)', borderRadius: '3px', overflow: 'hidden' }}>
                        <div style={{ width: `${(r.value / Math.max(...regionData.map(x => x.value))) * 100}%`, height: '100%', background: PIE_COLORS[i % PIE_COLORS.length], borderRadius: '3px', transition: 'width 1s ease' }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}


          {/* === FAVORITES SECTION === */}
          {favorites.size > 0 && (
            <div className="cards-section">
              <div className="cards-header">
                <div className="cards-title">⭐ Meus Favoritos <span className="cards-count">— {favorites.size} salvo{favorites.size !== 1 ? 's' : ''}</span></div>
              </div>
              <div className="cards-grid">
                {filteredLots.filter(l => favorites.has(l.id)).map((lot, idx) => (
                  <OpportunityCard key={`fav-${lot.id}`} lot={lot} rank={idx + 1} expanded={expandedCard === lot.id} onToggle={() => setExpandedCard(expandedCard === lot.id ? null : lot.id)} isFavorite={true} onToggleFavorite={() => toggleFavorite(lot.id)} />
                ))}
              </div>
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
              <>
              <div className="cards-grid">
                {paginatedLots.map((lot, idx) => (
                  <OpportunityCard key={lot.id} lot={lot} rank={(currentPage - 1) * ITEMS_PER_PAGE + idx + 1} expanded={expandedCard === lot.id} onToggle={() => setExpandedCard(expandedCard === lot.id ? null : lot.id)} isFavorite={favorites.has(lot.id)} onToggleFavorite={() => toggleFavorite(lot.id)} />
                ))}
              </div>

              {/* Pagination Controls */}
              {totalPages > 1 && (
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '12px',
                  marginTop: '24px',
                  padding: '16px',
                }}>
                  <button className="btn btn-sm" onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}
                    style={{ opacity: currentPage === 1 ? 0.4 : 1 }}>← Anterior</button>
                  <div style={{ display: 'flex', gap: '4px' }}>
                    {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                      let page: number;
                      if (totalPages <= 7) { page = i + 1; }
                      else if (currentPage <= 4) { page = i + 1; }
                      else if (currentPage >= totalPages - 3) { page = totalPages - 6 + i; }
                      else { page = currentPage - 3 + i; }
                      return (
                        <button key={page} onClick={() => setCurrentPage(page)}
                          style={{
                            width: '36px', height: '36px', borderRadius: '8px',
                            border: page === currentPage ? '1px solid var(--primary)' : '1px solid var(--border)',
                            background: page === currentPage ? 'var(--primary-glow-strong)' : 'var(--bg-card)',
                            color: page === currentPage ? 'var(--primary)' : 'var(--text-muted)',
                            fontFamily: "'JetBrains Mono', monospace",
                            fontSize: '13px', fontWeight: 700, cursor: 'pointer',
                            transition: 'all 0.2s',
                          }}>{page}</button>
                      );
                    })}
                  </div>
                  <button className="btn btn-sm" onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}
                    style={{ opacity: currentPage === totalPages ? 0.4 : 1 }}>Próximo →</button>
                </div>
              )}
              </>
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

      {/* === SETTINGS MODAL === */}
      {isSettingsOpen && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)',
          backdropFilter: 'blur(8px)', zIndex: 10000,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          animation: 'fadeIn 0.3s ease'
        }}>
          <div style={{
            width: '450px', background: 'var(--bg-surface)',
            border: '1px solid var(--border-active)', borderRadius: 'var(--radius-lg)',
            padding: '32px', boxShadow: 'var(--shadow-lg)'
          }}>
            <h2 style={{ marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '12px' }}>
              ⚙️ Configurações AI
            </h2>
            
            <div style={{ marginBottom: '24px' }}>
              <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-muted)', marginBottom: '8px', textTransform: 'uppercase' }}>
                Provedor de IA
              </label>
              <select 
                className="filter-select" 
                style={{ width: '100%' }}
                value={aiSettings.provider}
                onChange={e => setAiSettings(prev => ({ ...prev, provider: e.target.value }))}
              >
                <option value="gemini">Google Gemini (Padrão)</option>
                <option value="deepseek">DeepSeek AI</option>
              </select>
            </div>

            <div style={{ marginBottom: '32px' }}>
              <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-muted)', marginBottom: '8px', textTransform: 'uppercase' }}>
                DeepSeek API Key
              </label>
              <input 
                type="password"
                className="filter-input"
                style={{ width: '100%' }}
                placeholder="sk-..."
                value={aiSettings.deepseekKey}
                onChange={e => setAiSettings(prev => ({ ...prev, deepseekKey: e.target.value }))}
              />
              <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '8px' }}>
                Sua chave é salva localmente no navegador.
              </p>
            </div>

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button className="btn" onClick={() => setIsSettingsOpen(false)}>Cancelar</button>
              <button className="btn btn-primary" onClick={() => {
                localStorage.setItem('cs-ai-settings', JSON.stringify(aiSettings));
                setIsSettingsOpen(false);
                alert('Configurações salvas com sucesso!');
              }}>Salvar Alterações</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ===================== OPPORTUNITY CARD =====================
function OpportunityCard({ lot, rank, expanded, onToggle, isFavorite, onToggleFavorite }: { lot: AuctionLot; rank: number; expanded: boolean; onToggle: () => void; isFavorite?: boolean; onToggleFavorite?: () => void }) {
  const a = lot.analysis;
  if (!a) return null;

  const days = daysUntil(lot.dataLeilao);
  const daysLabel = days > 0 ? `em ${days} dia${days !== 1 ? 's' : ''}` : days === 0 ? 'HOJE' : 'Encerrado';
  const roiClass = a.roiEstimado >= 50 ? 'high' : '';
  return (
    <div className={`opportunity-card animate-in ${expanded ? 'expanded' : ''}`} onClick={onToggle}>
      <div className="card-rank">{rank}</div>
      {/* Favorite Button */}
      <button
        onClick={(e) => { e.stopPropagation(); onToggleFavorite?.(); }}
        style={{
          position: 'absolute', top: '16px', right: '56px', zIndex: 3,
          background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer',
          filter: isFavorite ? 'none' : 'grayscale(1) opacity(0.4)',
          transition: 'all 0.2s',
        }}
        title={isFavorite ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}
      >
        {isFavorite ? '⭐' : '☆'}
      </button>

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
        {(() => {
          const conf = getConfidence(lot);
          return <span className="badge" style={{ background: `${conf.color}15`, color: conf.color, border: `1px solid ${conf.color}30`, fontSize: '10px' }}>{conf.level === 'high' ? '🟢' : conf.level === 'medium' ? '🟡' : '🔴'} Confiança {conf.label}</span>;
        })()}
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
