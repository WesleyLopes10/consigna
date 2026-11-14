module.exports = async (req,res) => {
  if (req.method !== 'GET') return res.status(405).end();
  const token = process.env.PLACA_FIPE_TOKEN?.trim();
  if (!token) return res.status(503).json({error:'Catálogo ainda não configurado.'});
  async function catalog(path) {
    const response = await fetch('https://api.placafipe.com.br/'+path,{
      method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token}),
      signal:AbortSignal.timeout(7000),redirect:'error'
    });
    const body = await response.json();
    if (!response.ok || Number(body.codigo) !== 1 || !Array.isArray(body.dados)) throw Error('Catálogo indisponível');
    return body.dados.filter(row => row?.id != null && typeof row.descricao === 'string')
      .map(row => ({id:String(row.id),label:row.descricao}));
  }
  try {
    const [types,fuels] = await Promise.all([catalog('get-veiculos-tipos'),catalog('get-combustiveis')]);
    res.setHeader('Cache-Control','public, s-maxage=86400');
    return res.status(200).json({types,fuels});
  } catch {
    return res.status(502).json({error:'Catálogo Placa FIPE indisponível.'});
  }
};