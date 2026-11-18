import { NextResponse } from 'next/server';
import { COOKIE_SESSAO, carimboDaSenha } from '../../../lib/sessao';

export const dynamic = 'force-dynamic';

const espera = (ms) => new Promise((r) => setTimeout(r, ms));

// Confere a senha e libera o aparelho por 90 dias
export async function POST(req) {
  const senhaCerta = process.env.SENHA_APROVADOR;
  if (!senhaCerta) return NextResponse.json({ ok: true });

  let senha = '';
  try { senha = String((await req.json()).senha || ''); } catch {}

  if (senha !== senhaCerta) {
    await espera(1000); // atrasa tentativas seguidas
    return NextResponse.json({ ok: false, erro: 'Senha incorreta' }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE_SESSAO, await carimboDaSenha(senhaCerta), {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 90,
  });
  return res;
}

// Sair: apaga a liberação deste aparelho
export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE_SESSAO, '', { path: '/', maxAge: 0 });
  return res;
}
