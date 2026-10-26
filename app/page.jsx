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
    const { data, error } = await supabase
      .from('solicitacoes')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Erro ao buscar solicitações:', error);
    } else {
      setSolicitacoes(data || []);
    }
    setCarregando(false);
  };

  useEffect(() => {
    buscarSolicitacoes();

    // Escutar mudanças em tempo real
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
        alert('Erro ao excluir: ' + error.message);
      } else {
        setSolicitacoes((prev) => prev.filter((item) => item.id !== id));
      }
    }
  };

  // Filtragem dinâmica
  const solicitacoesFiltradas = solicitacoes.filter((item) => {
    const termo = busca.toLowerCase();
    
    // Pega o nome do cliente ou campos equivalentes
    const clienteTexto = String(item.cliente || item.nome_cliente || item.nome || '').toLowerCase();
    const repTexto = String(item.representante || item.rep || '').toLowerCase();
    const obsTexto = String(item.observacao || item.obs || '').toLowerCase();
    const statusTexto = String(item.status || '').toLowerCase();

    const bateTexto =
      !busca ||
      clienteTexto.includes(termo) ||
      repTexto.includes(termo) ||
      obsTexto.includes(termo) ||
      statusTexto.includes(termo);

    const dataCriacao = item.created_at ? item.created_at.split('T')[0] : '';
    const bateDataInicio = !dataInicio || dataCriacao >= dataInicio;
    const bateDataFim = !dataFim || dataCriacao <= dataFim;

    return bateTexto && bateDataInicio && bateDataFim;
  });

  return (
    <main className="min-h-screen bg-gray-100 p-3 sm:p-6 text-gray-800">
      <div className="max-w-6xl mx-auto space-y-4">
        
        {/* Painel Superior / Filtros */}
        <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200 space-y-3">
          <div className="flex justify-between items-center">
            <h1 className="text-xl font-bold text-gray-900">Solicitações Diárias</h1>
            <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded-md font-semibold">
              Total: {solicitacoesFiltradas.length}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* Campo de Busca */}
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">
                Busca Dinâmica
              </label>
              <input
                type="text"
                placeholder="Buscar cliente, rep..."
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Data Inicial */}
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">
                Data Inicial
              </label>
              <input
                type="date"
                value={dataInicio}
                onChange={(e) => setDataInicio(e.target.value)}
                className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Data Final */}
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">
                Data Final
              </label>
              <input
                type="date"
                value={dataFim}
                onChange={(e) => setDataFim(e.target.value)}
                className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
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

        {/* Conteúdo Principal */}
        {carregando ? (
          <div className="text-center py-8 text-gray-500">Carregando solicitações...</div>
        ) : solicitacoesFiltradas.length === 0 ? (
          <div className="text-center py-8 text-gray-500 bg-white rounded-xl shadow-sm p-4">
            Nenhuma solicitação encontrada.
          </div>
        ) : (
          <div>
            {/* CARDS PARA CELULAR (Telas abaixo de 768px) */}
            <div className="block md:hidden space-y-3">
              {solicitacoesFiltradas.map((item) => (
                <div key={item.id} className="bg-white p-4 rounded-xl shadow-sm border border-gray-200 space-y-2">
                  <div className="flex justify-between items-start">
                    <div>
                      <span className="text-xs font-bold text-gray-400">#{item.id}</span>
                      <h3 className="font-bold text-base text-gray-900">
                        {item.cliente || item.nome_cliente || item.nome || 'Cliente não informado'}
                      </h3>
                    </div>
                    <span className="px-2 py-1 text-xs font-semibold rounded-full bg-blue-100 text-blue-800">
                      {item.status || 'Pendente'}
                    </span>
                  </div>

                  <div className="text-xs space-y-1 text-gray-600">
                    <p><strong>Representante:</strong> {item.representante || item.rep || '-'}</p>
                    <p><strong>Data:</strong> {item.created_at ? new Date(item.created_at).toLocaleDateString('pt-BR') : '-'}</p>
                    {(item.observacao || item.obs) && (
                      <p className="bg-gray-50 p-2 rounded text-gray-700 mt-1 border border-gray-100">
                        <strong>Obs:</strong> {item.observacao || item.obs}
                      </p>
                    )}
                  </div>

                  <div className="pt-2 border-t border-gray-100 flex justify-end">
                    <button
                      onClick={() => handleExcluir(item.id)}
                      className="px-3 py-1 text-xs font-semibold text-red-600 bg-red-50 hover:bg-red-100 rounded-md"
                    >
                      Excluir
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* TABELA PARA DESKTOP (Telas a partir de 768px) */}
            <div className="hidden md:block bg-white rounded-xl shadow-sm overflow-hidden border border-gray-200">
              <table className="w-full text-left border-collapse">
                <thead className="bg-gray-50 border-b border-gray-200 text-xs text-gray-500 uppercase">
                  <tr>
                    <th className="p-3">ID</th>
                    <th className="p-3">Cliente</th>
                    <th className="p-3">Representante</th>
                    <th className="p-3">Data</th>
                    <th className="p-3">Status</th>
                    <th className="p-3 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 text-sm">
                  {solicitacoesFiltradas.map((item) => (
                    <tr key={item.id} className="hover:bg-gray-50">
                      <td className="p-3 font-bold text-gray-400">#{item.id}</td>
                      <td className="p-3 font-semibold text-gray-900">
                        {item.cliente || item.nome_cliente || item.nome || '-'}
                      </td>
                      <td className="p-3 text-gray-600">{item.representante || item.rep || '-'}</td>
                      <td className="p-3 text-gray-600">
                        {item.created_at ? new Date(item.created_at).toLocaleDateString('pt-BR') : '-'}
                      </td>
                      <td className="p-3">
                        <span className="px-2 py-1 text-xs font-semibold rounded-full bg-blue-100 text-blue-800">
                          {item.status || 'Pendente'}
                        </span>
                      </td>
                      <td className="p-3 text-right">
                        <button
                          onClick={() => handleExcluir(item.id)}
                          className="px-3 py-1 text-xs font-semibold text-red-600 bg-red-50 hover:bg-red-100 rounded-md"
                        >
                          Excluir
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

      </div>
    </main>
  );
}
