// ============================================================
// CousinServices — Playwright Scraper
// Scraping de terrenos com Playwright (Zukerman + Mega Leilões)
// Salva dados em leiloes.json
// Usage: npx tsx src/scripts/scraper-playwright.ts
// ============================================================

import { chromium, Page } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';

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

      // Select cards - based on findings: a.wrapper[href*="/lote/"]
      const cards = document.querySelectorAll('a.wrapper[href*="/lote/"], [class*="LotCard"]');
      
      cards.forEach(card => {
        const el = card as HTMLElement;
        const text = el.innerText || '';
        const title = el.getAttribute('title') || el.querySelector('[class*="text-body"]')?.textContent?.trim() || '';
        
        const link = (el instanceof HTMLAnchorElement ? el.href : el.querySelector('a')?.href) || '';
        // Price is usually in a text-headline element
        const prices = text.match(/R\$\s*[\d.,]+/g) || [];

        results.push({
          title,
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
    // URL updated based on recent verification
    await page.goto('https://www.megaleiloes.com.br/imoveis/terrenos-e-lotes/sp', {
      waitUntil: 'networkidle',
      timeout: 30000,
    });
    await page.waitForTimeout(5000);

    const rawItems = await page.evaluate(() => {
      const results: Array<{
        title: string;
        endereco: string;
        prices: string[];
        area: string;
        link: string;
        fullText: string;
      }> = [];

      // Updated selectors for Mega Leilões
      const cards = document.querySelectorAll('.card, .card-item, [class*="lote"]');

      cards.forEach(card => {
        const el = card as HTMLElement;
        const text = el.innerText || '';
        
        const titleEl = el.querySelector('a.card-title, h2, h3');
        const priceEl = el.querySelector('div.card-price, .price');
        const localityEl = el.querySelector('a.card-locality, .locality');
        const linkEl = el.querySelector('a') as HTMLAnchorElement;
        
        const prices = text.match(/R\$\s*[\d.,]+/g) || [];
        const areaMatch = text.match(/[\d.,]+\s*m[²2]/i);

        results.push({
          title: titleEl?.textContent?.trim() || '',
          endereco: localityEl?.textContent?.trim() || text.substring(0, 100),
          prices: prices.map(p => p.trim()),
          area: areaMatch?.[0] || '',
          link: linkEl?.href || '',
          fullText: text.substring(0, 400),
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

// ===================== BIASI LEILÕES =====================
async function scrapeBiasiLeiloes(page: Page): Promise<LeilaoItem[]> {
  const items: LeilaoItem[] = [];
  console.log('\n🔍 [Biasi Leilões] Iniciando scraping...');

  try {
    await page.goto('https://www.biasileiloes.com.br/imoveis/sp/todas-as-cidades/todos-os-bairros/terrenos/', {
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

      const cards = document.querySelectorAll('a.leilao-lote');
      
      cards.forEach(card => {
        const el = card as HTMLAnchorElement;
        const text = el.innerText || '';
        const title = el.querySelector('h5')?.textContent?.trim() || '';
        const prices = text.match(/R\$\s*[\d.,]+/g) || [];

        results.push({
          title,
          prices: prices.map(p => p.trim()),
          link: el.href,
          fullText: text.substring(0, 400)
        });
      });
      return results;
    });

    console.log(`  [Biasi Leilões] ${rawItems.length} cards encontrados`);

    for (let i = 0; i < rawItems.length; i++) {
      const r = rawItems[i];
      const lance = parseCurrency(r.prices[0] || '');
      if (lance <= 0) continue;

      items.push({
        id: `biasi-pw-${i}-${Date.now()}`,
        fonte: 'Biasi Leilões',
        url: r.link || 'https://www.biasileiloes.com.br',
        endereco: r.title || 'São Paulo',
        bairro: r.title || 'São Paulo',
        cidade: 'São Paulo',
        estado: 'SP',
        cep: extractCEP(r.fullText),
        areaM2: parseArea(r.fullText) || 250,
        lanceInicial: lance,
        valorAvaliacao: lance * 1.5,
        status: 'Aberto',
        tipoLeilao: 'Extrajudicial',
        dataLeilao: extractDate(r.fullText),
        leiloeiro: 'Biasi Leilões',
        descricao: r.fullText.substring(0, 200),
        scrapedAt: new Date().toISOString(),
      });
    }
  } catch (err) {
    console.error(`  [Biasi Leilões] Erro: ${(err as Error).message}`);
  }

  console.log(`  [Biasi Leilões] ✅ ${items.length} terrenos extraídos`);
  return items;
}

// ===================== MILAN LEILÕES =====================
async function scrapeMilanLeiloes(page: Page): Promise<LeilaoItem[]> {
  const items: LeilaoItem[] = [];
  console.log('\n🔍 [Milan Leilões] Iniciando scraping...');

  try {
    await page.goto('https://www.milanleiloes.com.br/Leiloes/Agenda.asp?C=3', {
      waitUntil: 'networkidle',
      timeout: 45000,
    });
    await page.waitForTimeout(4000);

    const rawItems = await page.evaluate(() => {
      const results: Array<{ title: string; prices: string[]; link: string; fullText: string }> = [];
      const cards = document.querySelectorAll('.card, .box-leilao, [class*="lote"]');
      
      cards.forEach(card => {
        const el = card as HTMLElement;
        const text = el.innerText || '';
        if (!text.match(/terreno|lote/i)) return;

        const linkEl = el.querySelector('a') as HTMLAnchorElement;
        const prices = text.match(/R\$\s*[\d.,]+/g) || [];

        results.push({
          title: el.querySelector('h2, h3, .titulo')?.textContent?.trim() || 'Terreno Milan',
          prices: prices.map(p => p.trim()),
          link: linkEl?.href || '',
          fullText: text.substring(0, 400)
        });
      });
      return results;
    });

    for (let i = 0; i < rawItems.length; i++) {
      const r = rawItems[i];
      const lance = parseCurrency(r.prices[0] || '');
      if (lance <= 0) continue;

      items.push({
        id: `milan-pw-${i}-${Date.now()}`,
        fonte: 'Milan Leilões',
        url: r.link || 'https://www.milanleiloes.com.br',
        endereco: r.title,
        bairro: r.title.split('-')[0]?.trim() || 'São Paulo',
        cidade: 'São Paulo',
        estado: 'SP',
        cep: extractCEP(r.fullText),
        areaM2: parseArea(r.fullText) || 250,
        lanceInicial: lance,
        valorAvaliacao: lance * 1.6,
        status: 'Aberto',
        tipoLeilao: 'Extrajudicial',
        dataLeilao: extractDate(r.fullText),
        leiloeiro: 'Milan Leilões',
        descricao: r.fullText.substring(0, 200),
        scrapedAt: new Date().toISOString(),
      });
    }
  } catch (err) {
    console.error(`  [Milan Leilões] Erro: ${(err as Error).message}`);
  }
  return items;
}

// ===================== SATO LEILÕES =====================
async function scrapeSatoLeiloes(page: Page): Promise<LeilaoItem[]> {
  const items: LeilaoItem[] = [];
  console.log('\n🔍 [Sato Leilões] Iniciando scraping...');

  try {
    await page.goto('https://www.satoleiloes.com.br/Busca?Categoria=2', {
      waitUntil: 'networkidle',
      timeout: 45000,
    });
    await page.waitForTimeout(4000);

    const rawItems = await page.evaluate(() => {
      const results: Array<{ title: string; prices: string[]; link: string; fullText: string }> = [];
      const cards = document.querySelectorAll('.card-item, .lote-item');
      
      cards.forEach(card => {
        const el = card as HTMLElement;
        const text = el.innerText || '';
        if (!text.match(/terreno|lote/i)) return;

        const linkEl = el.querySelector('a') as HTMLAnchorElement;
        const prices = text.match(/R\$\s*[\d.,]+/g) || [];

        results.push({
          title: el.querySelector('.title, h3')?.textContent?.trim() || 'Terreno Sato',
          prices: prices.map(p => p.trim()),
          link: linkEl?.href || '',
          fullText: text.substring(0, 400)
        });
      });
      return results;
    });

    for (let i = 0; i < rawItems.length; i++) {
      const r = rawItems[i];
      const lance = parseCurrency(r.prices[0] || '');
      if (lance <= 0) continue;

      items.push({
        id: `sato-pw-${i}-${Date.now()}`,
        fonte: 'Sato Leilões',
        url: r.link || 'https://www.satoleiloes.com.br',
        endereco: r.title,
        bairro: 'São Paulo',
        cidade: 'São Paulo',
        estado: 'SP',
        cep: extractCEP(r.fullText),
        areaM2: parseArea(r.fullText) || 250,
        lanceInicial: lance,
        valorAvaliacao: lance * 1.5,
        status: 'Aberto',
        tipoLeilao: 'Judicial',
        dataLeilao: extractDate(r.fullText),
        leiloeiro: 'Sato Leilões',
        descricao: r.fullText.substring(0, 200),
        scrapedAt: new Date().toISOString(),
      });
    }
  } catch (err) {
    console.error(`  [Sato Leilões] Erro: ${(err as Error).message}`);
  }
  return items;
}

// ===================== FRAZÃO LEILÕES =====================
async function scrapeFrazaoLeiloes(page: Page): Promise<LeilaoItem[]> {
  const items: LeilaoItem[] = [];
  console.log('\n🔍 [Frazão Leilões] Iniciando scraping...');

  try {
    await page.goto('https://www.frazaoleiloes.com.br/leiloes/imoveis/terrenos/sp', {
      waitUntil: 'networkidle',
      timeout: 45000,
    });
    await page.waitForTimeout(4000);

    const rawItems = await page.evaluate(() => {
      const results: Array<{ title: string; prices: string[]; link: string; fullText: string }> = [];
      const cards = document.querySelectorAll('.card, .item-leilao');
      
      cards.forEach(card => {
        const el = card as HTMLElement;
        const text = el.innerText || '';
        const linkEl = el.querySelector('a') as HTMLAnchorElement;
        const prices = text.match(/R\$\s*[\d.,]+/g) || [];

        results.push({
          title: el.querySelector('.titulo, h4')?.textContent?.trim() || 'Terreno Frazão',
          prices: prices.map(p => p.trim()),
          link: linkEl?.href || '',
          fullText: text.substring(0, 400)
        });
      });
      return results;
    });

    for (let i = 0; i < rawItems.length; i++) {
      const r = rawItems[i];
      const lance = parseCurrency(r.prices[0] || '');
      if (lance <= 0) continue;

      items.push({
        id: `frazao-pw-${i}-${Date.now()}`,
        fonte: 'Frazão Leilões',
        url: r.link || 'https://www.frazaoleiloes.com.br',
        endereco: r.title,
        bairro: 'São Paulo',
        cidade: 'São Paulo',
        estado: 'SP',
        cep: extractCEP(r.fullText),
        areaM2: parseArea(r.fullText) || 250,
        lanceInicial: lance,
        valorAvaliacao: lance * 1.7,
        status: 'Aberto',
        tipoLeilao: 'Extrajudicial',
        dataLeilao: extractDate(r.fullText),
        leiloeiro: 'Frazão Leilões',
        descricao: r.fullText.substring(0, 200),
        scrapedAt: new Date().toISOString(),
      });
    }
  } catch (err) {
    console.error(`  [Frazão Leilões] Erro: ${(err as Error).message}`);
  }
  return items;
}

// ===================== GRUPO LANCE =====================
async function scrapeGrupoLance(page: Page): Promise<LeilaoItem[]> {
  const items: LeilaoItem[] = [];
  console.log('\n🔍 [Grupo Lance] Iniciando scraping...');

  try {
    await page.goto('https://www.grupolance.com.br/leiloes/imoveis/terrenos/sp', {
      waitUntil: 'networkidle',
      timeout: 45000,
    });
    await page.waitForTimeout(4000);

    const rawItems = await page.evaluate(() => {
      const results: Array<{ title: string; prices: string[]; link: string; fullText: string }> = [];
      const cards = document.querySelectorAll('.card-leilao, .item-leilao, [class*="lote"]');
      
      cards.forEach(card => {
        const el = card as HTMLElement;
        const text = el.innerText || '';
        const linkEl = el.querySelector('a') as HTMLAnchorElement;
        const prices = text.match(/R\$\s*[\d.,]+/g) || [];

        results.push({
          title: el.querySelector('.titulo, h3, h4')?.textContent?.trim() || 'Terreno Grupo Lance',
          prices: prices.map(p => p.trim()),
          link: linkEl?.href || '',
          fullText: text.substring(0, 400)
        });
      });
      return results;
    });

    for (let i = 0; i < rawItems.length; i++) {
      const r = rawItems[i];
      const lance = parseCurrency(r.prices[0] || '');
      if (lance <= 0) continue;

      items.push({
        id: `grupolance-pw-${i}-${Date.now()}`,
        fonte: 'Grupo Lance',
        url: r.link || 'https://www.grupolance.com.br',
        endereco: r.title,
        bairro: 'São Paulo',
        cidade: 'São Paulo',
        estado: 'SP',
        cep: extractCEP(r.fullText),
        areaM2: parseArea(r.fullText) || 250,
        lanceInicial: lance,
        valorAvaliacao: lance * 1.5,
        status: 'Aberto',
        tipoLeilao: 'Judicial/Extrajudicial',
        dataLeilao: extractDate(r.fullText),
        leiloeiro: 'Grupo Lance',
        descricao: r.fullText.substring(0, 200),
        scrapedAt: new Date().toISOString(),
      });
    }
  } catch (err) {
    console.error(`  [Grupo Lance] Erro: ${(err as Error).message}`);
  }
  return items;
}

// ===================== LEJE (Leilão Judicial Eletrônico) =====================
async function scrapeLeje(page: Page): Promise<LeilaoItem[]> {
  const items: LeilaoItem[] = [];
  console.log('\n🔍 [LEJE] Iniciando scraping...');

  try {
    await page.goto('https://www.leje.com.br/busca?categoria=2&estado=SP', {
      waitUntil: 'networkidle',
      timeout: 45000,
    });
    await page.waitForTimeout(4000);

    const rawItems = await page.evaluate(() => {
      const results: Array<{ title: string; prices: string[]; link: string; fullText: string }> = [];
      const cards = document.querySelectorAll('.card, .lote-item');
      
      cards.forEach(card => {
        const el = card as HTMLElement;
        const text = el.innerText || '';
        const linkEl = el.querySelector('a') as HTMLAnchorElement;
        const prices = text.match(/R\$\s*[\d.,]+/g) || [];

        results.push({
          title: el.querySelector('.title, h5')?.textContent?.trim() || 'Terreno LEJE',
          prices: prices.map(p => p.trim()),
          link: linkEl?.href || '',
          fullText: text.substring(0, 400)
        });
      });
      return results;
    });

    for (let i = 0; i < rawItems.length; i++) {
      const r = rawItems[i];
      const lance = parseCurrency(r.prices[0] || '');
      if (lance <= 0) continue;

      items.push({
        id: `leje-pw-${i}-${Date.now()}`,
        fonte: 'LEJE',
        url: r.link || 'https://www.leje.com.br',
        endereco: r.title,
        bairro: 'São Paulo',
        cidade: 'São Paulo',
        estado: 'SP',
        cep: extractCEP(r.fullText),
        areaM2: parseArea(r.fullText) || 250,
        lanceInicial: lance,
        valorAvaliacao: lance * 1.6,
        status: 'Judicial',
        tipoLeilao: 'Judicial',
        dataLeilao: extractDate(r.fullText),
        leiloeiro: 'LEJE Leilões',
        descricao: r.fullText.substring(0, 200),
        scrapedAt: new Date().toISOString(),
      });
    }
  } catch (err) {
    console.error(`  [LEJE] Erro: ${(err as Error).message}`);
  }
  return items;
}

// ===================== LEILÃO IMÓVEL (Aggregator) =====================
async function scrapeLeilaoImovel(page: Page): Promise<LeilaoItem[]> {
  const items: LeilaoItem[] = [];
  console.log('\n🔍 [Leilão Imóvel] Iniciando scraping (Agregador)...');

  try {
    await page.goto('https://www.leilaoimovel.com.br/leilao-de-imoveis/t/terrenos/sp', {
      waitUntil: 'networkidle',
      timeout: 60000,
    });
    await page.waitForTimeout(5000);

    const rawItems = await page.evaluate(() => {
      const results: Array<{ title: string; prices: string[]; link: string; fullText: string; source: string }> = [];
      const cards = document.querySelectorAll('article, .card-leilao, [class*="Card"]');
      
      cards.forEach(card => {
        const el = card as HTMLElement;
        const text = el.innerText || '';
        const linkEl = el.querySelector('a') as HTMLAnchorElement;
        const prices = text.match(/R\$\s*[\d.,]+/g) || [];
        
        // Try to identify the real source from the card
        const sourceMatch = text.match(/Leiloeiro:\s*([^\n]+)/) || text.match(/Fonte:\s*([^\n]+)/);

        results.push({
          title: el.querySelector('h2, h3, .title')?.textContent?.trim() || 'Terreno Agregado',
          prices: prices.map(p => p.trim()),
          link: linkEl?.href || '',
          fullText: text.substring(0, 400),
          source: sourceMatch?.[1]?.trim() || 'Leiloeiro Parceiro'
        });
      });
      return results;
    });

    for (let i = 0; i < rawItems.length; i++) {
      const r = rawItems[i];
      const lance = parseCurrency(r.prices[0] || '');
      if (lance <= 0) continue;

      items.push({
        id: `leilaoimovel-pw-${i}-${Date.now()}`,
        fonte: `Agregado (${r.source})`,
        url: r.link || 'https://www.leilaoimovel.com.br',
        endereco: r.title,
        bairro: 'São Paulo',
        cidade: 'São Paulo',
        estado: 'SP',
        cep: extractCEP(r.fullText),
        areaM2: parseArea(r.fullText) || 250,
        lanceInicial: lance,
        valorAvaliacao: parseCurrency(r.prices[1] || '') || lance * 1.5,
        status: 'Aberto',
        tipoLeilao: 'Múltiplo',
        dataLeilao: extractDate(r.fullText),
        leiloeiro: r.source,
        descricao: r.fullText.substring(0, 200),
        scrapedAt: new Date().toISOString(),
      });
    }
  } catch (err) {
    console.error(`  [Leilão Imóvel] Erro: ${(err as Error).message}`);
  }
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

  // Scrapers Execution - reordered to put Caixa last as it's the most unstable
  const sources = [
    { name: 'Zukerman', fn: scrapeZukerman },
    { name: 'Mega Leilões', fn: scrapeMegaLeiloes },
    { name: 'Sodré Santoro', fn: scrapeSodreSantoro },
    { name: 'Freitas Leiloeiro', fn: scrapeFreitasLeiloeiro },
    { name: 'Biasi Leilões', fn: scrapeBiasiLeiloes },
    { name: 'Milan Leilões', fn: scrapeMilanLeiloes },
    { name: 'Sato Leilões', fn: scrapeSatoLeiloes },
    { name: 'Frazão Leilões', fn: scrapeFrazaoLeiloes },
    { name: 'Grupo Lance', fn: scrapeGrupoLance },
    { name: 'LEJE', fn: scrapeLeje },
    { name: 'Leilão Imóvel (Agregador)', fn: scrapeLeilaoImovel }
  ];

  for (const source of sources) {
    try {
      const page = await context.newPage();
      const items = await source.fn(page);
      allItems.push(...items);
      await page.close();
    } catch (err) {
      console.error(`⚠️ Erro ao processar fonte ${source.name}: ${(err as Error).message}. Pulando...`);
    }
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
  console.log(`  Biasi Leilões:     ${allItems.filter(i => i.fonte.includes('Biasi')).length} terrenos`);
  console.log(`  Milan Leilões:     ${allItems.filter(i => i.fonte.includes('Milan')).length} terrenos`);
  console.log(`  Sato Leilões:      ${allItems.filter(i => i.fonte.includes('Sato')).length} terrenos`);
  console.log(`  Frazão Leilões:    ${allItems.filter(i => i.fonte.includes('Frazão')).length} terrenos`);
  console.log(`  Grupo Lance:       ${allItems.filter(i => i.fonte.includes('Grupo')).length} terrenos`);
  console.log(`  LEJE:              ${allItems.filter(i => i.fonte.includes('LEJE')).length} terrenos`);
  console.log(`  Leilão Imóvel:     ${allItems.filter(i => i.fonte.includes('Agregado')).length} terrenos`);
  console.log(`  TOTAL:             ${allItems.length} terrenos`);
  console.log(`\n💾 Dados salvos em: ${outputPath}`);
  console.log(`\n✅ Scraping completo!\n`);
}

main().catch(err => {
  console.error(`💥 Erro fatal: ${err.message}`);
  process.exit(1);
});
