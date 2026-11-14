const money = new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'});
const fields = ['marca','modelo','ano','ano_fabricacao','ano_modelo','cor','municipio','uf','segmento','sub_segmento','cilindradas','combustivel','carroceria','tipo_veiculo','caixa_cambio'];
async function fallback(placa,res,status,error,cadastro) {
  const token = process.env.API_PLACAS_TOKEN?.trim();
  if (!token) return res.status(status).json({error});
  try {
    const response = await fetch('https://wdapi2.com.br/consulta/'+placa+'/'+encodeURIComponent(token),
      {signal:AbortSignal.timeout(6500),redirect:'error'});
    if (response.status === 406) return res.status(404).json({error:'Placa sem resultado na API reserva.'});
    if (!response.ok) return res.status(response.status === 429 ? 429 : 502).json({error:'API reserva indisponível.'});
    const data = await response.json();
    const brand = String(data.MARCA || data.marca || '').trim();
    const model = String(data.MODELO || data.modelo || '').trim();
    const extra = data.extra || {};
    const year = [data.anoModelo,extra.ano_modelo].map(Number).find(value => Number.isInteger(value) && value >= 1886 && value <= 2100);
    if (!model && !year) return res.status(404).json({error:'Dados indisponíveis na API reserva.'});
    const specs = {ano:extra.ano_fabricacao || data.ano,ano_fabricacao:extra.ano_fabricacao,
      cor:data.cor,uf:data.uf,municipio:data.municipio,cilindradas:extra.cilindradas,combustivel:extra.combustivel};
    const fipe = cadastro ? [] : (Array.isArray(data.fipe?.dados) ? data.fipe.dados : [])
      .filter(row => typeof row?.texto_valor === 'string' && row.texto_valor.trim())
      .map(row => ({value:row.texto_valor,model:row.texto_modelo,brand:row.texto_marca,year:row.ano_modelo,
        code:row.codigo_fipe,reference:row.mes_referencia,fuel:row.combustivel,score:Number(row.score)||0}))
      .sort((a,b)=>b.score-a.score);
    return res.status(200).json({brand,model,year,specs,fipe,lookupMode:cadastro ? 'cadastro' : 'fipe',
      provider:'API Placas',warning:'Consulta pela API reserva. Histórico do Desvalorizômetro indisponível nesta consulta.'});
  } catch {
    return res.status(502).json({error:'API reserva indisponível.'});
  }
}
module.exports = async function handler(req,res) {
  res.setHeader('Cache-Control','no-store');
  if (req.method !== 'GET') return res.status(405).json({error:'Método inválido.'});
  const placa = String(req.query.placa || '').toUpperCase();
  if (!/^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(placa)) return res.status(400).json({error:'Placa inválida.'});
  const token = process.env.PLACA_FIPE_TOKEN?.trim();
  const cadastro = req.query.modo === 'cadastro';
  if (!token) return fallback(placa,res,503,'Configure um token de consulta no servidor.',cadastro);
  const endpoint = cadastro ? 'getplaca' : 'getplacafipe';
  try {
    const response = await fetch('https://api.placafipe.com.br/'+endpoint,{
      method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({placa,token}),
      signal:AbortSignal.timeout(6500),redirect:'error'
    });
    if ([401,402,403,429].includes(response.status)) return fallback(placa,res,response.status,'Token sem acesso ou limite de consultas atingido.',cadastro);
    const data = await response.json();
    const code = Number(data.codigo);
    if (code === 4862 || code === 3974) return fallback(placa,res,503,'Token sem acesso ou limite de consultas atingido.',cadastro);
    if (code === 759 || code === 167) return res.status(404).json({error:'Veículo não encontrado.'});
    if (!response.ok || ![1,22,312,499].includes(code)) return res.status(502).json({error:'Consulta indisponível.'});
    let info = data.informacoes_veiculo || {};
    if (!cadastro) {
      // Use the registration endpoint as the source of record for both years.
      try {
        const registered = await fetch('https://api.placafipe.com.br/getplaca',{
          method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({placa,token}),
          signal:AbortSignal.timeout(2500),redirect:'error'
        });
        if (registered.ok) {
          const record = await registered.json();
          if (Number(record.codigo) === 1 && record.informacoes_veiculo) {
            const vehicle = record.informacoes_veiculo;
            info = {...info};
            if (/^\d{4}$/.test(String(vehicle.ano || ''))) {
              info.ano = vehicle.ano;
              info.ano_fabricacao = vehicle.ano;
            }
            if (/^\d{4}$/.test(String(vehicle.ano_modelo || ''))) info.ano_modelo = vehicle.ano_modelo;
          }
        }
      } catch { /* Preserve FIPE results if the registration lookup fails. */ }
    }
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
      specs,fipe,lookupMode:cadastro ? 'cadastro' : 'fipe',provider:'Placa FIPE',warning:code===22 ? 'Os valores FIPE retornados são de outros combustíveis. Confira antes de usar.' : undefined});
  } catch {
    return res.status(502).json({error:'Consulta indisponível.'});
  }
};
