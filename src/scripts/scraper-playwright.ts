// ============================================================
// CousinServices — Playwright Scraper
// Scraping de terrenos com Playwright (Zukerman + Mega Leilões)
// Salva dados em leiloes.json
// Usage: npx tsx src/scripts/scraper-playwright.ts
// ============================================================

import { chromium, Page } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';
import { scrapeCaixa } from '../lib/scrapers/caixaImoveis';

export interface LeilaoItem {
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
  status: string;
  tipoLeilao: string;
  dataLeilao: string;
  leiloeiro: string;
  descricao: string;
  scrapedAt: string;
}

// ===================== HELPERS =====================
function parseCurrency(text: string): number {
  if (!text) return 0;
  const cleaned = text.replace(/[R$\s.]/g, '').replace(',', '.');
  return parseFloat(cleaned) || 0;
}

function parseArea(text: string): number {
  if (!text) return 0;
  const match = text.match(/([\d.,]+)\s*m[²2]/i);
  if (match) return parseFloat(match[1].replace('.', '').replace(',', '.')) || 0;
  return 0;
}

function extractCEP(text: string): string {
  const match = text.match(/\d{5}-?\d{3}/);
  return match ? match[0] : '';
}

// ===================== ZUKERMAN (Portal Zuk) =====================
async function scrapeZukerman(page: Page): Promise<LeilaoItem[]> {
  const items: LeilaoItem[] = [];
  console.log('\n🔍 [Zukerman] Iniciando scraping...');

  try {
    await page.goto('https://www.portalzuk.com.br/leilao-de-imoveis/t/todos-imoveis/terrenos?estado=SP', {
      waitUntil: 'networkidle',
      timeout: 30000,
    });
    await page.waitForTimeout(3000);

    // Extract listings from the page
    const rawItems = await page.evaluate(() => {
      const results: Array<{
        title: string;
        endereco: string;
        prices: string[];
        area: string;
        link: string;
        fullText: string;
        status: string;
      }> = [];

      const cards = document.querySelectorAll('article, [class*="card"], [class*="Card"], [class*="lote"], [class*="imovel"]');

      cards.forEach(card => {
        const el = card as HTMLElement;
        const text = el.innerText || '';
        if (!text.match(/terreno|lote/i)) return;
        if (text.length < 30) return;

        const linkEl = el.querySelector('a[href*="imovel"]') as HTMLAnchorElement;
        const prices = text.match(/R\$\s*[\d.,]+/g) || [];
        const areaMatch = text.match(/[\d.,]+\s*m[²2]/i);

        results.push({
          title: el.querySelector('h2,h3,h4,[class*="title"],[class*="titulo"]')?.textContent?.trim() || '',
          endereco: el.querySelector('[class*="endereco"],[class*="address"],[class*="local"]')?.textContent?.trim() || '',
          prices: prices.map(p => p.trim()),
          area: areaMatch?.[0] || '',
          link: linkEl?.href || '',
          fullText: text.substring(0, 300),
          status: text.match(/2[ªa]\s*praça/i) ? '2ª Praça' : text.match(/1[ªa]\s*praça/i) ? '1ª Praça' : 'Venda Direta',
        });
      });

      return results;
    });

    console.log(`  [Zukerman] ${rawItems.length} cards encontrados no DOM`);

    for (let i = 0; i < rawItems.length; i++) {
      const r = rawItems[i];
      const area = parseArea(r.area);
      const lance = parseCurrency(r.prices[0] || '');
      if (area <= 0 || lance <= 0) continue;

      const cep = extractCEP(r.fullText);
      const cidadeMatch = r.fullText.match(/([A-Za-zÀ-ÿ\s]+)\s*\/\s*SP/);
      const cidade = cidadeMatch?.[1]?.trim() || 'São Paulo';
      const bairroMatch = r.endereco.match(/[-–]\s*([^,\-–]+)/);
      const bairro = bairroMatch?.[1]?.trim() || r.title.split('\n')[0]?.trim() || cidade;

      items.push({
        id: `zuk-pw-${i}`,
        fonte: 'Zukerman (Portal Zuk)',
        url: r.link || 'https://www.portalzuk.com.br',
        endereco: r.endereco || r.title,
        bairro,
        cidade,
        estado: 'SP',
        cep,
        areaM2: area,
        lanceInicial: lance,
        valorAvaliacao: parseCurrency(r.prices[1] || '') || lance * 1.3,
        status: r.status,
        tipoLeilao: r.fullText.match(/judicial/i) ? 'Judicial' : 'Extrajudicial',
        dataLeilao: extractDate(r.fullText),
        leiloeiro: 'Zukerman Leilões',
        descricao: r.fullText.substring(0, 200),
        scrapedAt: new Date().toISOString(),
      });
    }
  } catch (err) {
    console.error(`  [Zukerman] Erro: ${(err as Error).message}`);
  }

  console.log(`  [Zukerman] ✅ ${items.length} terrenos extraídos`);
  return items;
}

// ===================== SODRÉ SANTORO =====================
async function scrapeSodreSantoro(page: Page): Promise<LeilaoItem[]> {
  const items: LeilaoItem[] = [];
  console.log('\n🔍 [Sodré Santoro] Iniciando scraping...');

  try {
    await page.goto('https://www.sodresantoro.com.br/imoveis/lotes?term=terreno', {
      waitUntil: 'networkidle',
      timeout: 45000,
    });
    await page.waitForTimeout(5000);

    const rawItems = await page.evaluate(() => {
      const results: Array<{
        title: string;
        prices: string[];
        link: string;
        fullText: string;
      }> = [];

      // Select cards - based on a.wrapper or similar elements observed
      const cards = document.querySelectorAll('a.wrapper, [class*="card"], [class*="LotCard"]');
      
      cards.forEach(card => {
        const el = card as HTMLElement;
        const text = el.innerText || '';
        if (!text.match(/terreno|lote/i)) return;
        
        const link = (el instanceof HTMLAnchorElement ? el.href : el.querySelector('a')?.href) || '';
        const prices = text.match(/R\$\s*[\d.,]+/g) || [];

        results.push({
          title: el.querySelector('[class*="text-on-surface"], h2, h3')?.textContent?.trim() || '',
          prices: prices.map(p => p.trim()),
          link,
          fullText: text.substring(0, 400)
        });
      });
      return results;
    });

    console.log(`  [Sodré Santoro] ${rawItems.length} cards encontrados`);

    for (let i = 0; i < rawItems.length; i++) {
      const r = rawItems[i];
      const lance = parseCurrency(r.prices[0] || '');
      if (lance <= 0) continue;

      items.push({
        id: `sodre-pw-${i}-${Date.now()}`,
        fonte: 'Sodré Santoro',
        url: r.link || 'https://www.sodresantoro.com.br',
        endereco: r.title || 'São Paulo',
        bairro: r.title.split('-')[0]?.trim() || 'São Paulo',
        cidade: 'São Paulo',
        estado: 'SP',
        cep: extractCEP(r.fullText),
        areaM2: parseArea(r.fullText) || 250, // Default for lot if not found
        lanceInicial: lance,
        valorAvaliacao: lance * 1.5,
        status: r.fullText.match(/encerrado/i) ? 'Encerrado' : 'Aberto',
        tipoLeilao: 'Extrajudicial',
        dataLeilao: extractDate(r.fullText),
        leiloeiro: 'Sodré Santoro',
        descricao: r.fullText.substring(0, 200),
        scrapedAt: new Date().toISOString(),
      });
    }
  } catch (err) {
    console.error(`  [Sodré Santoro] Erro: ${(err as Error).message}`);
  }

  console.log(`  [Sodré Santoro] ✅ ${items.length} terrenos extraídos`);
  return items;
}

// ===================== FREITAS LEILOEIRO =====================
async function scrapeFreitasLeiloeiro(page: Page): Promise<LeilaoItem[]> {
  const items: LeilaoItem[] = [];
  console.log('\n🔍 [Freitas Leiloeiro] Iniciando scraping...');

  try {
    await page.goto('https://www.freitasleiloeiro.com.br/Leiloes/Pesquisar?query=&categoria=2', {
      waitUntil: 'networkidle',
      timeout: 45000,
    });
    await page.waitForTimeout(5000);

    const rawItems = await page.evaluate(() => {
      const results: Array<{
        title: string;
        prices: string[];
        link: string;
        fullText: string;
      }> = [];

      const cards = document.querySelectorAll('.col-md-3, .card, [class*="lote"]');
      
      cards.forEach(card => {
        const el = card as HTMLElement;
        const text = el.innerText || '';
        if (!text.match(/terreno|lote/i)) return;

        const linkEl = el.querySelector('a[href*="LoteDetalhes"]') as HTMLAnchorElement;
        const prices = text.match(/R\$\s*[\d.,]+/g) || [];

        results.push({
          title: el.querySelector('p, span')?.textContent?.trim() || '',
          prices: prices.map(p => p.trim()),
          link: linkEl?.href || '',
          fullText: text.substring(0, 400)
        });
      });
      return results;
    });

    console.log(`  [Freitas Leiloeiro] ${rawItems.length} cards encontrados`);

    for (let i = 0; i < rawItems.length; i++) {
      const r = rawItems[i];
      const lance = parseCurrency(r.prices[0] || '');
      if (lance <= 0) continue;

      items.push({
        id: `freitas-pw-${i}-${Date.now()}`,
        fonte: 'Freitas Leiloeiro',
        url: r.link || 'https://www.freitasleiloeiro.com.br',
        endereco: r.title || 'São Paulo',
        bairro: r.title.split(',')[0]?.trim() || 'São Paulo',
        cidade: 'São Paulo',
        estado: 'SP',
        cep: extractCEP(r.fullText),
        areaM2: parseArea(r.fullText) || 300,
        lanceInicial: lance,
        valorAvaliacao: lance * 1.6,
        status: 'Aberto',
        tipoLeilao: 'Judicial',
        dataLeilao: extractDate(r.fullText),
        leiloeiro: 'Freitas Leiloeiro',
        descricao: r.fullText.substring(0, 200),
        scrapedAt: new Date().toISOString(),
      });
    }
  } catch (err) {
    console.error(`  [Freitas Leiloeiro] Erro: ${(err as Error).message}`);
  }

  console.log(`  [Freitas Leiloeiro] ✅ ${items.length} terrenos extraídos`);
  return items;
}

// ===================== MEGA LEILÕES =====================
async function scrapeMegaLeiloes(page: Page): Promise<LeilaoItem[]> {
  const items: LeilaoItem[] = [];
  console.log('\n🔍 [Mega Leilões] Iniciando scraping...');

  try {
    await page.goto('https://www.megaleiloes.com.br/origens/imoveis?tipo=Terreno&uf=SP', {
      waitUntil: 'networkidle',
      timeout: 30000,
    });
    await page.waitForTimeout(4000);

    const rawItems = await page.evaluate(() => {
      const results: Array<{
        title: string;
        endereco: string;
        prices: string[];
        area: string;
        link: string;
        fullText: string;
      }> = [];

      const cards = document.querySelectorAll('[class*="card"], [class*="lote"], [class*="item"], article, [class*="product"]');

      cards.forEach(card => {
        const el = card as HTMLElement;
        const text = el.innerText || '';
        if (!text.match(/terreno|lote|terra/i)) return;
        if (text.length < 30) return;

        const linkEl = el.querySelector('a') as HTMLAnchorElement;
        const prices = text.match(/R\$\s*[\d.,]+/g) || [];
        const areaMatch = text.match(/[\d.,]+\s*m[²2]/i);

        results.push({
          title: el.querySelector('h2,h3,h4,[class*="title"]')?.textContent?.trim() || '',
          endereco: text.substring(0, 150),
          prices: prices.map(p => p.trim()),
          area: areaMatch?.[0] || '',
          link: linkEl?.href || '',
          fullText: text.substring(0, 300),
        });
      });

      return results;
    });

    console.log(`  [Mega Leilões] ${rawItems.length} cards encontrados`);

    for (let i = 0; i < rawItems.length; i++) {
      const r = rawItems[i];
      const area = parseArea(r.area);
      const lance = parseCurrency(r.prices[0] || '');
      if (area <= 0 || lance <= 0) continue;

      const cep = extractCEP(r.fullText);

      items.push({
        id: `mega-pw-${i}`,
        fonte: 'Mega Leilões',
        url: r.link || 'https://www.megaleiloes.com.br',
        endereco: r.endereco,
        bairro: r.title || 'São Paulo',
        cidade: 'São Paulo',
        estado: 'SP',
        cep,
        areaM2: area,
        lanceInicial: lance,
        valorAvaliacao: parseCurrency(r.prices[1] || '') || lance * 1.4,
        status: r.fullText.match(/2[ªa]\s*praça/i) ? '2ª Praça' : '1ª Praça',
        tipoLeilao: 'Extrajudicial',
        dataLeilao: extractDate(r.fullText),
        leiloeiro: 'Mega Leilões',
        descricao: r.fullText.substring(0, 200),
        scrapedAt: new Date().toISOString(),
      });
    }
  } catch (err) {
    console.error(`  [Mega Leilões] Erro: ${(err as Error).message}`);
  }

  console.log(`  [Mega Leilões] ✅ ${items.length} terrenos extraídos`);
  return items;
}

function extractDate(text: string): string {
  const match = text.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (match) return `${match[3]}-${match[2]}-${match[1]}T14:00:00`;
  return new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString();
}

// ===================== MAIN =====================
async function main() {
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║   CousinServices — Multi-Source Scraper v2.0           ║');
  console.log('║   Zuk + Mega + Sodré + Freitas → leiloes.json          ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log(`\n📅 ${new Date().toLocaleString('pt-BR')}\n`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    viewport: { width: 1920, height: 1080 },
  });

  const allItems: LeilaoItem[] = [];

  // Scrapers Execution
  const sources = [
    { name: 'Caixa Econômica', fn: scrapeCaixa },
    { name: 'Zukerman', fn: scrapeZukerman },
    { name: 'Mega Leilões', fn: scrapeMegaLeiloes },
    { name: 'Sodré Santoro', fn: scrapeSodreSantoro },
    { name: 'Freitas Leiloeiro', fn: scrapeFreitasLeiloeiro }
  ];

  for (const source of sources) {
    const page = await context.newPage();
    const items = await source.fn(page);
    allItems.push(...items);
    await page.close();
  }

  await browser.close();

  // Save to leiloes.json
  const outputPath = path.resolve(process.cwd(), 'leiloes.json');
  fs.writeFileSync(outputPath, JSON.stringify({
    generatedAt: new Date().toISOString(),
    totalItems: allItems.length,
    items: allItems,
  }, null, 2), 'utf-8');

  console.log(`\n${'═'.repeat(58)}`);
  console.log(`📊 RESULTADO CONSOLIDADO`);
  console.log(`${'═'.repeat(58)}`);
  console.log(`  Zukerman:          ${allItems.filter(i => i.fonte.includes('Zuk')).length} terrenos`);
  console.log(`  Mega Leilões:      ${allItems.filter(i => i.fonte.includes('Mega')).length} terrenos`);
  console.log(`  Sodré Santoro:     ${allItems.filter(i => i.fonte.includes('Sodré')).length} terrenos`);
  console.log(`  Freitas Leiloeiro: ${allItems.filter(i => i.fonte.includes('Freitas')).length} terrenos`);
  console.log(`  Caixa Econômica:   ${allItems.filter(i => i.fonte.includes('Caixa')).length} terrenos`);
  console.log(`  TOTAL:             ${allItems.length} terrenos`);
  console.log(`\n💾 Dados salvos em: ${outputPath}`);
  console.log(`\n✅ Scraping completo!\n`);
}

main().catch(err => {
  console.error(`💥 Erro fatal: ${err.message}`);
  process.exit(1);
});
