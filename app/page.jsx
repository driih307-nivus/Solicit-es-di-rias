'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import toast from 'react-hot-toast';
import confetti from 'canvas-confetti';
import {
  Clock, CheckCircle2, XCircle, AlertCircle, Plus, Search,
  Download, RefreshCw, UserCheck, Send, MessageSquare, Shield, User,
  Pencil, Trash2, X, CalendarDays,
  Paperclip, FileText, Music, Image as ImageIcon, ExternalLink
} from 'lucide-react';

const TIPOS_SOLICITACAO = [
  'Liberar Recebidos comprovantes',
  'Aumento de limite',
  'Alteração de prazo',
  'Antecipação de boleto',
  'Retirar taxa de boleto'
];

// Remove acentos e ignora maiúsculas/minúsculas (ex.: "análise" == "analise")
const normalizar = (v) =>
  String(v ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

// Converte data ISO/Date para "AAAA-MM-DD" no fuso local (compatível com <input type="date">)
const paraDataLocal = (valor) => {
  if (!valor) return '';
  const d = new Date(valor);
  if (isNaN(d)) return '';
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mes}-${dia}`;
};

// Perfil definido pelo link (deploy): NEXT_PUBLIC_PERFIL = 'aprovador' | 'solicitante'
const PERFIL = process.env.NEXT_PUBLIC_PERFIL === 'aprovador' ? 'APROVADOR' : 'SOLICITANTE';

// Dia de hoje no fuso do aparelho (vira exatamente à 00:00 local)
const diaDeHoje = () => paraDataLocal(new Date());

// "2026-10-26" -> "26/10/2026"
const formatarDia = (d) => (d ? d.split('-').reverse().join('/') : '');

const LIMITE_LINHAS = 1000;

// ===== Anexos (Supabase Storage) =====
const BUCKET = 'anexos';
const MAX_ARQUIVOS = 5;
const MAX_MB = 10;
const MAX_BYTES = MAX_MB * 1024 * 1024;
const ACEITA_ARQUIVOS = 'image/*,audio/*,application/pdf,.pdf,.m4a,.opus,.amr,.aac,.heic';

const MIME_POR_EXTENSAO = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', heic: 'image/heic',
  mp3: 'audio/mpeg', m4a: 'audio/mp4', wav: 'audio/wav', ogg: 'audio/ogg', opus: 'audio/ogg',
  aac: 'audio/aac', amr: 'audio/amr', webm: 'audio/webm'
};

// Descobre o tipo do arquivo (alguns celulares enviam o tipo vazio)
const tipoDoArquivo = (file) => {
  if (file.type) return file.type;
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  return MIME_POR_EXTENSAO[ext] || '';
};

const tipoPermitido = (tipo) =>
  tipo.startsWith('image/') || tipo.startsWith('audio/') || tipo === 'application/pdf';

const nomeSeguro = (nome) =>
  nome
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .slice(-80);

const novoId = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

const formatarTamanho = (bytes) => {
  if (!bytes && bytes !== 0) return '';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const iconeAnexo = (tipo = '', cls = 'w-4 h-4') =>
  tipo.startsWith('image/') ? <ImageIcon className={cls} /> :
  tipo.startsWith('audio/') ? <Music className={cls} /> :
  <FileText className={cls} />;

const formVazio = () => ({
  cod_liberacao: '',
  rca: '',
  tipo_solicitacao: TIPOS_SOLICITACAO[0],
  observacoes: ''
});

export default function SolicitacoesApp() {
  const [solicitacoes, setSolicitacoes] = useState([]);
  const [loading, setLoading] = useState(true);
  const perfil = PERFIL; // 'SOLICITANTE' ou 'APROVADOR' (definido pelo link)
  const [pronto, setPronto] = useState(false);
  const [hoje, setHoje] = useState('');
  const [seguindoHoje, setSeguindoHoje] = useState(true);
  const [pendentesAnteriores, setPendentesAnteriores] = useState(0);
  const reqRef = useRef(0);
  const hojeAnteriorRef = useRef('');
  const [filtroStatus, setFiltroStatus] = useState('TODOS');
  const [busca, setBusca] = useState('');
  const [modalAberto, setModalAberto] = useState(false);
  const [modalAprovacao, setModalAprovacao] = useState(null);
  const [dataInicio, setDataInicio] = useState('');
  const [dataFim, setDataFim] = useState('');
  const [editandoId, setEditandoId] = useState(null);
  const [modalExcluir, setModalExcluir] = useState(null);
  const [excluindo, setExcluindo] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [anexosExistentes, setAnexosExistentes] = useState([]); // já salvos (edição)
  const [anexosRemovidos, setAnexosRemovidos] = useState([]);   // marcados para remover ao salvar
  const [novosArquivos, setNovosArquivos] = useState([]);       // escolhidos agora (File[])
  const [anexosAbertoId, setAnexosAbertoId] = useState(null);   // janela de visualização
  const [urlsAnexos, setUrlsAnexos] = useState({});

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

  // Carregar dados do período selecionado (padrão: apenas o dia de hoje)
  const fetchSolicitacoes = async () => {
    const reqId = ++reqRef.current;
    setLoading(true);
    let q = supabase
      .from('solicitacoes')
      .select('*')
      .order('data_enviada', { ascending: false })
      .limit(LIMITE_LINHAS);
    if (dataInicio) q = q.gte('data_enviada', new Date(`${dataInicio}T00:00:00`).toISOString());
    if (dataFim) q = q.lte('data_enviada', new Date(`${dataFim}T23:59:59.999`).toISOString());
    const { data, error } = await q;
    if (reqId !== reqRef.current) return; // resposta antiga, ignora

    if (error) {
      toast.error('Erro ao carregar solicitações');
    } else {
      setSolicitacoes(data || []);
      if ((data || []).length >= LIMITE_LINHAS) {
        toast(`Mostrando as ${LIMITE_LINHAS} mais recentes. Refine o período para ver as demais.`, { icon: 'ℹ️' });
      }
    }
    setLoading(false);
  };

  // Início: define "hoje" no aparelho (evita diferença de fuso com o servidor)
  useEffect(() => {
    const h = diaDeHoje();
    hojeAnteriorRef.current = h;
    setHoje(h);
    setDataInicio(h);
    setDataFim(h);
    setPronto(true);
    document.title = (PERFIL === 'APROVADOR' ? 'Aprovador' : 'Solicitante') + ' — Solicitações Diárias';
  }, []);

  // Virada do dia: à 00:00 a tela volta para o dia novo (os dias anteriores seguem salvos e pesquisáveis)
  useEffect(() => {
    if (!pronto) return;
    let t;
    const agendar = () => {
      const agora = new Date();
      const prox = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate() + 1, 0, 0, 1);
      t = setTimeout(() => {
        setHoje(diaDeHoje());
        agendar();
      }, prox - agora);
    };
    agendar();
    // Celular em repouso pode atrasar o timer: confere ao voltar para a tela
    const aoVoltar = () => {
      if (document.visibilityState === 'visible') setHoje(diaDeHoje());
    };
    document.addEventListener('visibilitychange', aoVoltar);
    return () => {
      clearTimeout(t);
      document.removeEventListener('visibilitychange', aoVoltar);
    };
  }, [pronto]);

  useEffect(() => {
    if (!pronto || !hoje || hoje === hojeAnteriorRef.current) return;
    hojeAnteriorRef.current = hoje;
    if (seguindoHoje) {
      setDataInicio(hoje);
      setDataFim(hoje);
      setBusca('');
      setFiltroStatus('TODOS');
      toast(`Novo dia: ${formatarDia(hoje)}. Os dias anteriores continuam disponíveis pela data.`, { icon: '🌅', duration: 6000 });
    }
  }, [hoje]);

  // Recarrega quando o período muda
  useEffect(() => {
    if (pronto) fetchSolicitacoes();
  }, [pronto, dataInicio, dataFim]);

  // Pendentes de dias anteriores (para não passarem despercebidas na tela limpa)
  useEffect(() => {
    if (!pronto || !hoje) return;
    supabase
      .from('solicitacoes')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'PENDENTE')
      .lt('data_enviada', new Date(`${hoje}T00:00:00`).toISOString())
      .then(({ count }) => setPendentesAnteriores(count || 0));
  }, [pronto, hoje, solicitacoes]);

  useEffect(() => {
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
          } else if (payload.eventType === 'DELETE') {
            setSolicitacoes((prev) => prev.filter((item) => item.id !== payload.old.id));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Abrir modal para uma nova solicitação
  const abrirNova = () => {
    setEditandoId(null);
    setForm(formVazio());
    limparAnexosForm();
    setModalAberto(true);
  };

  // Abrir modal para editar uma solicitação existente
  const abrirEdicao = (item) => {
    setEditandoId(item.id);
    setForm({
      cod_liberacao: item.cod_liberacao || '',
      rca: item.rca || '',
      tipo_solicitacao: item.tipo_solicitacao || TIPOS_SOLICITACAO[0],
      observacoes: item.observacoes || ''
    });
    setAnexosExistentes(item.anexos || []);
    setAnexosRemovidos([]);
    setNovosArquivos([]);
    setModalAberto(true);
  };

  const limparAnexosForm = () => {
    setAnexosExistentes([]);
    setAnexosRemovidos([]);
    setNovosArquivos([]);
  };

  const fecharModalForm = () => {
    setModalAberto(false);
    setEditandoId(null);
    setForm(formVazio());
    limparAnexosForm();
  };

  // Escolher arquivos no formulário (valida tipo, tamanho e quantidade)
  const escolherArquivos = (e) => {
    const lista = Array.from(e.target.files || []);
    e.target.value = ''; // permite escolher o mesmo arquivo de novo
    if (!lista.length) return;

    let total = anexosExistentes.length + novosArquivos.length;
    const aceitos = [];
    for (const f of lista) {
      if (!tipoPermitido(tipoDoArquivo(f))) {
        toast.error(`"${f.name}": use imagem, áudio ou PDF.`);
        continue;
      }
      if (f.size > MAX_BYTES) {
        toast.error(`"${f.name}" passa de ${MAX_MB} MB.`);
        continue;
      }
      if (total >= MAX_ARQUIVOS) {
        toast.error(`Máximo de ${MAX_ARQUIVOS} anexos por solicitação.`);
        break;
      }
      aceitos.push(f);
      total++;
    }
    if (aceitos.length) setNovosArquivos((prev) => [...prev, ...aceitos]);
  };

  // Envia os arquivos novos ao Storage; se algum falhar, desfaz os já enviados
  const subirArquivos = async (arquivos) => {
    const enviados = [];
    try {
      for (const f of arquivos) {
        const tipo = tipoDoArquivo(f);
        const path = `${novoId()}/${nomeSeguro(f.name)}`;
        const { error } = await supabase.storage
          .from(BUCKET)
          .upload(path, f, { contentType: tipo, upsert: false });
        if (error) throw error;
        enviados.push({ path, nome: f.name, tipo, tamanho: f.size });
      }
    } catch (err) {
      await removerArquivos(enviados.map((a) => a.path));
      throw err;
    }
    return enviados;
  };

  const removerArquivos = async (paths) => {
    if (!paths || paths.length === 0) return;
    try {
      await supabase.storage.from(BUCKET).remove(paths);
    } catch (e) {
      console.log('Falha ao remover arquivos do Storage', e);
    }
  };

  // Download com o nome original do arquivo
  const baixarAnexo = async (a) => {
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(a.path, 120, { download: a.nome });
    if (error || !data?.signedUrl) {
      toast.error('Não foi possível baixar o arquivo.');
      return;
    }
    const link = document.createElement('a');
    link.href = data.signedUrl;
    link.download = a.nome;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const baixarTodos = async (lista) => {
    for (const a of lista) {
      await baixarAnexo(a);
      await new Promise((r) => setTimeout(r, 500));
    }
  };

  // Gera links temporários ao abrir a janela de anexos
  useEffect(() => {
    if (!anexosAbertoId) return;
    const item = solicitacoes.find((i) => i.id === anexosAbertoId);
    const paths = (item?.anexos || []).map((a) => a.path);
    if (!paths.length) return;
    supabase.storage
      .from(BUCKET)
      .createSignedUrls(paths, 3600)
      .then(({ data }) => {
        const mapa = {};
        (data || []).forEach((d) => { if (d.signedUrl) mapa[d.path] = d.signedUrl; });
        setUrlsAnexos(mapa);
      });
  }, [anexosAbertoId]);

  // Aprovador altera qualquer solicitação; solicitante só enquanto estiver pendente
  const podeAlterar = (item) => perfil === 'APROVADOR' || item.status === 'PENDENTE';

  // Criar ou salvar edição (com anexos)
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (enviando) return;
    const cod = form.cod_liberacao.trim();
    const rca = form.rca.trim();
    if (!cod || !rca) {
      toast.error('Preencha os campos obrigatórios!');
      return;
    }

    setEnviando(true);
    const toastId = toast.loading(
      novosArquivos.length ? 'Enviando anexos...' : editandoId ? 'Salvando alterações...' : 'Enviando solicitação...'
    );

    let enviados = [];
    try {
      enviados = await subirArquivos(novosArquivos);
    } catch (err) {
      toast.error('Erro ao enviar anexo: ' + (err.message || 'tente novamente'), { id: toastId });
      setEnviando(false);
      return;
    }
    const anexosFinais = [...anexosExistentes, ...enviados];

    // --- Edição ---
    if (editandoId) {
      const { data, error } = await supabase
        .from('solicitacoes')
        .update({
          cod_liberacao: cod,
          rca,
          tipo_solicitacao: form.tipo_solicitacao,
          observacoes: form.observacoes,
          anexos: anexosFinais
        })
        .eq('id', editandoId)
        .select();

      if (error) {
        await removerArquivos(enviados.map((a) => a.path));
        toast.error('Erro ao salvar: ' + error.message, { id: toastId });
      } else if (!data || data.length === 0) {
        await removerArquivos(enviados.map((a) => a.path));
        toast.error('Não foi possível salvar. Verifique a permissão de UPDATE (RLS) da tabela.', { id: toastId });
      } else {
        await removerArquivos(anexosRemovidos.map((a) => a.path));
        toast.success('Solicitação atualizada!', { id: toastId });
        setSolicitacoes((prev) => prev.map((item) => (item.id === data[0].id ? data[0] : item)));
        fecharModalForm();
      }
      setEnviando(false);
      return;
    }

    // --- Criação ---
    const { error } = await supabase.from('solicitacoes').insert([
      {
        cod_liberacao: cod,
        rca,
        tipo_solicitacao: form.tipo_solicitacao,
        observacoes: form.observacoes,
        anexos: anexosFinais,
        status: 'PENDENTE',
        data_enviada: new Date().toISOString()
      }
    ]);

    if (error) {
      await removerArquivos(enviados.map((a) => a.path));
      toast.error('Erro ao enviar: ' + error.message, { id: toastId });
    } else {
      toast.success('Solicitação enviada com sucesso!', { id: toastId });
      fecharModalForm();
      fetchSolicitacoes();
    }
    setEnviando(false);
  };

  // Excluir solicitação (e os anexos dela)
  const handleExcluir = async () => {
    if (!modalExcluir) return;
    setExcluindo(true);
    const toastId = toast.loading('Excluindo solicitação...');
    const { data, error } = await supabase
      .from('solicitacoes')
      .delete()
      .eq('id', modalExcluir.id)
      .select();
    setExcluindo(false);

    if (error) {
      toast.error('Erro ao excluir: ' + error.message, { id: toastId });
    } else if (!data || data.length === 0) {
      toast.error('Não foi possível excluir. Verifique a permissão de DELETE (RLS) da tabela.', { id: toastId });
    } else {
      await removerArquivos((modalExcluir.anexos || []).map((a) => a.path));
      setSolicitacoes((prev) => prev.filter((item) => item.id !== modalExcluir.id));
      toast.success('Solicitação excluída.', { id: toastId });
      setModalExcluir(null);
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
    const headers = ['Cód. Liberação', 'RCA', 'Tipo de Solicitação', 'Aprovado (SIM/NÃO)', 'Observações', 'Motivo Recusa', 'Data Enviada', 'Data Finalizada', 'Tempo Conclusão', 'Qtd. Anexos'];
    const rows = solicitacoesFiltradas.map(s => [
      s.cod_liberacao,
      s.rca,
      `"${s.tipo_solicitacao}"`,
      s.status,
      `"${(s.observacoes || '').replace(/"/g, '""')}"`,
      `"${(s.motivo_recusa || '').replace(/"/g, '""')}"`,
      formatDateTime(s.data_enviada),
      formatDateTime(s.data_finalizada),
      calcularTempoConclusao(s.data_enviada, s.data_finalizada),
      (s.anexos || []).length
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,﻿' + [headers.join(';'), ...rows.map(e => e.join(';'))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `solicitacoes_diarias_${diaDeHoje()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Itens dentro do período selecionado (base dos contadores)
  const doPeriodo = useMemo(
    () =>
      solicitacoes.filter((item) => {
        const dia = paraDataLocal(item.data_enviada);
        if (dataInicio && (!dia || dia < dataInicio)) return false;
        if (dataFim && (!dia || dia > dataFim)) return false;
        return true;
      }),
    [solicitacoes, dataInicio, dataFim]
  );

  // Filtros: status + período (data enviada) + busca por vários termos, sem acento
  const solicitacoesFiltradas = useMemo(() => {
    const termos = normalizar(busca).split(/\s+/).filter(Boolean);

    return solicitacoes.filter((item) => {
      if (filtroStatus !== 'TODOS' && item.status !== filtroStatus) return false;

      const dia = paraDataLocal(item.data_enviada);
      if (dataInicio && (!dia || dia < dataInicio)) return false;
      if (dataFim && (!dia || dia > dataFim)) return false;

      if (termos.length === 0) return true;

      const statusTexto =
        item.status === 'SIM' ? 'sim aprovado' : item.status === 'NAO' ? 'nao recusado' : 'pendente em analise';
      const alvo = normalizar(
        [
          item.cod_liberacao,
          item.rca,
          item.tipo_solicitacao,
          item.observacoes,
          item.motivo_recusa,
          statusTexto,
          formatDateTime(item.data_enviada)
        ].join(' ')
      );
      // Todos os termos digitados precisam aparecer (em qualquer campo)
      return termos.every((termo) => alvo.includes(termo));
    });
  }, [solicitacoes, filtroStatus, busca, dataInicio, dataFim]);

  const visaoPadrao = seguindoHoje && dataInicio === hoje && dataFim === hoje;
  const temFiltroAtivo = Boolean(busca || filtroStatus !== 'TODOS' || !visaoPadrao);

  // Volta para a visão limpa do dia
  const limparFiltros = () => {
    setBusca('');
    setFiltroStatus('TODOS');
    setSeguindoHoje(true);
    setDataInicio(hoje);
    setDataFim(hoje);
  };

  // Atalhos de período: 1 = hoje, 7 = últimos 7 dias, etc.
  const aplicarPeriodo = (dias) => {
    const agora = new Date();
    const inicio = new Date();
    inicio.setDate(agora.getDate() - (dias - 1));
    setSeguindoHoje(dias === 1);
    setDataInicio(paraDataLocal(inicio));
    setDataFim(paraDataLocal(agora));
  };

  const verTodosOsDias = () => {
    setSeguindoHoje(false);
    setDataInicio('');
    setDataFim('');
  };

  const verPendentesAnteriores = () => {
    setSeguindoHoje(false);
    setDataInicio('');
    setDataFim('');
    setFiltroStatus('PENDENTE');
  };

  const rotuloPeriodo =
    !dataInicio && !dataFim
      ? 'Todos os dias'
      : dataInicio === dataFim
      ? dataInicio === hoje
        ? `Hoje (${formatarDia(hoje)})`
        : formatarDia(dataInicio)
      : `${dataInicio ? formatarDia(dataInicio) : 'início'} a ${dataFim ? formatarDia(dataFim) : 'hoje'}`;

  const badge = (item) => (
    <span
      className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold whitespace-nowrap ${
        item.status === 'SIM'
          ? 'bg-emerald-100 text-emerald-800'
          : item.status === 'NAO'
          ? 'bg-rose-100 text-rose-800'
          : 'bg-amber-100 text-amber-800'
      }`}
    >
      {item.status === 'SIM' ? 'SIM' : item.status === 'NAO' ? 'NÃO' : 'EM ANÁLISE'}
    </span>
  );

  const chipAnexos = (item) => {
    const n = (item.anexos || []).length;
    if (!n) return <span className="text-slate-300">-</span>;
    return (
      <button
        onClick={() => setAnexosAbertoId(item.id)}
        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-indigo-50 text-indigo-700 hover:bg-indigo-100 transition whitespace-nowrap"
        aria-label={`Ver ${n} anexo(s)`}
      >
        <Paperclip className="w-3.5 h-3.5" /> {n}
      </button>
    );
  };

  // Botões de ação (tabela no desktop, cartão no celular)
  const acoesItem = (item, grande = false) => {
    const pad = grande ? 'p-2.5' : 'p-1.5';
    const ic = grande ? 'w-5 h-5' : 'w-4 h-4';
    return (
      <>
        {perfil === 'APROVADOR' &&
          (item.status === 'PENDENTE' ? (
            <button
              onClick={() => setModalAprovacao(item)}
              className={`bg-indigo-600 hover:bg-indigo-700 text-white ${grande ? 'px-4 py-2.5' : 'px-2.5 py-1.5'} rounded-lg text-xs font-semibold transition shadow-sm`}
            >
              Avaliar
            </button>
          ) : (
            <button
              onClick={() => setModalAprovacao(item)}
              className={`text-slate-500 hover:text-slate-700 text-xs font-medium underline ${grande ? 'px-3 py-2.5' : ''}`}
            >
              Revisar
            </button>
          ))}
        {podeAlterar(item) && (
          <>
            <button
              onClick={() => abrirEdicao(item)}
              title="Editar"
              aria-label="Editar solicitação"
              className={`${pad} rounded-lg text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 transition`}
            >
              <Pencil className={ic} />
            </button>
            <button
              onClick={() => setModalExcluir(item)}
              title="Excluir"
              aria-label="Excluir solicitação"
              className={`${pad} rounded-lg text-slate-500 hover:text-rose-600 hover:bg-rose-50 transition`}
            >
              <Trash2 className={ic} />
            </button>
          </>
        )}
      </>
    );
  };

  return (
    <div className="min-h-screen bg-slate-100 p-3 sm:p-6 pb-24 md:pb-6 overflow-x-hidden">
      <div className="max-w-7xl mx-auto space-y-4 sm:space-y-5">
        
        {/* CABEÇALHO */}
        <div className="fade-up bg-white rounded-2xl shadow-sm border border-slate-200 p-4 sm:p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
                <Send className="w-6 h-6" />
              </span>
              <h1 className="text-xl sm:text-2xl font-bold text-slate-800">Solicitações Diárias</h1>
            </div>
            <p className="text-slate-500 text-sm mt-1">Gestão de liberações, aumentos de limite e prazos em tempo real</p>
          </div>

          <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
            {/* Perfil definido pelo link */}
            <span className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-100">
              {perfil === 'APROVADOR' ? <Shield className="w-3.5 h-3.5" /> : <User className="w-3.5 h-3.5" />}
              {perfil === 'APROVADOR' ? 'Aprovador' : 'Solicitante (RCA)'}
            </span>

            {/* Botão de Nova Solicitação (Apenas Solicitante) */}
            {perfil === 'SOLICITANTE' && (
              <button
                onClick={abrirNova}
                className="hidden md:flex bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl text-sm font-semibold items-center gap-2 transition shadow-sm"
              >
                <Plus className="w-4 h-4" /> Nova Solicitação
              </button>
            )}

            <button
              onClick={exportToCSV}
              className="flex-1 md:flex-none justify-center border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 px-3 py-2.5 md:py-2 rounded-xl text-sm font-medium flex items-center gap-2 transition"
            >
              <Download className="w-4 h-4" /> Exportar CSV
            </button>
          </div>
        </div>

        {/* ESTATÍSTICAS RÁPIDAS */}
        <div className="stagger grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-slate-500">Total do período</p>
              <p className="text-xl font-bold text-slate-800">{doPeriodo.length}</p>
            </div>
            <span className="p-2 bg-slate-100 text-slate-600 rounded-lg"><RefreshCw className="w-4 h-4" /></span>
          </div>

          <div className="bg-white p-4 rounded-xl border border-amber-200 bg-amber-50/30 shadow-sm flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-amber-700">Pendentes</p>
              <p className="text-xl font-bold text-amber-800">{doPeriodo.filter(s => s.status === 'PENDENTE').length}</p>
            </div>
            <span className="p-2 bg-amber-100 text-amber-600 rounded-lg"><Clock className="w-4 h-4" /></span>
          </div>

          <div className="bg-white p-4 rounded-xl border border-emerald-200 bg-emerald-50/30 shadow-sm flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-emerald-700">Aprovados (SIM)</p>
              <p className="text-xl font-bold text-emerald-800">{doPeriodo.filter(s => s.status === 'SIM').length}</p>
            </div>
            <span className="p-2 bg-emerald-100 text-emerald-600 rounded-lg"><CheckCircle2 className="w-4 h-4" /></span>
          </div>

          <div className="bg-white p-4 rounded-xl border border-rose-200 bg-rose-50/30 shadow-sm flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-rose-700">Recusados (NÃO)</p>
              <p className="text-xl font-bold text-rose-800">{doPeriodo.filter(s => s.status === 'NAO').length}</p>
            </div>
            <span className="p-2 bg-rose-100 text-rose-600 rounded-lg"><XCircle className="w-4 h-4" /></span>
          </div>
        </div>

        {/* PENDENTES DE DIAS ANTERIORES */}
        {seguindoHoje && pendentesAnteriores > 0 && (
          <button
            onClick={verPendentesAnteriores}
            className="fade-up w-full text-left flex items-center gap-2 bg-amber-50 border border-amber-200 text-amber-800 rounded-xl px-4 py-3 text-sm"
          >
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>
              {pendentesAnteriores} solicitação(ões) pendente(s) de dias anteriores.
            </span>
            <span className="ml-auto underline font-semibold whitespace-nowrap">Ver</span>
          </button>
        )}

        {/* BARRA DE FILTROS E BUSCA */}
        <div className="fade-up bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-3">
          <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
            <div className="relative w-full md:w-96">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Buscar por cód., RCA, tipo, observação, motivo..."
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                className="w-full pl-9 pr-9 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              {busca && (
                <button
                  type="button"
                  onClick={() => setBusca('')}
                  aria-label="Limpar busca"
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
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

          <div className="flex flex-wrap items-end gap-3 pt-3 border-t border-slate-100">
            <div className="flex-1 min-w-[8.5rem] sm:flex-none">
              <label className="block text-xs font-semibold text-slate-600 mb-1">Enviada de</label>
              <input
                type="date"
                value={dataInicio}
                max={dataFim || undefined}
                onChange={(e) => { setSeguindoHoje(false); setDataInicio(e.target.value); }}
                className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div className="flex-1 min-w-[8.5rem] sm:flex-none">
              <label className="block text-xs font-semibold text-slate-600 mb-1">até</label>
              <input
                type="date"
                value={dataFim}
                min={dataInicio || undefined}
                onChange={(e) => { setSeguindoHoje(false); setDataFim(e.target.value); }}
                className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto overflow-x-auto pb-0.5">
              {[
                { label: 'Hoje', dias: 1 },
                { label: '7 dias', dias: 7 },
                { label: '30 dias', dias: 30 }
              ].map((p) => (
                <button
                  key={p.dias}
                  onClick={() => aplicarPeriodo(p.dias)}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 text-slate-600 hover:bg-slate-200 transition whitespace-nowrap"
                >
                  {p.label}
                </button>
              ))}
              <button
                onClick={verTodosOsDias}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 text-slate-600 hover:bg-slate-200 transition whitespace-nowrap"
              >
                Todos os dias
              </button>
            </div>

            {temFiltroAtivo && (
              <button
                onClick={limparFiltros}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold text-indigo-600 hover:bg-indigo-50 transition whitespace-nowrap"
              >
                Limpar filtros
              </button>
            )}

            <span className="sm:ml-auto w-full sm:w-auto text-xs text-slate-500 flex items-center gap-1.5">
              <CalendarDays className="w-3.5 h-3.5 shrink-0" />
              {rotuloPeriodo} · {solicitacoesFiltradas.length} de {doPeriodo.length} solicitações
            </span>
          </div>
        </div>

        {/* TABELA / LISTA DE SOLICITAÇÕES */}
        <div className="fade-up bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          {loading ? (
            <div className="p-8 text-center text-slate-500">Carregando solicitações...</div>
          ) : solicitacoesFiltradas.length === 0 ? (
            <div className="fade-in p-8 text-center text-slate-500 space-y-3">
              <p>Nenhuma solicitação encontrada em {rotuloPeriodo.toLowerCase()}.</p>
              {(dataInicio || dataFim) && (
                <button
                  onClick={verTodosOsDias}
                  className="px-4 py-2 rounded-lg text-sm font-semibold bg-indigo-50 text-indigo-700 hover:bg-indigo-100 transition"
                >
                  Buscar em todos os dias
                </button>
              )}
            </div>
          ) : (
            <>
            <div className="overflow-x-auto hidden md:block">
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
                    <th className="p-3 text-center">Anexos</th>
                    <th className="p-3 text-center">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {solicitacoesFiltradas.map((item, idx) => (
                    <tr key={item.id} className="fade-in hover:bg-slate-50/80 transition" style={{ animationDelay: `${Math.min(idx, 12) * 30}ms` }}>
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
                      <td className="p-3 text-center">{chipAnexos(item)}</td>
                      <td className="p-3">
                        <div className="flex items-center justify-center gap-1.5 whitespace-nowrap">{acoesItem(item)}</div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* LISTA EM CARTÕES (CELULAR) */}
            <div className="md:hidden divide-y divide-slate-100">
              {solicitacoesFiltradas.map((item, idx) => (
                <div
                  key={item.id}
                  className="fade-in p-4 space-y-2"
                  style={{ animationDelay: `${Math.min(idx, 10) * 30}ms` }}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-bold text-slate-800">#{item.cod_liberacao}</p>
                      <p className="text-xs text-slate-500">RCA {item.rca}</p>
                    </div>
                    {badge(item)}
                  </div>
                  <p className="text-sm text-slate-700">{item.tipo_solicitacao}</p>
                  {item.observacoes && (
                    <p className="text-xs text-slate-600 bg-slate-50 rounded-lg p-2 break-words">{item.observacoes}</p>
                  )}
                  {item.motivo_recusa && (
                    <p className="text-xs text-rose-600 font-medium break-words">Motivo: {item.motivo_recusa}</p>
                  )}
                  {(item.anexos || []).length > 0 && <div>{chipAnexos(item)}</div>}
                  <div className="text-[11px] text-slate-500 space-y-0.5">
                    <p>Enviada: {formatDateTime(item.data_enviada)}</p>
                    {item.data_finalizada && (
                      <p>
                        Finalizada: {formatDateTime(item.data_finalizada)} · Tempo{' '}
                        <span className="font-mono font-semibold">
                          {calcularTempoConclusao(item.data_enviada, item.data_finalizada)}
                        </span>
                      </p>
                    )}
                  </div>
                  <div className="flex items-center justify-end gap-2 pt-1">{acoesItem(item, true)}</div>
                </div>
              ))}
            </div>
            </>
          )}
        </div>

      </div>

      {/* MODAL: ANEXOS (VISUALIZAR / BAIXAR) */}
      {anexosAbertoId && (() => {
        const item = solicitacoes.find((i) => i.id === anexosAbertoId);
        const lista = item?.anexos || [];
        return (
          <div
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 z-[60] fade-in"
            onClick={() => { setAnexosAbertoId(null); setUrlsAnexos({}); }}
          >
            <div
              className="bg-white rounded-t-2xl sm:rounded-2xl max-w-lg w-full p-5 sm:p-6 shadow-xl border border-slate-200 max-h-[92vh] overflow-y-auto sheet-in pb-[calc(1.25rem+env(safe-area-inset-bottom))]"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start justify-between gap-3 mb-4">
                <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                  <Paperclip className="w-5 h-5 text-indigo-600" />
                  Anexos{item ? ` — #${item.cod_liberacao}` : ''}
                </h2>
                <button
                  onClick={() => { setAnexosAbertoId(null); setUrlsAnexos({}); }}
                  aria-label="Fechar"
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {lista.length === 0 ? (
                <p className="text-sm text-slate-500">Esta solicitação não tem anexos.</p>
              ) : (
                <div className="space-y-3">
                  {lista.map((a) => {
                    const url = urlsAnexos[a.path];
                    return (
                      <div key={a.path} className="fade-in border border-slate-200 rounded-xl p-3 space-y-2">
                        <div className="flex items-center gap-2 text-sm">
                          <span className="text-indigo-600">{iconeAnexo(a.tipo, 'w-5 h-5')}</span>
                          <span className="truncate flex-1 font-medium text-slate-800" title={a.nome}>{a.nome}</span>
                          <span className="text-xs text-slate-400 whitespace-nowrap">{formatarTamanho(a.tamanho)}</span>
                        </div>

                        {url && a.tipo?.startsWith('image/') && (
                          <img src={url} alt={a.nome} className="w-full max-h-72 object-contain rounded-lg bg-slate-50" />
                        )}
                        {url && a.tipo?.startsWith('audio/') && <audio controls src={url} className="w-full" />}

                        <div className="flex gap-2">
                          {url && (a.tipo === 'application/pdf' || a.tipo?.startsWith('image/')) && (
                            <a
                              href={url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg text-xs font-semibold bg-slate-100 text-slate-700 hover:bg-slate-200 transition"
                            >
                              <ExternalLink className="w-4 h-4" /> Abrir
                            </a>
                          )}
                          <button
                            onClick={() => baixarAnexo(a)}
                            className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white transition"
                          >
                            <Download className="w-4 h-4" /> Baixar
                          </button>
                        </div>
                      </div>
                    );
                  })}

                  {lista.length > 1 && (
                    <button
                      onClick={() => baixarTodos(lista)}
                      className="w-full inline-flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-sm font-semibold border border-slate-200 text-slate-700 hover:bg-slate-50 transition"
                    >
                      <Download className="w-4 h-4" /> Baixar todos ({lista.length})
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* BOTÃO FLUTUANTE (CELULAR, SOLICITANTE) */}
      {perfil === 'SOLICITANTE' && (
        <button
          onClick={abrirNova}
          aria-label="Nova solicitação"
          className="fade-in md:hidden fixed right-4 bottom-[calc(1rem+env(safe-area-inset-bottom))] z-40 bg-indigo-600 active:bg-indigo-700 text-white rounded-full px-5 py-3.5 shadow-lg flex items-center gap-2 text-sm font-semibold"
        >
          <Plus className="w-5 h-5" /> Nova Solicitação
        </button>
      )}

      {/* MODAL: NOVA SOLICITAÇÃO / EDITAR SOLICITAÇÃO */}
      {modalAberto && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 z-50 fade-in">
          <div className="bg-white rounded-t-2xl sm:rounded-2xl max-w-md w-full p-5 sm:p-6 shadow-xl border border-slate-200 max-h-[92vh] overflow-y-auto sheet-in pb-[calc(1.25rem+env(safe-area-inset-bottom))]">
            <h2 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
              {editandoId ? <Pencil className="w-5 h-5 text-indigo-600" /> : <Plus className="w-5 h-5 text-indigo-600" />}
              {editandoId ? 'Editar Solicitação' : 'Nova Solicitação'}
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
                  {(form.tipo_solicitacao && !TIPOS_SOLICITACAO.includes(form.tipo_solicitacao)
                    ? [form.tipo_solicitacao, ...TIPOS_SOLICITACAO]
                    : TIPOS_SOLICITACAO
                  ).map((tipo) => (
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

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Anexos (imagem, áudio ou PDF)</label>
                <label
                  htmlFor="anexo-input"
                  className="flex items-center justify-center gap-2 border-2 border-dashed border-slate-300 hover:border-indigo-400 hover:bg-indigo-50/40 text-slate-600 rounded-lg px-3 py-3 text-sm cursor-pointer transition"
                >
                  <Paperclip className="w-4 h-4" /> Toque para anexar arquivos
                </label>
                <input
                  id="anexo-input"
                  type="file"
                  multiple
                  accept={ACEITA_ARQUIVOS}
                  onChange={escolherArquivos}
                  className="hidden"
                />
                <p className="text-[11px] text-slate-400 mt-1">Até {MAX_ARQUIVOS} arquivos, {MAX_MB} MB cada.</p>

                {(anexosExistentes.length > 0 || novosArquivos.length > 0) && (
                  <ul className="mt-2 space-y-1.5">
                    {anexosExistentes.map((a) => (
                      <li key={a.path} className="fade-in flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs">
                        <span className="text-slate-500">{iconeAnexo(a.tipo)}</span>
                        <span className="truncate flex-1" title={a.nome}>{a.nome}</span>
                        <span className="text-slate-400 whitespace-nowrap">{formatarTamanho(a.tamanho)}</span>
                        <button
                          type="button"
                          onClick={() => {
                            setAnexosExistentes((prev) => prev.filter((x) => x.path !== a.path));
                            setAnexosRemovidos((prev) => [...prev, a]);
                          }}
                          aria-label={`Remover ${a.nome}`}
                          className="p-1 text-slate-400 hover:text-rose-600"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </li>
                    ))}
                    {novosArquivos.map((f, idx) => (
                      <li key={`${f.name}-${idx}`} className="fade-in flex items-center gap-2 bg-indigo-50/50 border border-indigo-100 rounded-lg px-2.5 py-1.5 text-xs">
                        <span className="text-indigo-500">{iconeAnexo(tipoDoArquivo(f))}</span>
                        <span className="truncate flex-1" title={f.name}>{f.name}</span>
                        <span className="text-slate-400 whitespace-nowrap">{formatarTamanho(f.size)}</span>
                        <button
                          type="button"
                          onClick={() => setNovosArquivos((prev) => prev.filter((_, i) => i !== idx))}
                          aria-label={`Remover ${f.name}`}
                          className="p-1 text-slate-400 hover:text-rose-600"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={fecharModalForm}
                  disabled={enviando}
                  className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg text-sm font-medium"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={enviando}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-semibold shadow-sm disabled:opacity-60"
                >
                  {enviando ? 'Enviando...' : editandoId ? 'Salvar alterações' : 'Enviar Solicitação'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: AVALIAR / APROVAR / RECUSAR (APROVADOR) */}
      {modalAprovacao && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 z-50 fade-in">
          <div className="bg-white rounded-t-2xl sm:rounded-2xl max-w-md w-full p-5 sm:p-6 shadow-xl border border-slate-200 max-h-[92vh] overflow-y-auto sheet-in pb-[calc(1.25rem+env(safe-area-inset-bottom))]">
            <h2 className="text-lg font-bold text-slate-800 mb-2">Avaliar Solicitação #{modalAprovacao.cod_liberacao}</h2>
            <p className="text-xs text-slate-500 mb-4">RCA: {modalAprovacao.rca} | Tipo: {modalAprovacao.tipo_solicitacao}</p>

            {modalAprovacao.observacoes && (
              <div className="bg-slate-50 p-3 rounded-lg text-xs text-slate-700 border border-slate-200 mb-4">
                <strong>Obs. do Solicitante:</strong> {modalAprovacao.observacoes}
              </div>
            )}

            {(modalAprovacao.anexos || []).length > 0 && (
              <button
                type="button"
                onClick={() => setAnexosAbertoId(modalAprovacao.id)}
                className="w-full mb-4 inline-flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-sm font-semibold bg-indigo-50 text-indigo-700 hover:bg-indigo-100 transition"
              >
                <Paperclip className="w-4 h-4" /> Ver anexos ({modalAprovacao.anexos.length})
              </button>
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

      {/* MODAL: CONFIRMAR EXCLUSÃO */}
      {modalExcluir && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 z-50 fade-in">
          <div className="bg-white rounded-t-2xl sm:rounded-2xl max-w-sm w-full p-5 sm:p-6 shadow-xl border border-slate-200 max-h-[92vh] overflow-y-auto sheet-in pb-[calc(1.25rem+env(safe-area-inset-bottom))]">
            <h2 className="text-lg font-bold text-slate-800 mb-2 flex items-center gap-2">
              <Trash2 className="w-5 h-5 text-rose-600" /> Excluir solicitação?
            </h2>
            <p className="text-sm text-slate-600">
              A solicitação <strong>#{modalExcluir.cod_liberacao}</strong> (RCA {modalExcluir.rca} — {modalExcluir.tipo_solicitacao}) será removida
              permanentemente. Essa ação não pode ser desfeita.
            </p>
            <div className="flex justify-end gap-2 pt-5">
              <button
                onClick={() => setModalExcluir(null)}
                disabled={excluindo}
                className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg text-sm font-medium disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleExcluir}
                disabled={excluindo}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-sm font-semibold shadow-sm disabled:opacity-50"
              >
                {excluindo ? 'Excluindo...' : 'Excluir'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
