// ============================================================
// CousinServices — Scraper Orchestrator
// Executa todos os scrapers e consolida os resultados
// ============================================================

import { PortalZukScraper } from './portalZuk';
import { MegaLeiloesScraper } from './megaLeiloes';
// import { CaixaImoveisScraper } from './caixaImoveis';
import { BaseScraper, ScrapedLot } from './base';

export interface ScrapeResult {
  source: string;
  status: 'success' | 'error' | 'no-results';
  lots: ScrapedLot[];
  error?: string;
  durationMs: number;
}

export async function runAllScrapers(): Promise<ScrapeResult[]> {
  const scrapers: BaseScraper[] = [
    new PortalZukScraper(),
    new MegaLeiloesScraper(),
    // new CaixaImoveisScraper(),
  ];

  const results: ScrapeResult[] = [];

  for (const scraper of scrapers) {
    const start = Date.now();
    console.log(`\n${'='.repeat(60)}`);
    console.log(`🔍 Iniciando scraping: ${scraper.sourceName}`);
    console.log(`${'='.repeat(60)}`);

    try {
      const lots = await scraper.scrape();
      const duration = Date.now() - start;

      results.push({
        source: scraper.sourceName,
        status: lots.length > 0 ? 'success' : 'no-results',
        lots,
        durationMs: duration,
      });

      console.log(`✅ ${scraper.sourceName}: ${lots.length} lotes em ${(duration / 1000).toFixed(1)}s`);
    } catch (err) {
      const duration = Date.now() - start;
      results.push({
        source: scraper.sourceName,
        status: 'error',
        lots: [],
        error: (err as Error).message,
        durationMs: duration,
      });
      console.error(`❌ ${scraper.sourceName}: Erro - ${(err as Error).message}`);
    }
  }

  return results;
}

export function consolidateLots(results: ScrapeResult[]): ScrapedLot[] {
  const allLots: ScrapedLot[] = [];

  for (const r of results) {
    allLots.push(...r.lots);
  }

  // Deduplicate by address similarity
  const unique = allLots.filter((lot, idx, arr) => {
    return idx === arr.findIndex(l =>
      l.endereco === lot.endereco && l.areaM2 === lot.areaM2
    );
  });

  return unique;
}
