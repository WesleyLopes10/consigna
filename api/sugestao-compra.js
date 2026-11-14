module.exports = async (req,res) => {
  res.setHeader('Cache-Control','no-store');
  if (req.method !== 'POST') return res.status(405).end();
  const {kind,fipe,history,asking,repairs,vehicle} = req.body || {};
  const price = value => Number.isFinite(value) && value > 0 && value < 1e8;
  if (!['Manual','Automático'].includes(kind) || (fipe != null && !price(fipe)) || typeof vehicle?.model !== 'string' || !vehicle.model.trim() || vehicle.model.length > 150 || !Number.isFinite(repairs) || repairs < 0 ||
      !Array.isArray(history) || history.length > 12 || !history.every(price) ||
      !Array.isArray(asking) || asking.length > 3 || !asking.every(price)) return res.status(400).end();
  const key = process.env.OPENAI_API_KEY;
  if (!key) return res.status(503).json({error:'Chave OpenAI indisponível no servidor.'});
  try {
    const response = await fetch('https://api.openai.com/v1/responses',{
      method:'POST',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},
      signal:AbortSignal.timeout(20000),body:JSON.stringify({model:'gpt-4.1-mini',store:false,max_output_tokens:500,
        instructions:'Estime em BRL um valor-base de revenda para o veículo informado, considerando o câmbio solicitado como hipótese. Priorize referências fornecidas e use conhecimento geral quando faltarem. Explique em português a base e as limitações. Não alegue consulta em tempo real nem invente fontes. Sugira reserva entre 5 e 25 por cento. O servidor descontará reserva e reparos.',
        input:JSON.stringify({kind,fipe,history,asking,repairs,vehicle:{model:vehicle.model,year:String(vehicle.year || '').slice(0,4),km:Number(vehicle.km)}}),text:{format:{type:'json_schema',name:'purchase',strict:true,schema:{
          type:'object',properties:{estimatedBase:{type:'number'},reserve:{type:'number'},reason:{type:'string'}},required:['estimatedBase','reserve','reason'],additionalProperties:false}}}})
    });
    if (!response.ok) return res.status(502).json({error:'OpenAI retornou HTTP '+response.status+'.'});
    const data = await response.json();
    const output = data.output?.flatMap(item=>item.content || []).find(item=>item.type==='output_text')?.text;
    if (!output || data.status === 'incomplete') return res.status(502).json({error:'A OpenAI não concluiu a estimativa.'});
    const {estimatedBase,reserve,reason} = JSON.parse(output);
    if (!price(estimatedBase) || !Number.isFinite(reserve) || reserve < 5 || reserve > 25 || typeof reason !== 'string') return res.status(502).end();
    const mean = asking.length ? asking.reduce((sum,value)=>sum+value,0)/asking.length : null;
    const base = Math.min(estimatedBase,fipe ?? Infinity,mean ?? Infinity);
    return res.status(200).json({suggestion:Math.max(0,Math.floor((base*(1-reserve/100)-repairs)/100)*100),base,mean,reserve,reason:reason.slice(0,600)});
  } catch (error) { return res.status(error.name === 'TimeoutError' ? 504 : 502).json({error:error.name === 'TimeoutError' ? 'A OpenAI excedeu o tempo limite.' : 'Falha ao ler a estimativa da OpenAI.'}); }
};