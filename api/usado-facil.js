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
        prompt:'Extraia até os três primeiros anúncios reais na ordem da página de resultados. Não invente dados nem links. Ignore banners e menus.',
        schema:{type:'object',properties:{cars:{type:'array',items:{type:'object',properties:{
          title:{type:'string'},price:{type:'string'},year:{type:'string'},mileage:{type:'string'},url:{type:'string'}
        },required:['title','url']}}},required:['cars']}}]})
    });
    if (!response.ok) return res.status(502).end();
    const payload = await response.json();
    if (!Array.isArray(payload.data?.json?.cars)) return res.status(502).end();
    const cars = payload.data.json.cars.slice(0,3).flatMap(row => {
      try {
        const link = new URL(row.url,url);
        if (link.protocol !== 'https:' || !['www.usadofacil.com.br','usadofacil.com.br'].includes(link.hostname) || !row.title) return [];
        return [{title:row.title,price:row.price,year:row.year,mileage:row.mileage,url:link.href}];
      } catch { return []; }
    });
    res.setHeader('Cache-Control','s-maxage=300');
    return res.status(200).json({cars});
  } catch { return res.status(502).end(); }
};
