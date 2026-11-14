module.exports = async (req,res) => {
  if (req.method !== 'GET') return res.status(405).end();
  const model = String(req.query.modelo || '').trim();
  if (!model || model.length > 100) return res.status(400).end();
  const key = process.env.FIRECRAWL_API_KEY;
  if (!key) return res.status(503).end();
  const url = new URL('https://www.usadofacil.com.br/v6/resultado_busca.asp');
  const motor = String(req.query.motorizacao || '').trim().replace(',','.');
  const year = String(req.query.ano || '').trim();
  if ((motor && !/^\d\.\d$/.test(motor)) || (year && !/^\d{4}$/.test(year))) return res.status(400).end();
  url.search = new URLSearchParams({tipo:'0',veiculo:model.toUpperCase(),valor:'',motorizacao:motor,ano:year,cidade:'',origem:'default'}).toString();
  try {
    const response = await fetch('https://api.firecrawl.dev/v2/scrape',{
      method:'POST',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},
      signal:AbortSignal.timeout(22000),
      body:JSON.stringify({url:url.href,onlyMainContent:false,formats:[{type:'json',
        prompt:'Identifique os anúncios reais visíveis nesta página que correspondem ao modelo, ano e motor pesquisados. Selecione até 20 dos menores preços integrais, excluindo parcelas e entradas. Para cada card, leia os campos do próprio card: título, versão, quilometragem, ano de fabricação/modelo, preço integral, loja, cidade/UF e URL da foto grande do carro. Use a imagem principal no topo do card, inclusive srcset ou data-src quando houver. Ignore logotipos de lojas, banners e placeholders. Nunca combine a foto de um card com dados de outro. Copie URLs reais do conteúdo e preserve o ano no formato exibido. O parâmetro ano da URL é ano mínimo; não descarte anúncios por ano durante a extração. Copie o par fabricação/modelo literalmente, inclusive 2023/2024. Para URL use o href detalhes.asp?cod= do card, nunca a URL geral da busca. Não invente dados nem links.',
        schema:{type:'object',properties:{cars:{type:'array',items:{type:'object',properties:{
          title:{type:'string'},price:{type:'string'},year:{type:'string'},mileage:{type:'string'},photo:{type:'string'},version:{type:'string'},dealer:{type:'string'},location:{type:'string'},url:{type:'string'}
        },required:['title','url']}}},required:['cars']}}]})
    });
    if (!response.ok) return res.status(502).end();
    const payload = await response.json();
    if (!Array.isArray(payload.data?.json?.cars)) return res.status(502).end();
    if (!payload.data.json.cars.length) return res.status(502).json({error:'A extração não retornou cards verificáveis.'});
    const cars = payload.data.json.cars.flatMap(row => {
      try {
        const link = new URL(row.url,url);
        if (link.protocol !== 'https:' || !['www.usadofacil.com.br','usadofacil.com.br'].includes(link.hostname) || !row.title) return [];
        if (!/\/detalhes\.asp$/i.test(link.pathname) || !link.searchParams.get('cod')) return [];
        const price = String(row.price || '').trim();
        if (!/^(?:R\$\s*)?(?:\d{1,3}(?:\.\d{3})+|\d+)(?:,\d{2})?$/.test(price)) return [];
        const amount = Number(price.replace(/^R\$\s*/,'').replace(/\./g,'').replace(',','.'));
        if (!Number.isFinite(amount) || amount <= 0) return [];
        const modelYear = String(row.year || '').match(/\d{4}/g)?.at(-1);
        let photo;
        if (row.photo) {
          try {
            const image = new URL(row.photo,url);
            if (image.protocol === 'https:' && !image.username && !image.password &&
                !/logo|placeholder|sem[-_]?foto/i.test(image.pathname)) photo = image.href;
          } catch { /* Keep the listing if its photo URL is invalid. */ }
        }
        return [{title:row.title,amount,modelYear,year:row.year,mileage:row.mileage,version:row.version,dealer:row.dealer,location:row.location,photo,url:link.href}];
      } catch { return []; }
    });
    if (!cars.length) return res.status(502).json({error:'Os cards extraídos não tinham link e preço verificáveis.'});
    const matching = cars.filter(car => !year || car.modelYear === year);
    const ranked = [...new Map(matching.map(car => [new URL(car.url).searchParams.get('cod'),car])).values()].sort((a,b) => a.amount-b.amount).slice(0,3);
    const average = ranked.length === 3 ? ranked.reduce((sum,car) => sum+car.amount,0)/3 : null;
    res.setHeader('Cache-Control','s-maxage=300');
    return res.status(200).json({cars:ranked,average,searchUrl:url.href});
  } catch { return res.status(502).end(); }
};
