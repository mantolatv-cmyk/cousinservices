// ============================================================
// CousinServices — Biasi Leilões Scraper
// ============================================================

import { BaseScraper, ScrapedLot } from './base';

export class BiasiLeiloesScraper extends BaseScraper {
  constructor() {
    super('Biasi Leilões', 'https://www.biasileiloes.com.br');
  }

  async scrape(): Promise<ScrapedLot[]> {
    const lots: ScrapedLot[] = [];

    try {
      await this.init();

      // Direct URL for Terrenos in SP
      const url = `${this.baseUrl}/imoveis/sp/todas-as-cidades/todos-os-bairros/terrenos/`;
      console.log(`  [${this.sourceName}] Acessando ${url}...`);
      
      const ok = await this.navigateWithRetry(url);
      if (!ok) {
        console.warn(`  [${this.sourceName}] Falha ao acessar a página.`);
        return lots;
      }

      // Wait for content to load (Biasi uses dynamic loading)
      await this.delay(5000);

      const results = await this.page!.evaluate(() => {
        const items: Array<{
          title: string;
          preco: string;
          link: string;
          text: string;
        }> = [];

        // Selecting all auction cards
        const cards = document.querySelectorAll('a.leilao-lote');

        cards.forEach((card) => {
          const el = card as HTMLAnchorElement;
          const text = el.innerText || '';
          const title = el.querySelector('h5')?.textContent?.trim() || '';
          
          // Basic price extraction from card text
          const precoMatch = text.match(/R\$\s*[\d.,]+/g) || [];

          items.push({
            title,
            preco: precoMatch[0] || '',
            link: el.href,
            text,
          });
        });

        return items;
      });

      console.log(`  [${this.sourceName}] Encontrados ${results.length} itens brutos.`);

      // Limit to first 5 for deep scraping to avoid long waits, or just process what we have
      // Biasi detail pages are more reliable for address and area
      for (const r of results) {
        try {
          console.log(`  [${this.sourceName}] Analisando detalhe: ${r.title}`);
          await this.page!.goto(r.link, { waitUntil: 'networkidle2', timeout: 30000 });
          await this.delay(2000);

          const details = await this.page!.evaluate(() => {
            const enderecoEl = document.querySelector('p.lote-detalhe-local');
            const endereco = enderecoEl?.textContent?.trim() || '';
            
            const descEl = document.querySelector('.interna-lote-info');
            const descricao = descEl?.textContent?.trim() || '';
            
            // Extract area from description
            const areaMatch = descricao.match(/(\d+[,.]\d+)\s*m²/i) || descricao.match(/(\d+)\s*m²/i);
            const area = areaMatch ? areaMatch[1] : '';

            // Extract dates
            const pageText = document.body.innerText;
            const data1Match = pageText.match(/1º Leilão dia (\d{2}\/\d{2}\/\d{4})/);
            const data2Match = pageText.match(/2º Leilão dia (\d{2}\/\d{2}\/\d{4})/);

            return {
              endereco,
              descricao,
              area,
              data1: data1Match ? data1Match[1] : '',
              data2: data2Match ? data2Match[1] : '',
            };
          });

          const areaM2 = this.parseArea(details.area);
          const lance = this.parseCurrency(r.preco);

          if (areaM2 > 0 && lance > 0) {
            // Extract bairro from address "Rua X, 123, Bairro, Cidade/UF"
            const addressParts = details.endereco.split(',');
            let bairro = 'São Paulo';
            if (addressParts.length >= 3) {
              bairro = addressParts[2].trim();
            }

            lots.push({
              source: this.sourceName,
              sourceUrl: r.link,
              endereco: details.endereco,
              bairro,
              cidade: 'São Paulo',
              estado: 'SP',
              areaM2,
              tipo: 'Terreno',
              descricao: details.descricao.substring(0, 500),
              status: details.data2 ? '2ª Praça' : '1ª Praça',
              tipoLeilao: 'Extrajudicial',
              dataLeilao: details.data1 ? this.parseDateBR(details.data1) : new Date().toISOString(),
              leiloeiro: 'Biasi Leilões',
              valorAvaliacao: lance * 1.5, // Fallback evaluation
              lanceInicial: lance,
            });
          }
        } catch (innerErr) {
          console.error(`  [${this.sourceName}] Erro ao processar item: ${r.link}`);
        }
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
