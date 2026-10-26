'use client';

import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

export default function Home() {
  const [solicitacoes, setSolicitacoes] = useState([]);
  const [cliente, setCliente] = useState('');
  const [representante, setRepresentante] = useState('');
  const [observacao, setObservacao] = useState('');
  
  const [busca, setBusca] = useState('');
  const [dataInicio, setDataInicio] = useState('');
  const [dataFim, setDataFim] = useState('');
  
  const [carregando, setCarregando] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [mensagem, setMensagem] = useState(null);

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

    // Sincronização em tempo real (Realtime)
    const channel = supabase
      .channel('realtime-solicitacoes')
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

  // Enviar Nova Solicitação
  const handleNovaSolicitacao = async (e) => {
    e.preventDefault();
    if (!cliente.trim()) {
      setMensagem({ tipo: 'erro', texto: 'Por favor, informe o nome do cliente.' });
      return;
    }

    setEnviando(true);
    setMensagem(null);

    const { error } = await supabase.from('solicitacoes').insert([
      {
        cliente: cliente.trim(),
        representante: representante.trim() || 'Não informado',
        observacao: observacao.trim(),
        status: 'Pendente',
      },
    ]);

    setEnviando(false);

    if (error) {
      setMensagem({ tipo: 'erro', texto: 'Erro ao enviar: ' + error.message });
    } else {
      setMensagem({ tipo: 'sucesso', texto: 'Solicitação registrada com sucesso!' });
      setCliente('');
      setRepresentante('');
      setObservacao('');
      buscarSolicitacoes();
    }
  };

  // Excluir Solicitação
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

  // Lógica de Filtro Dinâmico e por Data
  const solicitacoesFiltradas = solicitacoes.filter((item) => {
    const termo = busca.toLowerCase();
    
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
    <main className="min-h-screen bg-slate-100 p-3 sm:p-6 text-slate-800">
      <div className="max-w-5xl mx-auto space-y-6">
        
        {/* Cabeçalho */}
        <div className="bg-white p-4 sm:p-6 rounded-2xl shadow-sm border border-slate-200">
          <h1 className="text-2xl font-bold text-slate-900">Solicitações Diárias</h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Gestão e acompanhamento de solicitações em tempo real.
          </p>
        </div>

        {/* Formulário de Envio */}
        <div className="bg-white p-4 sm:p-6 rounded-2xl shadow-sm border border-slate-200">
          <h2 className="text-lg font-bold text-slate-900 mb-4">Nova Solicitação</h2>
          
          {mensagem && (
            <div
              className={`p-3 rounded-lg mb-4 text-sm font-medium ${
                mensagem.tipo === 'sucesso'
                  ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                  : 'bg-rose-50 text-rose-800 border border-rose-200'
              }`}
            >
              {mensagem.texto}
            </div>
          )}

          <form onSubmit={handleNovaSolicitacao} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">
                  Cliente *
                </label>
                <input
                  type="text"
                  placeholder="Nome do cliente"
                  value={cliente}
                  onChange={(e) => setCliente(e.target.value)}
                  className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">
                  Representante
                </label>
                <input
                  type="text"
                  placeholder="Nome do representante"
                  value={representante}
                  onChange={(e) => setRepresentante(e.target.value)}
                  className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">
                Observação / Detalhes
              </label>
              <textarea
                rows="2"
                placeholder="Descreva a solicitação..."
                value={observacao}
                onChange={(e) => setObservacao(e.target.value)}
                className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <button
              type="submit"
              disabled={enviando}
              className="w-full sm:w-auto px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-medium text-sm rounded-lg transition shadow-sm disabled:opacity-50"
            >
              {enviando ? 'Enviando...' : 'Cadastrar Solicitação'}
            </button>
          </form>
        </div>

        {/* Filtros de Pesquisa e Data */}
        <div className="bg-white p-4 sm:p-6 rounded-2xl shadow-sm border border-slate-200 space-y-4">
          <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-2">
            <h2 className="text-lg font-bold text-slate-900">Histórico de Solicitações</h2>
            <span className="text-xs bg-slate-100 text-slate-600 px-2.5 py-1 rounded-full font-semibold w-fit">
              Total: {solicitacoesFiltradas.length}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">
                Busca Dinâmica
              </label>
              <input
                type="text"
                placeholder="Pesquisar cliente, rep..."
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">
                Data Inicial
              </label>
              <input
                type="date"
                value={dataInicio}
                onChange={(e) => setDataInicio(e.target.value)}
                className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">
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
              className="text-xs text-rose-600 hover:underline font-semibold"
            >
              Limpar Filtros
            </button>
          )}
        </div>

        {/* Listagem: Cards no Celular / Tabela no Desktop */}
        {carregando ? (
          <div className="text-center py-12 text-slate-500 font-medium">Carregando solicitações...</div>
        ) : solicitacoesFiltradas.length === 0 ? (
          <div className="text-center py-10 bg-white rounded-2xl border border-slate-200 text-slate-500 text-sm">
            Nenhuma solicitação encontrada.
          </div>
        ) : (
          <div>
            {/* CARDS APENAS PARA CELULAR */}
            <div className="block sm:hidden space-y-3">
              {solicitacoesFiltradas.map((item) => (
                <div key={item.id} className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 space-y-3">
                  <div className="flex justify-between items-start">
                    <div>
                      <span className="text-xs font-bold text-slate-400">#{item.id}</span>
                      <h3 className="font-bold text-base text-slate-900">
                        {item.cliente || item.nome_cliente || item.nome || 'Cliente não informado'}
                      </h3>
                    </div>
                    <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                      {item.status || 'Pendente'}
                    </span>
                  </div>

                  <div className="text-xs space-y-1.5 text-slate-600">
                    <p>
                      <strong className="text-slate-800">Representante:</strong> {item.representante || item.rep || '-'}
                    </p>
                    <p>
                      <strong className="text-slate-800">Data:</strong>{' '}
                      {item.created_at ? new Date(item.created_at).toLocaleDateString('pt-BR') : '-'}
                    </p>
                    {(item.observacao || item.obs) && (
                      <p className="bg-slate-50 p-2.5 rounded-lg text-slate-700 mt-2 border border-slate-100">
                        <strong>Obs:</strong> {item.observacao || item.obs}
                      </p>
                    )}
                  </div>

                  <div className="pt-2 border-t border-slate-100 flex justify-end">
                    <button
                      onClick={() => handleExcluir(item.id)}
                      className="px-3 py-1.5 text-xs font-semibold text-rose-600 bg-rose-50 hover:bg-rose-100 rounded-lg transition"
                    >
                      Excluir
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* TABELA APENAS PARA COMPUTADOR */}
            <div className="hidden sm:block bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
              <table className="w-full text-left border-collapse">
                <thead className="bg-slate-50 border-b border-slate-200 text-xs text-slate-500 uppercase">
                  <tr>
                    <th className="p-4">ID</th>
                    <th className="p-4">Cliente</th>
                    <th className="p-4">Representante</th>
                    <th className="p-4">Data</th>
                    <th className="p-4">Status</th>
                    <th className="p-4 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {solicitacoesFiltradas.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-50/80 transition">
                      <td className="p-4 font-bold text-slate-400">#{item.id}</td>
                      <td className="p-4 font-semibold text-slate-900">
                        {item.cliente || item.nome_cliente || item.nome || '-'}
                      </td>
                      <td className="p-4 text-slate-600">{item.representante || item.rep || '-'}</td>
                      <td className="p-4 text-slate-600">
                        {item.created_at ? new Date(item.created_at).toLocaleDateString('pt-BR') : '-'}
                      </td>
                      <td className="p-4">
                        <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                          {item.status || 'Pendente'}
                        </span>
                      </td>
                      <td className="p-4 text-right">
                        <button
                          onClick={() => handleExcluir(item.id)}
                          className="px-3 py-1 text-xs font-semibold text-rose-600 bg-rose-50 hover:bg-rose-100 rounded-lg transition"
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
