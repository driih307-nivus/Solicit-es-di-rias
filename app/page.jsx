'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import toast from 'react-hot-toast';
import confetti from 'canvas-confetti';
import {
  Clock, CheckCircle2, XCircle, AlertCircle, Plus, Search,
  Download, RefreshCw, UserCheck, Send, MessageSquare, Shield, User
} from 'lucide-react';

const TIPOS_SOLICITACAO = [
  'Liberar Recebidos comprovantes',
  'Aumento de limite',
  'Alteração de prazo',
  'Antecipação de boleto',
  'Retirar taxa de boleto'
];

export default function SolicitacoesApp() {
  const [solicitacoes, setSolicitacoes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [perfil, setPerfil] = useState('SOLICITANTE'); // 'SOLICITANTE' ou 'APROVADOR'
  const [filtroStatus, setFiltroStatus] = useState('TODOS');
  const [busca, setBusca] = useState('');
  const [modalAberto, setModalAberto] = useState(false);
  const [modalAprovacao, setModalAprovacao] = useState(null);

  const [form, setForm] = useState({
    cod_liberacao: '',
    rca: '',
    tipo_solicitacao: TIPOS_SOLICITACAO[0],
    observacoes: ''
  });

  const [motivoRecusaInput, setMotivoRecusaInput] = useState('');

  // Tocar som de notificação
  const playNotificationSound = () => {
    try {
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, audioCtx.currentTime); // D5
      osc.frequency.exponentialRampToValueAtTime(880, audioCtx.currentTime + 0.15); // A5
      gain.gain.setValueAtTime(0.2, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.3);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.3);
    } catch (e) {
      console.log('Audio not allowed without interaction');
    }
  };

  // Carregar dados
  const fetchSolicitacoes = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('solicitacoes')
      .select('*')
      .order('data_enviada', { ascending: false });

    if (error) {
      toast.error('Erro ao carregar solicitações');
    } else {
      setSolicitacoes(data || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchSolicitacoes();

    // Inscrever em atualizações Realtime do Supabase
    const channel = supabase
      .channel('realtime_solicitacoes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'solicitacoes' },
        (payload) => {
          playNotificationSound();
          if (payload.eventType === 'INSERT') {
            toast.success(`Nova solicitação recebida: Pedido ${payload.new.cod_liberacao}`, {
              icon: '🔔',
              duration: 5000
            });
            setSolicitacoes((prev) => [payload.new, ...prev]);
          } else if (payload.eventType === 'UPDATE') {
            toast(`Solicitação ${payload.new.cod_liberacao} atualizada para [${payload.new.status}]`, {
              icon: payload.new.status === 'SIM' ? '✅' : payload.new.status === 'NAO' ? '❌' : 'ℹ️',
              duration: 4000
            });
            setSolicitacoes((prev) =>
              prev.map((item) => (item.id === payload.new.id ? payload.new : item))
            );
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Criar Solicitação
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.cod_liberacao || !form.rca) {
      toast.error('Preencha os campos obrigatórios!');
      return;
    }

    const toastId = toast.loading('Enviando solicitação...');
    const { data, error } = await supabase.from('solicitacoes').insert([
      {
        cod_liberacao: form.cod_liberacao,
        rca: form.rca,
        tipo_solicitacao: form.tipo_solicitacao,
        observacoes: form.observacoes,
        status: 'PENDENTE',
        data_enviada: new Date().toISOString()
      }
    ]);

    if (error) {
      toast.error('Erro ao enviar: ' + error.message, { id: toastId });
    } else {
      toast.success('Solicitação enviada com sucesso!', { id: toastId });
      setModalAberto(false);
      setForm({
        cod_liberacao: '',
        rca: '',
        tipo_solicitacao: TIPOS_SOLICITACAO[0],
        observacoes: ''
      });
      fetchSolicitacoes();
    }
  };

  // Processar Aprovação/Recusa
  const handleAprovarRecusar = async (statusAprovado) => {
    if (!modalAprovacao) return;

    if (!statusAprovado && !motivoRecusaInput.trim()) {
      toast.error('Informe o motivo da recusa!');
      return;
    }

    const toastId = toast.loading('Processando resposta...');
    const { error } = await supabase
      .from('solicitacoes')
      .update({
        status: statusAprovado ? 'SIM' : 'NAO',
        motivo_recusa: statusAprovado ? '' : motivoRecusaInput,
        data_finalizada: new Date().toISOString()
      })
      .eq('id', modalAprovacao.id);

    if (error) {
      toast.error('Erro ao atualizar: ' + error.message, { id: toastId });
    } else {
      if (statusAprovado) {
        confetti({ particleCount: 50, spread: 60, origin: { y: 0.8 } });
        toast.success('Solicitação APROVADA (SIM)!', { id: toastId });
      } else {
        toast.error('Solicitação RECUSADA (NÃO)', { id: toastId });
      }
      setModalAprovacao(null);
      setMotivoRecusaInput('');
      fetchSolicitacoes();
    }
  };

  // Formatação de data e cálculo de tempo
  const formatDateTime = (dateStr) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleString('pt-BR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit'
    });
  };

  const calcularTempoConclusao = (inicio, fim) => {
    if (!inicio || !fim) return '-';
    const diff = new Date(fim) - new Date(inicio);
    if (diff < 0) return '0:00';
    const hrs = Math.floor(diff / 3600000);
    const mins = Math.floor((diff % 3600000) / 60000);
    const secs = Math.floor((diff % 60000) / 1000);
    return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Exportar para CSV
  const exportToCSV = () => {
    const headers = ['Cód. Liberação', 'RCA', 'Tipo de Solicitação', 'Aprovado (SIM/NÃO)', 'Observações', 'Motivo Recusa', 'Data Enviada', 'Data Finalizada', 'Tempo Conclusão'];
    const rows = solicitacoesFiltradas.map(s => [
      s.cod_liberacao,
      s.rca,
      `"${s.tipo_solicitacao}"`,
      s.status,
      `"${(s.observacoes || '').replace(/"/g, '""')}"`,
      `"${(s.motivo_recusa || '').replace(/"/g, '""')}"`,
      formatDateTime(s.data_enviada),
      formatDateTime(s.data_finalizada),
      calcularTempoConclusao(s.data_enviada, s.data_finalizada)
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,﻿' + [headers.join(';'), ...rows.map(e => e.join(';'))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `solicitacoes_diarias_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const solicitacoesFiltradas = solicitacoes.filter(item => {
    const matchStatus = filtroStatus === 'TODOS' || item.status === filtroStatus;
    const matchSearch =
      item.cod_liberacao?.toLowerCase().includes(busca.toLowerCase()) ||
      item.rca?.toLowerCase().includes(busca.toLowerCase()) ||
      item.tipo_solicitacao?.toLowerCase().includes(busca.toLowerCase()) ||
      item.observacoes?.toLowerCase().includes(busca.toLowerCase());
    return matchStatus && matchSearch;
  });

  return (
    <div className="min-h-screen bg-slate-100 p-3 sm:p-6">
      <div className="max-w-7xl mx-auto space-y-5">
        
        {/* CABEÇALHO */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 sm:p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
                <Send className="w-6 h-6" />
              </span>
              <h1 className="text-xl sm:text-2xl font-bold text-slate-800">Solicitações Diárias</h1>
            </div>
            <p className="text-slate-500 text-sm mt-1">Gestão de liberações, aumentos de limite e prazos em tempo real</p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Troca de Perfil (Simulação) */}
            <div className="bg-slate-100 p-1 rounded-xl flex items-center border border-slate-200">
              <button
                onClick={() => setPerfil('SOLICITANTE')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition ${
                  perfil === 'SOLICITANTE' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <User className="w-3.5 h-3.5" /> Solicitante (RCA)
              </button>
              <button
                onClick={() => setPerfil('APROVADOR')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition ${
                  perfil === 'APROVADOR' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Shield className="w-3.5 h-3.5" /> Aprovador
              </button>
            </div>

            {/* Botão de Nova Solicitação (Apenas Solicitante) */}
            {perfil === 'SOLICITANTE' && (
              <button
                onClick={() => setModalAberto(true)}
                className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl text-sm font-semibold flex items-center gap-2 transition shadow-sm"
              >
                <Plus className="w-4 h-4" /> Nova Solicitação
              </button>
            )}

            <button
              onClick={exportToCSV}
              className="border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 px-3 py-2 rounded-xl text-sm font-medium flex items-center gap-2 transition"
            >
              <Download className="w-4 h-4" /> Exportar CSV
            </button>
          </div>
        </div>

        {/* ESTATÍSTICAS RÁPIDAS */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-slate-500">Total Registrado</p>
              <p className="text-xl font-bold text-slate-800">{solicitacoes.length}</p>
            </div>
            <span className="p-2 bg-slate-100 text-slate-600 rounded-lg"><RefreshCw className="w-4 h-4" /></span>
          </div>

          <div className="bg-white p-4 rounded-xl border border-amber-200 bg-amber-50/30 shadow-sm flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-amber-700">Pendentes</p>
              <p className="text-xl font-bold text-amber-800">{solicitacoes.filter(s => s.status === 'PENDENTE').length}</p>
            </div>
            <span className="p-2 bg-amber-100 text-amber-600 rounded-lg"><Clock className="w-4 h-4" /></span>
          </div>

          <div className="bg-white p-4 rounded-xl border border-emerald-200 bg-emerald-50/30 shadow-sm flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-emerald-700">Aprovados (SIM)</p>
              <p className="text-xl font-bold text-emerald-800">{solicitacoes.filter(s => s.status === 'SIM').length}</p>
            </div>
            <span className="p-2 bg-emerald-100 text-emerald-600 rounded-lg"><CheckCircle2 className="w-4 h-4" /></span>
          </div>

          <div className="bg-white p-4 rounded-xl border border-rose-200 bg-rose-50/30 shadow-sm flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-rose-700">Recusados (NÃO)</p>
              <p className="text-xl font-bold text-rose-800">{solicitacoes.filter(s => s.status === 'NAO').length}</p>
            </div>
            <span className="p-2 bg-rose-100 text-rose-600 rounded-lg"><XCircle className="w-4 h-4" /></span>
          </div>
        </div>

        {/* BARRA DE FILTROS E BUSCA */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row items-center justify-between gap-3">
          <div className="relative w-full md:w-80">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar Cód, RCA, Tipo ou Obs..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div className="flex items-center gap-2 w-full md:w-auto overflow-x-auto">
            {['TODOS', 'PENDENTE', 'SIM', 'NAO'].map((st) => (
              <button
                key={st}
                onClick={() => setFiltroStatus(st)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition whitespace-nowrap ${
                  filtroStatus === st
                    ? 'bg-slate-800 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {st === 'TODOS' ? 'Todos' : st === 'PENDENTE' ? 'Em Análise' : st === 'SIM' ? 'Aprovados (SIM)' : 'Recusados (NÃO)'}
              </button>
            ))}
          </div>
        </div>

        {/* TABELA / LISTA DE SOLICITAÇÕES */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          {loading ? (
            <div className="p-8 text-center text-slate-500">Carregando solicitações...</div>
          ) : solicitacoesFiltradas.length === 0 ? (
            <div className="p-8 text-center text-slate-500">Nenhuma solicitação encontrada.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs sm:text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold uppercase tracking-wider">
                    <th className="p-3">Cód. P / Liberação</th>
                    <th className="p-3">RCA</th>
                    <th className="p-3">Tipo de Solicitação</th>
                    <th className="p-3 text-center">Status (SIM/NÃO)</th>
                    <th className="p-3">Observações</th>
                    <th className="p-3">Motivo Recusa</th>
                    <th className="p-3">Enviada em</th>
                    <th className="p-3">Finalizada em</th>
                    <th className="p-3 text-center">Tempo Conclusão</th>
                    {perfil === 'APROVADOR' && <th className="p-3 text-center">Ações</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {solicitacoesFiltradas.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-50/80 transition">
                      <td className="p-3 font-semibold text-slate-800">{item.cod_liberacao}</td>
                      <td className="p-3 font-medium text-slate-600">{item.rca}</td>
                      <td className="p-3">{item.tipo_solicitacao}</td>
                      <td className="p-3 text-center">
                        <span
                          className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold ${
                            item.status === 'SIM'
                              ? 'bg-emerald-100 text-emerald-800'
                              : item.status === 'NAO'
                              ? 'bg-rose-100 text-rose-800'
                              : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {item.status === 'SIM' ? 'SIM' : item.status === 'NAO' ? 'NÃO' : 'EM ANÁLISE'}
                        </span>
                      </td>
                      <td className="p-3 max-w-xs truncate text-slate-600" title={item.observacoes}>
                        {item.observacoes || '-'}
                      </td>
                      <td className="p-3 max-w-xs truncate text-rose-600 font-medium" title={item.motivo_recusa}>
                        {item.motivo_recusa || '-'}
                      </td>
                      <td className="p-3 text-slate-500 whitespace-nowrap">{formatDateTime(item.data_enviada)}</td>
                      <td className="p-3 text-slate-500 whitespace-nowrap">{formatDateTime(item.data_finalizada)}</td>
                      <td className="p-3 text-center font-mono text-xs font-semibold text-slate-700">
                        {calcularTempoConclusao(item.data_enviada, item.data_finalizada)}
                      </td>
                      {perfil === 'APROVADOR' && (
                        <td className="p-3 text-center">
                          {item.status === 'PENDENTE' ? (
                            <button
                              onClick={() => setModalAprovacao(item)}
                              className="bg-indigo-600 hover:bg-indigo-700 text-white px-2.5 py-1.5 rounded-lg text-xs font-semibold transition shadow-sm"
                            >
                              Avaliar
                            </button>
                          ) : (
                            <button
                              onClick={() => setModalAprovacao(item)}
                              className="text-slate-400 hover:text-slate-600 text-xs font-medium underline"
                            >
                              Revisar
                            </button>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

      </div>

      {/* MODAL: NOVA SOLICITAÇÃO (SOLICITANTE) */}
      {modalAberto && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-200">
            <h2 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
              <Plus className="w-5 h-5 text-indigo-600" /> Nova Solicitação
            </h2>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Cód. P / Liberação *</label>
                <input
                  type="text"
                  required
                  placeholder="Ex: 541532"
                  value={form.cod_liberacao}
                  onChange={(e) => setForm({ ...form, cod_liberacao: e.target.value })}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Código RCA *</label>
                <input
                  type="text"
                  required
                  placeholder="Ex: 1203"
                  value={form.rca}
                  onChange={(e) => setForm({ ...form, rca: e.target.value })}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Tipo de Solicitação</label>
                <select
                  value={form.tipo_solicitacao}
                  onChange={(e) => setForm({ ...form, tipo_solicitacao: e.target.value })}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                >
                  {TIPOS_SOLICITACAO.map((tipo) => (
                    <option key={tipo} value={tipo}>{tipo}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Observações</label>
                <textarea
                  rows={3}
                  placeholder="Informe detalhes da liberação ou instrução do RCA..."
                  value={form.observacoes}
                  onChange={(e) => setForm({ ...form, observacoes: e.target.value })}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setModalAberto(false)}
                  className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg text-sm font-medium"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-semibold shadow-sm"
                >
                  Enviar Solicitação
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: AVALIAR / APROVAR / RECUSAR (APROVADOR) */}
      {modalAprovacao && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-200">
            <h2 className="text-lg font-bold text-slate-800 mb-2">Avaliar Solicitação #{modalAprovacao.cod_liberacao}</h2>
            <p className="text-xs text-slate-500 mb-4">RCA: {modalAprovacao.rca} | Tipo: {modalAprovacao.tipo_solicitacao}</p>

            {modalAprovacao.observacoes && (
              <div className="bg-slate-50 p-3 rounded-lg text-xs text-slate-700 border border-slate-200 mb-4">
                <strong>Obs. do Solicitante:</strong> {modalAprovacao.observacoes}
              </div>
            )}

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Motivo da Recusa (Obrigatório se Negar)</label>
                <textarea
                  rows={2}
                  placeholder="Ex: TÍTULO VENCIDO / EM ANÁLISE PELO CRÉDITO..."
                  value={motivoRecusaInput}
                  onChange={(e) => setMotivoRecusaInput(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3 pt-2">
                <button
                  onClick={() => handleAprovarRecusar(false)}
                  className="w-full bg-rose-600 hover:bg-rose-700 text-white py-2 rounded-xl text-sm font-semibold flex items-center justify-center gap-1.5 shadow-sm"
                >
                  <XCircle className="w-4 h-4" /> Recusar (NÃO)
                </button>
                <button
                  onClick={() => handleAprovarRecusar(true)}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white py-2 rounded-xl text-sm font-semibold flex items-center justify-center gap-1.5 shadow-sm"
                >
                  <CheckCircle2 className="w-4 h-4" /> Aprovar (SIM)
                </button>
              </div>

              <div className="text-center pt-2">
                <button
                  onClick={() => { setModalAprovacao(null); setMotivoRecusaInput(''); }}
                  className="text-xs text-slate-500 hover:text-slate-800 underline"
                >
                  Fechar sem alterar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
