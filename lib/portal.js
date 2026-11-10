// Ligação com o Portal do Representante (Supabase do portal, função "notificar-solicitacao").
// - listarRcasPortal(): códigos e nomes dos RCAs cadastrados no portal (guardado no aparelho e
//   atualizado a cada abertura do app / do formulário).
// - notificarRcaPortal(id): avisa o RCA no portal (card Notificações + push) da resposta SIM/NÃO.
//   O texto é montado pela função a partir da própria solicitação, nunca por aqui.

const PORTAL_FN = 'https://ruygdlwiiinmlvukcehr.supabase.co/functions/v1/notificar-solicitacao';
const PORTAL_KEY = 'sb_publishable_dZjp4FesWNgDRQzewDMmpA_EzAy42t5';
const CHAVE_CACHE = 'sl_rcas_portal';

const chamar = async (corpo) => {
  const r = await fetch(PORTAL_FN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: PORTAL_KEY },
    body: JSON.stringify(corpo)
  });
  return r.json().catch(() => ({ ok: false }));
};

export const rcasEmCache = () => {
  try {
    const c = JSON.parse(localStorage.getItem(CHAVE_CACHE) || 'null');
    return Array.isArray(c?.rcas) ? c.rcas : [];
  } catch (e) {
    return [];
  }
};

export const listarRcasPortal = async () => {
  try {
    const res = await chamar({ acao: 'listar_rcas' });
    if (res?.ok && Array.isArray(res.rcas)) {
      try { localStorage.setItem(CHAVE_CACHE, JSON.stringify({ rcas: res.rcas, em: Date.now() })); } catch (e) {}
      return res.rcas;
    }
  } catch (e) {}
  return null; // sem conexão: quem chamou continua com o cache
};

export const notificarRcaPortal = async (id) => {
  try {
    return await chamar({ acao: 'notificar', id });
  } catch (e) {
    return { ok: false, error: 'sem conexão com o portal' };
  }
};

// Compara códigos ignorando espaços (o portal confere do mesmo jeito)
export const mesmoCodigo = (a, b) => {
  const n = (v) => String(v ?? '').trim();
  return n(a) !== '' && n(a) === n(b);
};
