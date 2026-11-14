const money = new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'});
const fields = ['marca','modelo','ano','ano_modelo','cor','municipio','uf','segmento','sub_segmento','cilindradas','combustivel','carroceria','tipo_veiculo','caixa_cambio'];
module.exports = async function handler(req,res) {
  res.setHeader('Cache-Control','no-store');
  if (req.method !== 'GET') return res.status(405).json({error:'Método inválido.'});
  const placa = String(req.query.placa || '').toUpperCase();
  if (!/^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(placa)) return res.status(400).json({error:'Placa inválida.'});
  const token = process.env.PLACA_FIPE_TOKEN?.trim();
  if (!token) return res.status(503).json({error:'Configure PLACA_FIPE_TOKEN no servidor.'});
  try {
    const response = await fetch('https://api.placafipe.com.br/getplacafipe',{
      method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({placa,token}),
      signal:AbortSignal.timeout(7000),redirect:'error'
    });
    if (response.status === 429) return res.status(429).json({error:'Limite de consultas atingido.'});
    const data = await response.json();
    const code = Number(data.codigo);
    if (code === 4862 || code === 3974) return res.status(503).json({error:'Token sem acesso ou limite de consultas atingido.'});
    if (code === 759 || code === 167) return res.status(404).json({error:'Veículo não encontrado.'});
    if (!response.ok || ![1,22,312,499].includes(code)) return res.status(502).json({error:'Consulta indisponível.'});
    const info = data.informacoes_veiculo || {};
    const brand = String(info.marca || '').trim().slice(0,40);
    const model = String(info.modelo || '').trim().slice(0,79);
    const year = Number(info.ano_modelo);
    if (!model && !year) return res.status(404).json({error:'Dados do veículo indisponíveis.'});
    const specs = Object.fromEntries(fields.filter(key => ['string','number'].includes(typeof info[key]) && String(info[key]).trim())
      .map(key => [key,String(info[key]).trim()]));
    const fipe = (Array.isArray(data.fipe) ? data.fipe : []).flatMap(row => {
      const amount = Number(row?.valor);
      if (!Number.isFinite(amount) || amount <= 0) return [];
      return [{value:money.format(amount),model:row.modelo,brand:row.marca,year:row.ano_modelo,
        code:row.codigo_fipe,reference:row.mes_referencia,fuel:row.combustivel,score:Number(row.correspondencia)||0,
        historyId:row.desvalorizometro,similarity:Number(row.similaridade)||0}];
    }).sort((a,b) => b.score-a.score || b.similarity-a.similarity);
    return res.status(200).json({brand,model,year:Number.isInteger(year)&&year>=1886&&year<=2100 ? year : undefined,
      specs,fipe,provider:'Placa FIPE',warning:code===22 ? 'Os valores FIPE retornados são de outros combustíveis. Confira antes de usar.' : undefined});
  } catch {
    return res.status(502).json({error:'Consulta indisponível.'});
  }
};
