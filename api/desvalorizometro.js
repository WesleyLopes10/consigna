module.exports = async (req,res) => {
  res.setHeader('Cache-Control','no-store');
  if (req.method !== 'POST') return res.status(405).end();
  const id = req.body?.id;
  if (typeof id !== 'string' || !/^[A-Za-z0-9+/=]{8,2048}$/.test(id)) return res.status(400).end();
  const token = process.env.PLACA_FIPE_TOKEN?.trim();
  if (!token) return res.status(503).end();
  try {
    const response = await fetch('https://api.placafipe.com.br/getdesvalorizometro',{
      method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({desvalorizometro:id,token}),
      signal:AbortSignal.timeout(8000),redirect:'error'
    });
    const data = await response.json();
    const rows = data.desvalorizometro?.tabelas;
    if (!response.ok || Number(data.codigo)!==1 || !Array.isArray(rows)) return res.status(502).end();
    const months = 'janeiro fevereiro março abril maio junho julho agosto setembro outubro novembro dezembro'.split(' ');
    const points = new Map();
    for (const row of rows) {
      const [month,,year] = String(row?.mes_ano_extenso || '').trim().toLowerCase().split(/\s+/);
      const index = months.indexOf(month);
      const value = Number(row?.valor);
      if (index < 0 || !/^\d{4}$/.test(year) || !Number.isFinite(value) || value <= 0) continue;
      points.set(year+'-'+String(index+1).padStart(2,'0'),value);
    }
    return res.status(200).json({points:[...points].sort(([a],[b])=>a.localeCompare(b))});
  } catch { return res.status(502).end(); }
};