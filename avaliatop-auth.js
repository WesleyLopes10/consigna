import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
export const supabase = createClient('https://vnycnlmvyzizmtavwwql.supabase.co','sb_publishable_xJ1OVcRN--pJQ0Hqi6tQhg_urBfdSaw');
export async function profile() {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;
  const { data } = await supabase.from('avaliatop_perfis').select('perfil').eq('usuario_id',user.id).maybeSingle();
  return ['mestre','visualizador','avaliador'].includes(data?.perfil) ? data.perfil : null;
}
