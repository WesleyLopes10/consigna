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
      body:JSON.stringify({url:url.href,onlyMainContent:true,formats:[{type:'json',
        prompt:'Identifique os anúncios reais visíveis nesta página que correspondem ao modelo, ano e motor pesquisados. Selecione até 20 dos menores preços integrais, excluindo parcelas e entradas. Inclua a URL da foto real do anúncio quando disponível. Não invente dados nem links.',
        schema:{type:'object',properties:{cars:{type:'array',items:{type:'object',properties:{
          title:{type:'string'},price:{type:'string'},year:{type:'string'},mileage:{type:'string'},photo:{type:'string'},url:{type:'string'}
        },required:['title','url']}}},required:['cars']}}]})
    });
    if (!response.ok) return res.status(502).end();
    const payload = await response.json();
    if (!Array.isArray(payload.data?.json?.cars)) return res.status(502).end();
    const cars = payload.data.json.cars.flatMap(row => {
      try {
        const link = new URL(row.url,url);
        if (link.protocol !== 'https:' || !['www.usadofacil.com.br','usadofacil.com.br'].includes(link.hostname) || !row.title) return [];
        if (link.pathname.toLowerCase().includes('resultado_busca') || link.pathname === '/') return [];
        const price = String(row.price || '').trim();
        if (!/^(?:R\$\s*)?(?:\d{1,3}(?:\.\d{3})+|\d+)(?:,\d{2})?$/.test(price)) return [];
        const amount = Number(price.replace(/^R\$\s*/,'').replace(/\./g,'').replace(',','.'));
        if (!Number.isFinite(amount) || amount <= 0) return [];
        let photo;
        if (row.photo) {
          const image = new URL(row.photo,url);
          if (image.protocol === 'https:' && !image.username && !image.password) photo = image.href;
        }
        return [{title:row.title,amount,year:row.year,mileage:row.mileage,photo,url:link.href}];
      } catch { return []; }
    });
    const ranked = [...new Map(cars.map(car => [car.url,car])).values()].sort((a,b) => a.amount-b.amount).slice(0,3);
    const average = ranked.length === 3 ? ranked.reduce((sum,car) => sum+car.amount,0)/3 : null;
    res.setHeader('Cache-Control','s-maxage=300');
    return res.status(200).json({cars:ranked,average,searchUrl:url.href});
  } catch { return res.status(502).end(); }
};
