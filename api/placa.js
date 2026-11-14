module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') return res.status(405).json({error:'Método inválido.'});
  const plate = String(req.query.placa || '').toUpperCase();
  if (!/^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(plate)) return res.status(400).json({error:'Placa inválida.'});
  const token = process.env.API_PLACAS_TOKEN;
  if (!token) return res.status(503).json({error:'Consulta ainda não configurada.'});
  try {
    const response = await fetch('https://wdapi2.com.br/consulta/'+plate+'/'+encodeURIComponent(token), {
      signal:AbortSignal.timeout(7000),redirect:'error'
    });
    if (response.status === 406) return res.status(404).json({error:'Placa sem resultado.'});
    if (response.status === 429) return res.status(429).json({error:'Limite de consultas atingido.'});
    if (!response.ok) return res.status(502).json({error:'Consulta indisponível.'});
    const data = await response.json();
    const clean = (...values) => values.find(value => typeof value === 'string' && value.trim())?.trim().slice(0,79) || '';
    const brand = clean(data.MARCA,data.marca);
    const model = clean(data.MODELO,data.modelo);
    const year = [data.anoModelo,data.extra?.ano_modelo].map(Number).find(value =>
      Number.isInteger(value) && value >= 1886 && value <= 2100);
    if (!model && !year) return res.status(404).json({error:'Dados do veículo indisponíveis.'});
    return res.status(200).json({brand,model,year});
  } catch {
    return res.status(502).json({error:'Consulta indisponível.'});
  }
};
