// ============================================================
// CousinServices — Caixa Imóveis Scraper
// Scraping de terrenos do portal de venda de imóveis da Caixa
// ============================================================

import { BaseScraper, ScrapedLot } from './base';

export class CaixaImoveisScraper extends BaseScraper {
  constructor() {
    super('Caixa Econômica', 'https://venda-imoveis.caixa.gov.br');
  }

  async scrape(): Promise<ScrapedLot[]> {
    const lots: ScrapedLot[] = [];

    try {
      await this.init();

      // Caixa portal for SP terrenos
      const url = `${this.baseUrl}/sistema/busca-imovel.asp?sltTipoBusca=imoveis&sltEstado=SP&sltTipoBem=terreno`;
      const ok = await this.navigateWithRetry(url);
      if (!ok) {
        console.warn(`  [${this.sourceName}] Falha ao acessar.`);
        return lots;
      }

      await this.delay(4000);

      const results = await this.page!.evaluate(() => {
        const items: Array<{
          endereco: string;
          preco: string;
          avaliacao: string;
          area: string;
          link: string;
          cidade: string;
          descricao: string;
        }> = [];

        // Caixa uses table-based or list-based layout
        const rows = document.querySelectorAll('tr, [class*="imovel"], [class*="item"], [class*="resultado"], .list-group-item, article');

        rows.forEach((row) => {
          const el = row as HTMLElement;
          const text = el.innerText || '';

          if (!text.match(/terreno|lote/i)) return;
          if (text.length < 30) return;

          const linkEl = el.querySelector('a') as HTMLAnchorElement;
          const precoMatch = text.match(/R\$\s*[\d.,]+/g) || [];
          const areaMatch = text.match(/[\d.,]+\s*m[²2]/i);
          const cidadeMatch = text.match(/(?:São Paulo|Guarulhos|Osasco|Campinas|Santos|Sorocaba|S\.B\. do Campo|Santo André)/i);

          items.push({
            endereco: text.substring(0, 150).replace(/\n/g, ' '),
            preco: precoMatch[0] || '',
            avaliacao: precoMatch.length > 1 ? precoMatch[1] : '',
            area: areaMatch?.[0] || '',
            link: linkEl?.href || '',
            cidade: cidadeMatch?.[0] || 'São Paulo',
            descricao: text.substring(0, 200).replace(/\n/g, ' '),
          });
        });

        return items;
      });

      console.log(`  [${this.sourceName}] Encontrados ${results.length} itens brutos.`);

      for (const r of results) {
        const area = this.parseArea(r.area);
        const lance = this.parseCurrency(r.preco);
        if (area <= 0 || lance <= 0) continue;

        lots.push({
          source: this.sourceName,
          sourceUrl: r.link || this.baseUrl,
          endereco: r.endereco,
          bairro: r.cidade || 'São Paulo',
          cidade: r.cidade || 'São Paulo',
          estado: 'SP',
          areaM2: area,
          tipo: 'Terreno',
          descricao: r.descricao,
          status: 'Venda Direta',
          tipoLeilao: 'Extrajudicial',
          dataLeilao: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          leiloeiro: 'Caixa Econômica Federal',
          valorAvaliacao: this.parseCurrency(r.avaliacao) || lance * 1.3,
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
}
