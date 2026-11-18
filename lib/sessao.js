// Sessão do aprovador: o cookie guarda um "carimbo" gerado a partir da senha (nunca a senha em si).
// Se a senha for trocada na Vercel, todos os aparelhos que já entraram precisam digitar a nova.
export const COOKIE_SESSAO = 'apv_sessao';

export async function carimboDaSenha(senha) {
  const dados = new TextEncoder().encode('frigolden-aprovador:' + senha);
  const hash = await crypto.subtle.digest('SHA-256', dados);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, '0')).join('');
}
