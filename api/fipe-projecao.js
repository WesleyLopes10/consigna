module.exports = async (req,res) => {
  res.setHeader('Cache-Control','no-store');
  if (req.method !== 'POST') return res.status(405).end();
  const values = req.body?.values;
  if (!Array.isArray(values) || values.length < 3 || values.length > 12 ||
      !values.every(value => Number.isFinite(value) && value > 0 && value < 1e8)) return res.status(400).end();
  const key = process.env.OPENAI_API_KEY;
  if (!key) return res.status(503).end();
  try {
    const response = await fetch('https://api.openai.com/v1/responses',{
      method:'POST',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},
      signal:AbortSignal.timeout(7500),body:JSON.stringify({model:'gpt-4.1-mini',store:false,max_output_tokens:100,
        instructions:'Given chronological monthly FIPE prices, estimate a conservative monthly fractional change for the next three months, using only this history. Return rate from -0.05 to 0.05; 0.01 means 1%.',
        input:JSON.stringify(values),text:{format:{type:'json_schema',name:'forecast',strict:true,
        schema:{type:'object',properties:{rate:{type:'number'}},required:['rate'],additionalProperties:false}}}})
    });
    if (!response.ok) return res.status(502).end();
    const body = await response.json();
    const {rate} = JSON.parse(body.output?.flatMap(item=>item.content || []).find(item=>item.type==='output_text')?.text);
    if (!Number.isFinite(rate) || Math.abs(rate)>0.05) return res.status(502).end();
    return res.status(200).json({rate});
  } catch { return res.status(502).end(); }
};