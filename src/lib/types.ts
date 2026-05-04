// ============================================================
// CousinServices — TypeScript Interfaces & Types
// ============================================================

export interface AuctionLot {
  id: string;
  source: AuctionSource;
  sourceUrl: string;
  editalUrl?: string;

  // Location
  endereco: string;
  bairro: string;
  cidade: string;
  estado: string;
  cep?: string;
  zona?: 'Norte' | 'Sul' | 'Leste' | 'Oeste' | 'Centro' | 'Metropolitana';

  // Property Details
  areaM2: number;
  tipo: 'Terreno' | 'Lote';
  descricao?: string;
  matricula?: string;

  // Auction Details
  status: '1ª Praça' | '2ª Praça' | 'Venda Direta';
  tipoLeilao: 'Judicial' | 'Extrajudicial' | 'Alienação Fiduciária';
  dataLeilao: string; // ISO date
  leiloeiro: string;

  // Values
  valorAvaliacao: number;
  lanceInicial: number;
  lanceInicial2aPraca?: number;

  // Debts (from edital)
  dividaIPTU?: number;
  dividaCondominio?: number;
  outrasDiv?: number;

  // Market Data (populated after analysis)
  valorMercadoEstimado?: number;
  precoM2Mercado?: number;

  // Analysis (populated after calculation)
  analysis?: InvestmentAnalysis;

  // Metadata
  scrapedAt: string; // ISO date
  imageUrl?: string;
}

export interface HiddenCosts {
  comissaoLeiloeiro: number;   // 5%
  itbi: number;                // 3-4%
  registroEscritura: number;   // 1.5-2%
  dividasIPTU: number;
  dividasCondominio: number;
  total: number;
}

export interface InvestmentAnalysis {
  lanceConsiderado: number;
  custosOcultos: HiddenCosts;
  investimentoTotal: number;
  valorMercadoEstimado: number;
  desagio: number;             // % discount vs market
  lucroBrutoProjetado: number;
  roiEstimado: number;         // %
  precoM2Leilao: number;
  precoM2Mercado: number;
  liquidez: number;            // 1-10 score
  scoreComposto: number;       // Final ranking score
}

export type AuctionSource =
  | 'Portal Zuk'
  | 'Mega Leilões'
  | 'Sodré Santoro'
  | 'Milan Leilões'
  | 'Freitas Leiloeiro'
  | 'Caixa Econômica';

export interface ScrapingStatus {
  source: AuctionSource;
  status: 'idle' | 'scraping' | 'success' | 'error';
  lastScrape?: string;
  itemsFound: number;
  errorMessage?: string;
}

export interface FilterState {
  regiao: string;
  zona: string;
  roiMinimo: number;
  areaMinima: number;
  areaMaxima: number;
  tipoLeilao: string;
  ordenarPor: 'roi' | 'desagio' | 'preco' | 'area';
}

export interface DashboardMetrics {
  totalOportunidades: number;
  melhorROI: number;
  desagioMedio: number;
  investimentoMinimo: number;
  lucroPotencialTotal: number;
  mediaPrecoM2: number;
}

export interface SPRegion {
  bairro: string;
  zona: 'Norte' | 'Sul' | 'Leste' | 'Oeste' | 'Centro' | 'Metropolitana';
  liquidez: number; // 1-10
  precoM2MedioTerreno: number;
  demandaAlta: boolean;
}
