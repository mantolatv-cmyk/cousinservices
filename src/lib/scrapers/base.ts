// ============================================================
// CousinServices — Base Scraper Class
// Classe abstrata para todos os scrapers de leilão
// ============================================================

import puppeteer, { Browser, Page } from 'puppeteer';

export interface ScrapedLot {
  source: string;
  sourceUrl: string;
  endereco: string;
  bairro: string;
  cidade: string;
  estado: string;
  areaM2: number;
  tipo: 'Terreno' | 'Lote';
  descricao: string;
  status: '1ª Praça' | '2ª Praça' | 'Venda Direta';
  tipoLeilao: 'Judicial' | 'Extrajudicial' | 'Alienação Fiduciária';
  dataLeilao: string;
  leiloeiro: string;
  valorAvaliacao: number;
  lanceInicial: number;
  dividaIPTU?: number;
  dividaCondominio?: number;
  editalUrl?: string;
  imageUrl?: string;
}

export abstract class BaseScraper {
  protected browser: Browser | null = null;
  protected page: Page | null = null;
  public sourceName: string;
  protected baseUrl: string;
  protected maxRetries = 2;
  protected delayMs = 2000;

  constructor(sourceName: string, baseUrl: string) {
    this.sourceName = sourceName;
    this.baseUrl = baseUrl;
  }

  async init(): Promise<void> {
    console.log(`  [${this.sourceName}] Iniciando browser...`);
    this.browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--window-size=1920,1080',
      ],
    });
    this.page = await this.browser.newPage();
    await this.page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36'
    );
    await this.page.setViewport({ width: 1920, height: 1080 });
  }

  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.page = null;
    }
  }

  protected async delay(ms?: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms || this.delayMs));
  }

  protected async navigateWithRetry(url: string): Promise<boolean> {
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        console.log(`  [${this.sourceName}] Navegando para ${url} (tentativa ${attempt})...`);
        await this.page!.goto(url, {
          waitUntil: 'networkidle2',
          timeout: 30000,
        });
        return true;
      } catch (err) {
        console.warn(`  [${this.sourceName}] Falha na navegação (tentativa ${attempt}): ${(err as Error).message}`);
        if (attempt < this.maxRetries) {
          await this.delay(3000);
        }
      }
    }
    return false;
  }

  protected parseCurrency(text: string): number {
    if (!text) return 0;
    const cleaned = text
      .replace(/[R$\s]/g, '')
      .replace(/\./g, '')
      .replace(',', '.');
    return parseFloat(cleaned) || 0;
  }

  protected parseArea(text: string): number {
    if (!text) return 0;
    const match = text.match(/([\d.,]+)\s*m[²2]/i);
    if (match) {
      return parseFloat(match[1].replace('.', '').replace(',', '.')) || 0;
    }
    return 0;
  }

  abstract scrape(): Promise<ScrapedLot[]>;
}
