// ============================================================
// CousinServices — Mega Leilões Scraper
// ============================================================

import { BaseScraper, ScrapedLot } from './base';

export class MegaLeiloesScraper extends BaseScraper {
  constructor() {
    super('Mega Leilões', 'https://www.megaleiloes.com.br');
  }

  async scrape(): Promise<ScrapedLot[]> {
    const lots: ScrapedLot[] = [];

    try {
      await this.init();

      const url = `${this.baseUrl}/origens/imoveis?tipo=Terreno&uf=SP`;
      const ok = await this.navigateWithRetry(url);
      if (!ok) {
        console.warn(`  [${this.sourceName}] Falha ao acessar a página.`);
        return lots;
      }

      await this.delay(4000);

      const results = await this.page!.evaluate(() => {
        const items: Array<{
          title: string;
          endereco: string;
          preco: string;
          avaliacao: string;
          area: string;
          link: string;
          status: string;
          data: string;
          descricao: string;
        }> = [];

        const cards = document.querySelectorAll('[class*="card"], [class*="lote"], [class*="item"], [class*="product"], article, .auction-item');

        cards.forEach((card) => {
          const el = card as HTMLElement;
          const text = el.innerText || '';

          // Filter for terrenos/lotes
          if (!text.match(/terreno|lote|terra/i)) return;

          const linkEl = el.querySelector('a') as HTMLAnchorElement;
          const link = linkEl?.href || '';

          const precoMatch = text.match(/R\$\s*[\d.,]+/g) || [];
          const areaMatch = text.match(/[\d.,]+\s*m[²2]/i);
          const dataMatch = text.match(/\d{2}\/\d{2}\/\d{4}/);

          items.push({
            title: el.querySelector('h2, h3, h4, [class*="title"]')?.textContent?.trim() || '',
            endereco: el.querySelector('[class*="endereco"], [class*="address"], [class*="local"]')?.textContent?.trim() || text.substring(0, 100),
            preco: precoMatch[0] || '',
            avaliacao: precoMatch.length > 1 ? precoMatch[1] : '',
            area: areaMatch?.[0] || '',
            link,
            status: text.match(/2[ªa]\s*praça/i) ? '2ª Praça' : '1ª Praça',
            data: dataMatch?.[0] || '',
            descricao: text.substring(0, 200),
          });
        });

        return items;
      });

      console.log(`  [${this.sourceName}] Encontrados ${results.length} itens brutos.`);

      for (const r of results) {
        const area = this.parseArea(r.area);
        const lance = this.parseCurrency(r.preco);
        if (area <= 0 || lance <= 0) continue;

        const bairroMatch = r.endereco.match(/[-–]\s*([^,\-–]+?)(?:\s*[-–,]|$)/);

        lots.push({
          source: this.sourceName,
          sourceUrl: r.link || this.baseUrl,
          endereco: r.endereco || r.title,
          bairro: bairroMatch?.[1]?.trim() || 'São Paulo',
          cidade: 'São Paulo',
          estado: 'SP',
          areaM2: area,
          tipo: 'Terreno',
          descricao: r.descricao,
          status: r.status as ScrapedLot['status'],
          tipoLeilao: 'Extrajudicial',
          dataLeilao: r.data ? this.parseDateBR(r.data) : new Date().toISOString(),
          leiloeiro: 'Mega Leilões',
          valorAvaliacao: this.parseCurrency(r.avaliacao) || lance * 1.4,
          lanceInicial: lance,
        });
      }
    } catch (err) {
      console.error(`  [${this.sourceName}] Erro: ${(err as Error).message}`);
    } finally {
      await this.close();
    }

    console.log(`  [${this.sourceName}] Total extraído: ${lots.length}`);
    return lots;
  }

  private parseDateBR(d: string): string {
    const p = d.split('/');
    return p.length === 3 ? `${p[2]}-${p[1]}-${p[0]}T10:00:00` : new Date().toISOString();
  }
}
