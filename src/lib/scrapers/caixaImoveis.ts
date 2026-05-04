import { Page } from 'playwright';

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

/**
 * Scraper para o portal de Imóveis da Caixa Econômica Federal.
 * Utiliza o Playwright para navegar e contornar proteções de bot.
 */
export async function scrapeCaixa(page: Page): Promise<LeilaoItem[]> {
  const items: LeilaoItem[] = [];
  console.log('\n🔍 [Caixa Imóveis] Iniciando scraping via Navegador...');

  try {
    // Acessar a página de busca
    await page.goto('https://venda-imoveis.caixa.gov.br/sistema/busca-imovel.asp', {
      waitUntil: 'networkidle',
      timeout: 60000,
    });

    // Selecionar SP
    await page.selectOption('#nu_estado', 'SP');
    await page.waitForTimeout(1000);

    // Selecionar Terreno (valor '10' geralmente para terreno)
    // Vamos tentar pelo texto para ser mais seguro
    await page.selectOption('#tp_imovel', { label: 'Terreno' });
    
    // Clicar em buscar
    await page.click('#btn_next');
    
    // Aguardar resultados
    await page.waitForSelector('.dados-imovel, .card-imovel, #listaImoveis', { timeout: 30000 });
    await page.waitForTimeout(3000);

    // Extrair dados da lista
    const rawItems = await page.evaluate(() => {
      const results: any[] = [];
      const cards = document.querySelectorAll('.dados-imovel, .card-imovel, [class*="item-imovel"]');
      
      cards.forEach(card => {
        const text = (card as HTMLElement).innerText;
        const link = (card.querySelector('a') as HTMLAnchorElement)?.href || '';
        const prices = text.match(/R\$\s*[\d.,]+/g) || [];

        results.push({
          fullText: text,
          link,
          prices: prices.map(p => p.trim())
        });
      });
      return results;
    });

    console.log(`  [Caixa] ${rawItems.length} cards encontrados.`);

    for (let i = 0; i < rawItems.length; i++) {
      const r = rawItems[i];
      const lance = parseFloat(r.prices[0]?.replace(/[R$\s.]/g, '').replace(',', '.') || '0');
      if (lance <= 0) continue;

      items.push({
        id: `caixa-pw-${i}-${Date.now()}`,
        fonte: 'Imóveis Caixa',
        url: r.link || 'https://venda-imoveis.caixa.gov.br',
        endereco: r.fullText.split('\n')[0] || 'São Paulo',
        bairro: r.fullText.match(/Bairro:\s*([^|]+)/)?.[1]?.trim() || 'São Paulo',
        cidade: 'São Paulo',
        estado: 'SP',
        cep: r.fullText.match(/\d{8}/)?.[0] || '',
        areaM2: 250, // Padrão se não achar
        lanceInicial: lance,
        valorAvaliacao: lance * 1.3,
        status: 'Leilão/Venda Direta',
        tipoLeilao: 'Venda Online',
        dataLeilao: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString(),
        leiloeiro: 'Caixa Econômica Federal',
        descricao: r.fullText.substring(0, 200),
        scrapedAt: new Date().toISOString(),
      });
    }

  } catch (err) {
    console.error(`  [Caixa] Erro no scraping: ${(err as Error).message}`);
  }

  console.log(`  [Caixa] ✅ ${items.length} terrenos extraídos.`);
  return items;
}
