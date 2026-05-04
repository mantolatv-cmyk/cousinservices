// ============================================================
// CousinServices — Portal Zuk Scraper
// Scraping de terrenos em leilão no Portal Zuk (portalzuk.com.br)
// ============================================================

import { BaseScraper, ScrapedLot } from './base';

export class PortalZukScraper extends BaseScraper {
  constructor() {
    super('Portal Zuk', 'https://www.portalzuk.com.br');
  }

  async scrape(): Promise<ScrapedLot[]> {
    const lots: ScrapedLot[] = [];

    try {
      await this.init();

      // Navigate to terrenos page filtered by São Paulo
      const url = `${this.baseUrl}/leilao-de-imoveis/t/todos-imoveis/terrenos?estado=SP`;
      const ok = await this.navigateWithRetry(url);
      if (!ok) {
        console.warn(`  [${this.sourceName}] Falha ao acessar a página.`);
        return lots;
      }

      await this.delay(3000);

      // Try to extract property listings
      const results = await this.page!.evaluate(() => {
        const items: Array<{
          title: string;
          endereco: string;
          preco: string;
          avaliacao: string;
          area: string;
          link: string;
          status: string;
          tipoLeilao: string;
          leiloeiro: string;
          data: string;
          descricao: string;
        }> = [];

        // Portal Zuk uses card-based listing
        const cards = document.querySelectorAll('[class*="card"], [class*="Card"], [class*="lote"], [class*="property"], [class*="imovel"], article, .MuiCard-root');

        cards.forEach((card) => {
          const el = card as HTMLElement;
          const text = el.innerText || '';

          // Check if it's a terreno/lote in SP
          if (!text.match(/terreno|lote/i) && !el.querySelector('[class*="terreno"]')) return;
          if (!text.match(/São Paulo|SP|S\.P\./i) && !text.match(/capital|metropolitana/i)) return;

          const linkEl = el.querySelector('a[href*="imovel"], a[href*="leilao"], a[href*="lote"]') as HTMLAnchorElement;
          const link = linkEl?.href || '';

          // Extract price info
          const precoMatch = text.match(/R\$\s*[\d.,]+/g) || [];
          const areaMatch = text.match(/[\d.,]+\s*m[²2]/i);
          const dataMatch = text.match(/\d{2}\/\d{2}\/\d{4}/);

          items.push({
            title: el.querySelector('h2, h3, h4, [class*="title"], [class*="titulo"]')?.textContent?.trim() || '',
            endereco: el.querySelector('[class*="endereco"], [class*="address"], [class*="localizacao"]')?.textContent?.trim() || '',
            preco: precoMatch[0] || '',
            avaliacao: precoMatch.length > 1 ? precoMatch[1] : precoMatch[0] || '',
            area: areaMatch?.[0] || '',
            link,
            status: text.match(/2[ªa]\s*praça/i) ? '2ª Praça' : text.match(/1[ªa]\s*praça/i) ? '1ª Praça' : 'Venda Direta',
            tipoLeilao: text.match(/judicial/i) ? 'Judicial' : text.match(/extrajudicial/i) ? 'Extrajudicial' : 'Extrajudicial',
            leiloeiro: 'Zukerman Leilões',
            data: dataMatch?.[0] || '',
            descricao: text.substring(0, 200),
          });
        });

        return items;
      });

      console.log(`  [${this.sourceName}] Encontrados ${results.length} itens brutos no DOM.`);

      for (const r of results) {
        if (!r.preco && !r.area) continue;

        const area = this.parseArea(r.area);
        const lance = this.parseCurrency(r.preco);
        if (area <= 0 || lance <= 0) continue;

        // Try to extract bairro from address
        const bairroMatch = r.endereco.match(/[-–]\s*([^,\-–]+?)(?:\s*[-–,]|$)/);
        const bairro = bairroMatch?.[1]?.trim() || 'São Paulo';

        lots.push({
          source: this.sourceName,
          sourceUrl: r.link || `${this.baseUrl}/leilao-de-imoveis/t/todos-imoveis/terrenos`,
          endereco: r.endereco || r.title,
          bairro,
          cidade: 'São Paulo',
          estado: 'SP',
          areaM2: area,
          tipo: 'Terreno',
          descricao: r.descricao,
          status: r.status as ScrapedLot['status'],
          tipoLeilao: r.tipoLeilao as ScrapedLot['tipoLeilao'],
          dataLeilao: r.data ? this.parseDate(r.data) : new Date().toISOString(),
          leiloeiro: r.leiloeiro,
          valorAvaliacao: this.parseCurrency(r.avaliacao) || lance * 1.3,
          lanceInicial: lance,
        });
      }
    } catch (err) {
      console.error(`  [${this.sourceName}] Erro no scraping: ${(err as Error).message}`);
    } finally {
      await this.close();
    }

    console.log(`  [${this.sourceName}] Total de lotes extraídos: ${lots.length}`);
    return lots;
  }

  private parseDate(dateStr: string): string {
    const parts = dateStr.split('/');
    if (parts.length === 3) {
      return `${parts[2]}-${parts[1]}-${parts[0]}T14:00:00`;
    }
    return new Date().toISOString();
  }
}
