async function test() {
  const url = 'https://venda-imoveis.caixa.gov.br/listaweb/Lista_imoveis_SP.csv';
  const res = await fetch(url);
  const buffer = await res.arrayBuffer();
  const decoder = new TextDecoder('iso-8859-1');
  const text = decoder.decode(buffer);
  console.log(text.split('\n').slice(0, 5).join('\n'));
}
test();
