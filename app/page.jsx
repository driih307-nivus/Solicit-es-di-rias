import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { COOKIE_SESSAO, carimboDaSenha } from '@/lib/sessao';
import SolicitacoesApp from './SolicitacoesApp';

// Só o link do aprovador pede senha. A senha fica na variável SENHA_APROVADOR da Vercel.
// (A checagem fica aqui, no servidor, e não num middleware: o projeto na Vercel usa "services",
// que não aceita middleware Edge — com ele o deploy falhava.)
export const dynamic = 'force-dynamic';

export default async function Page() {
  if (process.env.NEXT_PUBLIC_PERFIL === 'aprovador') {
    const senha = process.env.SENHA_APROVADOR;
    if (senha) {
      const cookie = cookies().get(COOKIE_SESSAO)?.value;
      if (!cookie || cookie !== (await carimboDaSenha(senha))) redirect('/entrar');
    }
  }
  return <SolicitacoesApp />;
}
