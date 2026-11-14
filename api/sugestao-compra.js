module.exports = async (req,res) => {
  res.setHeader('Cache-Control','no-store');
  if (req.method !== 'POST') return res.status(405).end();
  const {kind,fipe,history,asking,repairs} = req.body || {};
  const price = value => Number.isFinite(value) && value > 0 && value < 1e8;
  if (!['Manual','Automático'].includes(kind) || !price(fipe) || !Number.isFinite(repairs) || repairs < 0 ||
      !Array.isArray(history) || history.length < 2 || history.length > 12 || !history.every(price) ||
      !Array.isArray(asking) || !asking.length || asking.length > 3 || !asking.every(price)) return res.status(400).end();
  const key = process.env.OPENAI_API_KEY;
  if (!key) return res.status(503).end();
  try {
    const response = await fetch('https://api.openai.com/v1/responses',{
      method:'POST',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},
      signal:AbortSignal.timeout(9000),body:JSON.stringify({model:'gpt-4.1-mini',store:false,max_output_tokens:240,
        instructions:'Em português, recomende uma reserva percentual entre 5 e 25 para negociação e risco da compra de um usado. Considere tendência FIPE, dispersão e tamanho da amostra de preços pedidos. Explique brevemente. Não invente dados nem calcule o preço final.',
        input:JSON.stringify({kind,fipe,history,asking,repairs}),text:{format:{type:'json_schema',name:'purchase',strict:true,schema:{
          type:'object',properties:{reserve:{type:'number'},reason:{type:'string'}},required:['reserve','reason'],additionalProperties:false}}}})
    });
    if (!response.ok) return res.status(502).end();
    const data = await response.json();
    const {reserve,reason} = JSON.parse(data.output?.flatMap(item=>item.content || []).find(item=>item.type==='output_text')?.text);
    if (!Number.isFinite(reserve) || reserve < 5 || reserve > 25 || typeof reason !== 'string') return res.status(502).end();
    const mean = asking.reduce((sum,value)=>sum+value,0)/asking.length;
    const base = Math.min(fipe,mean);
    return res.status(200).json({suggestion:Math.max(0,Math.floor((base*(1-reserve/100)-repairs)/100)*100),base,mean,reserve,reason:reason.slice(0,600)});
  } catch { return res.status(502).end(); }
};