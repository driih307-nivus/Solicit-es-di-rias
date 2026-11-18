'use client';

import { useState } from 'react';
import { Lock, Eye, EyeOff, Loader2 } from 'lucide-react';

export default function Entrar() {
  const [senha, setSenha] = useState('');
  const [ver, setVer] = useState(false);
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);

  const entrar = async (e) => {
    e.preventDefault();
    if (!senha || enviando) return;
    setEnviando(true);
    setErro('');
    try {
      const r = await fetch('/api/entrar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ senha }),
      });
      if (r.ok) {
        window.location.replace('/');
        return;
      }
      setErro('Senha incorreta. Tente novamente.');
      setSenha('');
    } catch {
      setErro('Sem conexão. Verifique a internet e tente de novo.');
    }
    setEnviando(false);
  };

  return (
    <main className="min-h-screen flex items-center justify-center p-5 bg-slate-100">
      <form
        onSubmit={entrar}
        className="page-fade w-full max-w-sm rounded-2xl bg-white shadow-xl border border-slate-200 p-7"
      >
        <div className="mx-auto mb-4 w-14 h-14 rounded-2xl bg-emerald-600 flex items-center justify-center shadow-lg">
          <Lock className="w-7 h-7 text-white" />
        </div>
        <h1 className="text-center text-xl font-bold text-slate-800">Área do Aprovador</h1>
        <p className="text-center text-sm text-slate-500 mt-1 mb-6">
          Digite a senha de acesso para continuar
        </p>

        <div className="relative">
          <input
            type={ver ? 'text' : 'password'}
            value={senha}
            onChange={(e) => { setSenha(e.target.value); setErro(''); }}
            placeholder="Senha"
            autoFocus
            autoComplete="current-password"
            className="w-full rounded-xl border border-slate-300 bg-slate-50 text-slate-800 px-4 py-3 pr-12 text-base outline-none focus:ring-2 focus:ring-emerald-500"
          />
          <button
            type="button"
            onClick={() => setVer((v) => !v)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            aria-label={ver ? 'Esconder senha' : 'Mostrar senha'}
          >
            {ver ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
          </button>
        </div>

        {erro && <p className="page-fade mt-3 text-sm text-red-600 text-center">{erro}</p>}

        <button
          type="submit"
          disabled={!senha || enviando}
          className="mt-5 w-full rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-semibold py-3 flex items-center justify-center gap-2 transition"
        >
          {enviando && <Loader2 className="w-5 h-5 animate-spin" />}
          Entrar
        </button>
        <p className="text-center text-xs text-slate-400 mt-4">Este aparelho fica liberado por 90 dias.</p>
      </form>
    </main>
  );
}
