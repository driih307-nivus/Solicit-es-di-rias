import { NextResponse } from 'next/server';
import { COOKIE_SESSAO, carimboDaSenha } from './lib/sessao';

// Só o link do aprovador pede senha. A senha fica na variável SENHA_APROVADOR da Vercel.
export async function middleware(req) {
  if (process.env.NEXT_PUBLIC_PERFIL !== 'aprovador') return NextResponse.next();
  const senha = process.env.SENHA_APROVADOR;
  if (!senha) return NextResponse.next(); // sem senha cadastrada, o app continua aberto como antes

  const { pathname } = req.nextUrl;
  if (pathname === '/entrar' || pathname === '/api/entrar') return NextResponse.next();

  const cookie = req.cookies.get(COOKIE_SESSAO)?.value;
  if (cookie && cookie === (await carimboDaSenha(senha))) return NextResponse.next();

  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ erro: 'Acesso restrito' }, { status: 401 });
  }
  const url = req.nextUrl.clone();
  url.pathname = '/entrar';
  url.search = '';
  return NextResponse.redirect(url);
}

export const config = {
  // arquivos do app (ícones, manifesto, scripts) ficam livres para o ícone e a instalação funcionarem
  matcher: ['/((?!_next/static|_next/image|icons/|manifest.webmanifest|favicon.ico).*)'],
};
