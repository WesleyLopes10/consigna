const root = 'https://vnycnlmvyzizmtavwwql.supabase.co';
const bucket = 'avaliatop-midias';
async function request(path,options={}) {
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!key) throw Error('Servidor sem SUPABASE_SECRET_KEY.');
  const response = await fetch(root+path,{...options,headers:{apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json',...options.headers},signal:AbortSignal.timeout(15000)});
  const body = await response.text();
  if (!response.ok) throw Error('Não foi possível acessar o armazenamento do servidor.');
  return body ? JSON.parse(body) : null;
}
async function profile(req) {
  const authorization = req.headers.authorization || '';
  if (!authorization.startsWith('Bearer ')) return null;
  try {
    const user = await request('/auth/v1/user',{headers:{Authorization:authorization}});
    const rows = await request('/rest/v1/avaliatop_perfis?usuario_id=eq.'+encodeURIComponent(user.id)+'&select=perfil');
    return rows[0]?.perfil;
  } catch { return null; }
}
function validId(id) { return typeof id === 'string' && /^[a-f0-9-]{36}$/i.test(id); }
function vehicleInput(v) {
  if (!v || !validId(v.id) || typeof v.model !== 'string' || !v.model.trim() || v.model.length>200 ||
      !/^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(v.plate) ||
      !Array.isArray(v.answers) || v.answers.length>50 || !v.answers.every(n=>Number.isInteger(n)&&n>=0&&n<=3)) throw Error('Ficha inválida.');
  return v;
}
async function signedVehicle(row,kind) {
  let v = {...row.dados,id:row.id};
  if (row.avaliado_em) Object.assign(v,{evaluated:row.avaliado_em,value:Number(row.valor),code:'COD'+String(row.numero).padStart(4,'0')});
  v.unavailable = row.indisponivel;
  if (kind==='visualizador') {
    const allowed = ['id','model','brand','year','reportedYear','km','trim','vehicleKind','fipeFuel','city','photo','photos','video','evaluated','value','code','unavailable','plate','plateLookup'];
    v = Object.fromEntries(allowed.filter(k=>v[k]!==undefined).map(k=>[k,v[k]]));
  }
  async function sign(path) {
    if (!path) return null;
    if (typeof path!=='string' || !path.startsWith(row.id+'/')) return null;
    const data = await request('/storage/v1/object/sign/'+bucket+'/'+path,{method:'POST',body:JSON.stringify({expiresIn:3600})});
    return data.signedURL ? root+'/storage/v1'+data.signedURL : null;
  }
  v.photo = await sign(v.photo);
  v.photos = await Promise.all((v.photos||[]).map(sign));
  v.video = await sign(v.video);
  return v;
}
module.exports = async (req,res) => {
  res.setHeader('Cache-Control','no-store');
  try {
    const kind = await profile(req);
    if (req.method==='GET') {
      if (!['mestre','avaliador','visualizador'].includes(kind)) return res.status(401).json({error:'Entre para acessar o painel.'});
      const filter = kind==='visualizador' ? '&avaliado_em=not.is.null&indisponivel=eq.false' : '';
      const rows = await request('/rest/v1/avaliatop_fichas?pronta=eq.true&select=*&order=criado_em.desc'+filter);
      return res.json({vehicles:await Promise.all(rows.map(row=>signedVehicle(row,kind)))});
    }
    if (req.method!=='POST') return res.status(405).end();
    const {action,id} = req.body || {};
    if (!validId(id)) return res.status(400).json({error:'Identificador inválido.'});
    const url = '/rest/v1/avaliatop_fichas?id=eq.'+id;
    if (action==='prepare') {
      const vehicle = vehicleInput(req.body.vehicle);
      if (vehicle.id!==id) throw Error('Ficha inválida.');
      const files = req.body.files;
      if (!Array.isArray(files) || files.length>51 || files.some(f=>!f || !/^(photo|video|photos-\d+)$/.test(f.slot) || !Number.isFinite(f.size) || f.size<=0 ||
        f.size>(f.slot==='video'?300:5)*1024**2 || !(f.slot==='video'?/^video\//:/^image\//).test(f.type))) return res.status(400).json({error:'Arquivo inválido.'});
      const paths = Object.fromEntries(files.map(f=>[f.slot,id+'/'+f.slot]));
      const data = {id,model:vehicle.model,plate:vehicle.plate,year:vehicle.year,reportedYear:vehicle.reportedYear,
        km:vehicle.km,owner:vehicle.owner,phone:vehicle.phone,city:vehicle.city,vehicleKind:vehicle.vehicleKind,
        answers:vehicle.answers,created:Date.now(),plateLookup:vehicle.plateLookup,
        photo:paths.photo || paths['photos-0'],photos:files.filter(f=>f.slot.startsWith('photos-')).map(f=>paths[f.slot]),video:paths.video};
      const existing = await request(url+'&select=id,pronta,dados');
      if (existing.length) return res.status(409).json({error:'Esta ficha já foi enviada. Abra o painel para conferir.'});
      await request('/rest/v1/avaliatop_fichas',{method:'POST',body:JSON.stringify({id,dados:data})});
      const uploads = await Promise.all(files.map(async f=>{
        const signed=await request('/storage/v1/object/upload/sign/'+bucket+'/'+paths[f.slot],{method:'POST',body:'{}'});
        return {slot:f.slot,path:paths[f.slot],token:signed.token};
      }));
      return res.json({uploads});
    }
    const rows=await request(url+'&select=*');
    const row=rows[0];
    if (!row) return res.status(404).json({error:'Ficha não encontrada.'});
    if (action==='complete') {
      if (row.pronta) return res.json({ok:true});
      const files=[...new Set([row.dados.photo,...(row.dados.photos||[]),row.dados.video].filter(Boolean))];
      for (const path of files) await request('/storage/v1/object/info/'+bucket+'/'+path);
      await request(url,{method:'PATCH',body:JSON.stringify({pronta:true})});
      return res.json({ok:true});
    }
    if (!['mestre','avaliador'].includes(kind)) return res.status(403).json({error:'Acesso restrito.'});
    if (!row.pronta) return res.status(409).json({error:'Envio ainda incompleto.'});
    if (action==='evaluate') {
      const value=Number(req.body.value);
      if (kind!=='mestre') return res.status(403).json({error:'Somente o Mestre pode definir o valor final.'});
      if (!Number.isFinite(value)||value<=0) return res.status(400).json({error:'Valor inválido.'});
      const updated=await request(url+'&avaliado_em=is.null',{method:'PATCH',headers:{Prefer:'return=representation'},body:JSON.stringify({valor:value,avaliado_em:Date.now()})});
      if (!updated.length) return res.status(409).json({error:'Esta ficha já foi avaliada.'});
    } else if (action==='update') {
      const patch=req.body.patch || {};
      if (Object.keys(patch).some(k=>!['vehicleKind','plateLookup','usedMarketLookup','purchaseSuggestion'].includes(k))) return res.status(400).json({error:'Alteração inválida.'});
      if (patch.vehicleKind && !['Manual','Automático','Híbrido','Elétrico'].includes(patch.vehicleKind)) return res.status(400).end();
      const revision=row.revisao;
      const updated=await request(url+'&revisao=eq.'+revision,{method:'PATCH',headers:{Prefer:'return=representation'},body:JSON.stringify({dados:{...row.dados,...patch},revisao:revision+1})});
      if (!updated.length) return res.status(409).json({error:'Ficha alterada em outra sessão. Atualize a página.'});
    } else if (action==='availability') {
      if (typeof req.body.unavailable!=='boolean') return res.status(400).end();
      await request(url,{method:'PATCH',body:JSON.stringify({indisponivel:req.body.unavailable})});
    } else return res.status(400).end();
    return res.json({ok:true});
  } catch(error) {
    return res.status(502).json({error:error.message || 'Não foi possível acessar o servidor.'});
  }
};