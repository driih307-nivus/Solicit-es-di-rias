'use client';

import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

export default function Home() {
  const [solicitacoes, setSolicitacoes] = useState([]);
  const [busca, setBusca] = useState('');
  const [dataInicio, setDataInicio] = useState('');
  const [dataFim, setDataFim] = useState('');
  const [carregando, setCarregando] = useState(true);

  // Buscar solicitações no Supabase
  const buscarSolicitacoes = async () => {
    setCarregando(true);
    let query = supabase.from('solicitacoes').select('*').order('created_at', { ascending: false });

    const { data, error } = await query;
    if (error) {
      console.error('Erro ao buscar solicitações:', error);
    } else {
      setSolicitacoes(data || []);
    }
    setCarregando(false);
  };

  useEffect(() => {
    buscarSolicitacoes();

    // Sincronização em Tempo Real (Realtime)
    const channel = supabase
      .channel('schema-db-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'solicitacoes' },
        () => {
          buscarSolicitacoes();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Excluir solicitação
  const handleExcluir = async (id) => {
    if (confirm('Tem certeza que deseja excluir esta solicitação?')) {
      const { error } = await supabase.from('solicitacoes').delete().eq('id', id);
      if (error) {
        alert('Erro ao excluir solicitação: ' + error.message);
      } else {
        setSolicitacoes(solicitacoes.filter((item) => item.id !== id));
      }
    }
  };

  // Lógica da Busca Dinâmica e Filtro de Data
  const solicitacoesFiltradas = solicitacoes.filter((item) => {
    // 1. Busca por texto dinâmica
    const termo = busca.toLowerCase();
    const bateTexto =
      !busca ||
      (item.cliente && item.cliente.toLowerCase().includes(termo)) ||
      (item.representante && item.representante.toLowerCase().includes(termo)) ||
      (item.observacao && item.observacao.toLowerCase().includes(termo)) ||
      (item.status && item.status.toLowerCase().includes(termo));

    // 2. Filtro de Data
    const dataCriacao = item.created_at ? item.created_at.split('T')[0] : '';
    const bateDataInicio = !dataInicio || dataCriacao >= dataInicio;
    const bateDataFim = !dataFim || dataCriacao <= dataFim;

    return bateTexto && bateDataInicio && bateDataFim;
  });

  return (
    <main className="min-h-screen bg-gray-100 p-4 sm:p-6 text-gray-800">
      <div className="max-w-6xl mx-auto space-y-6">
        
        {/* Cabeçalho e Filtros */}
        <div className="bg-white p-5 rounded-xl shadow-md space-y-4">
          <h1 className="text-2xl font-bold text-gray-900">Painel de Solicitações Diárias</h1>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Campo de Busca Dinâmica */}
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">
                Busca Dinâmica
              </label>
              <input
                type="text"
                placeholder="Buscar cliente, representante..."
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Filtro Data Início */}
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">
                Data Inicial
              </label>
              <input
                type="date"
                value={dataInicio}
                onChange={(e) => setDataInicio(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Filtro Data Fim */}
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">
                Data Final
              </label>
              <input
                type="date"
                value={dataFim}
                onChange={(e) => setDataFim(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {(busca || dataInicio || dataFim) && (
            <button
              onClick={() => {
                setBusca('');
                setDataInicio('');
                setDataFim('');
              }}
              className="text-xs text-red-600 hover:underline font-semibold"
            >
              Limpar Filtros
            </button>
          )}
        </div>

        {/* Status de Carregamento */}
        {carregando ? (
          <div className="text-center py-8 text-gray-500 font-medium">Carregando solicitações...</div>
        ) : solicitacoesFiltradas.length === 0 ? (
          <div className="text-center py-8 text-gray-500 bg-white rounded-xl shadow-sm">
            Nenhuma solicitação encontrada com os filtros selecionados.
          </div>
        ) : (
          <>
            {/* VISÃO MOBILE: CARDS (Aparece apenas em telas pequenas) */}
            <div className="grid grid-cols-1 gap-4 md:hidden">
              {solicitacoesFiltradas.map((item) => (
                <div key={item.id} className="bg-white p-4 rounded-xl shadow-sm border border-gray-200 space-y-3">
                  <div className="flex justify-between items-start">
                    <div>
                      <span className="text-xs font-bold text-gray-400">#{item.id}</span>
                      <h3 className="font-bold text-lg text-gray-900">{item.cliente || 'Cliente não informado'}</h3>
                    </div>
                    <span className="px-2 py-1 text-xs font-semibold rounded-full bg-blue-100 text-blue-800">
                      {item.status || 'Pendente'}
                    </span>
                  </div>

                  <div className="text-sm space-y-1 text-gray-600">
                    <p><strong className="text-gray-700">Representante:</strong> {item.representante || '-'}</p>
                    <p><strong className="text-gray-700">Data:</strong> {item.created_at ? new Date(item.created_at).toLocaleDateString('pt-BR') : '-'}</p>
                    {item.observacao && (
                      <p className="bg-gray-50 p-2 rounded text-xs mt-2 border border-gray-100">
                        <strong>Obs:</strong> {item.observacao}
                      </p>
                    )}
                  </div>

                  <div className="pt-2 border-t border-gray-100 flex justify-end">
                    <button
                      onClick={() => handleExcluir(item.id)}
                      className="px-3 py-1.5 text-xs font-medium text-red-600 bg-red-50 hover:bg-red-100 rounded-lg transition"
                    >
                      Excluir
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* VISÃO DESKTOP: TABELA (Aparece apenas em telas médias e grandes) */}
            <div className="hidden md:block bg-white rounded-xl shadow-md overflow-hidden">
              <table className="w-full text-left border-collapse">
                <thead className="bg-gray-50 border-b border-gray-200 text-xs text-gray-500 uppercase">
                  <tr>
                    <th className="p-4">ID</th>
                    <th className="p-4">Cliente</th>
                    <th className="p-4">Representante</th>
                    <th className="p-4">Data</th>
                    <th className="p-4">Status</th>
                    <th className="p-4 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 text-sm">
                  {solicitacoesFiltradas.map((item) => (
                    <tr key={item.id} className="hover:bg-gray-50">
                      <td className="p-4 font-bold text-gray-400">#{item.id}</td>
                      <td className="p-4 font-semibold text-gray-900">{item.cliente || '-'}</td>
                      <td className="p-4 text-gray-600">{item.representante || '-'}</td>
                      <td className="p-4 text-gray-600">
                        {item.created_at ? new Date(item.created_at).toLocaleDateString('pt-BR') : '-'}
                      </td>
                      <td className="p-4">
                        <span className="px-2 py-1 text-xs font-semibold rounded-full bg-blue-100 text-blue-800">
                          {item.status || 'Pendente'}
                        </span>
                      </td>
                      <td className="p-4 text-right">
                        <button
                          onClick={() => handleExcluir(item.id)}
                          className="px-3 py-1 text-xs font-medium text-red-600 bg-red-50 hover:bg-red-100 rounded-lg transition"
                        >
                          Excluir
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

      </div>
    </main>
  );
}
