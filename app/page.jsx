'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import toast from 'react-hot-toast';
import confetti from 'canvas-confetti';
import {
  Clock, CheckCircle2, XCircle, AlertCircle, Plus, Search,
  Download, RefreshCw, UserCheck, Send, MessageSquare, Shield, User,
  Pencil, Trash2, X, CalendarDays,
  Paperclip, FileText, Music, Image as ImageIcon, ExternalLink, Mic, Square, Eye
} from 'lucide-react';

const TIPOS_SOLICITACAO = [
  'Liberar Recebidos comprovantes',
  'Aumento de limite',
  'Alteração de prazo',
  'Antecipação de boleto',
  'Retirar taxa de boleto'
];

// Cor de cada tipo de solicitação (legenda + identificação nas linhas)
// Evita verde/vermelho/âmbar, que já indicam o status.
const TIPO_CORES = {
  'Liberar Recebidos comprovantes': { dot: 'bg-sky-500',     pill: 'bg-sky-100 text-sky-800 ring-sky-200',             borda: 'border-l-sky-500' },
  'Aumento de limite':              { dot: 'bg-violet-500',  pill: 'bg-violet-100 text-violet-800 ring-violet-200',    borda: 'border-l-violet-500' },
  'Alteração de prazo':             { dot: 'bg-fuchsia-500', pill: 'bg-fuchsia-100 text-fuchsia-800 ring-fuchsia-200', borda: 'border-l-fuchsia-500' },
  'Antecipação de boleto':          { dot: 'bg-orange-500',  pill: 'bg-orange-100 text-orange-800 ring-orange-200',    borda: 'border-l-orange-500' },
  'Retirar taxa de boleto':         { dot: 'bg-teal-500',    pill: 'bg-teal-100 text-teal-800 ring-teal-200',          borda: 'border-l-teal-500' }
};
const COR_PADRAO = { dot: 'bg-slate-400', pill: 'bg-slate-100 text-slate-700 ring-slate-200', borda: 'border-l-slate-400' };
const corDoTipo = (t) => TIPO_CORES[t] || COR_PADRAO;

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
const CODIGO_DIGITOS = 6; // código do cliente: exatamente 6 dígitos

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

const MAX_SEGUNDOS_GRAVACAO = 300; // 5 minutos

const formatarTempo = (seg) =>
  `${Math.floor(seg / 60)}:${String(seg % 60).padStart(2, '0')}`;

const formVazio = () => ({
  cod_liberacao: '',
  nome_cliente: '',
  rca: '',
  tipo_solicitacao: TIPOS_SOLICITACAO[0],
  observacoes: ''
});

const TONS = {
  indigo: { icone: 'bg-indigo-50 text-indigo-600', botao: 'bg-indigo-600 hover:bg-indigo-700' },
  emerald: { icone: 'bg-emerald-50 text-emerald-600', botao: 'bg-emerald-600 hover:bg-emerald-700' },
  rose: { icone: 'bg-rose-50 text-rose-600', botao: 'bg-rose-600 hover:bg-rose-700' }
};

// Pop-up de confirmação com fade (entra e sai suavemente)
function ConfirmarModal({ cfg, onClose }) {
  const [saindo, setSaindo] = useState(false);
  const feito = useRef(false);
  const tom = TONS[cfg.tom] || TONS.indigo;

  const fechar = (confirmou) => {
    if (feito.current) return;
    feito.current = true;
    setSaindo(true);
    setTimeout(() => {
      onClose();
      if (confirmou) cfg.onConfirm();
    }, 200);
  };

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') fechar(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div
      role="dialog"
      aria-modal="true"
      className={`fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 z-[80] ${saindo ? 'fade-out' : 'fade-in'}`}
      onClick={() => fechar(false)}
    >
      <div
        className={`bg-white rounded-t-2xl sm:rounded-2xl max-w-sm w-full p-5 sm:p-6 shadow-xl border border-slate-200 max-h-[92vh] overflow-y-auto pb-[calc(1.25rem+env(safe-area-inset-bottom))] ${saindo ? 'sheet-out' : 'sheet-in'}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          <span className={`p-2.5 rounded-xl shrink-0 ${tom.icone}`}>{cfg.icone}</span>
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-slate-800">{cfg.titulo}</h2>
            {cfg.mensagem && <p className="text-sm text-slate-600 mt-1">{cfg.mensagem}</p>}
          </div>
        </div>

        {cfg.detalhes?.length > 0 && (
          <dl className="mt-4 bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-1.5 text-sm">
            {cfg.detalhes.map(([rotulo, valor]) => (
              <div key={rotulo} className="flex justify-between gap-3">
                <dt className="text-slate-500 shrink-0">{rotulo}</dt>
                <dd className="font-semibold text-slate-800 text-right break-words min-w-0">{valor || '-'}</dd>
              </div>
            ))}
          </dl>
        )}

        <div className="grid grid-cols-2 gap-3 pt-5">
          <button
            type="button"
            onClick={() => fechar(false)}
            className="px-4 py-2.5 text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl text-sm font-semibold transition"
          >
            Voltar
          </button>
          <button
            type="button"
            autoFocus
            onClick={() => fechar(true)}
            className={`px-4 py-2.5 text-white rounded-xl text-sm font-semibold shadow-sm transition ${tom.botao}`}
          >
            {cfg.textoConfirmar || 'Confirmar'}
          </button>
        </div>
      </div>
    </div>
  );
}

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
  const [modalDetalhe, setModalDetalhe] = useState(null);       // visualização (solicitante)
  const [dataInicio, setDataInicio] = useState('');
  const [dataFim, setDataFim] = useState('');
  const [editandoId, setEditandoId] = useState(null);
  const [confirmacao, setConfirmacao] = useState(null);      // pop-up de confirmação
  const [nomeStatus, setNomeStatus] = useState('idle');        // idle | buscando | encontrado | nao_encontrado | erro
  const nomeAutoRef = useRef(false);                           // nome veio da lista (preenchido sozinho)
  const [enviando, setEnviando] = useState(false);
  const [anexosExistentes, setAnexosExistentes] = useState([]); // já salvos (edição)
  const [anexosRemovidos, setAnexosRemovidos] = useState([]);   // marcados para remover ao salvar
  const [novosArquivos, setNovosArquivos] = useState([]);       // escolhidos agora (File[])
  const [anexosAbertoId, setAnexosAbertoId] = useState(null);   // janela de visualização
  const [urlsAnexos, setUrlsAnexos] = useState({});
  const [preview, setPreview] = useState(null);                // {url, nome, tipo, local}
  const [gravando, setGravando] = useState(false);
  const [segundos, setSegundos] = useState(0);
  const gravadorRef = useRef(null);
  const chunksRef = useRef([]);
  const streamRef = useRef(null);
  const timerRef = useRef(null);
  const descartarRef = useRef(false);

  const [form, setForm] = useState(formVazio());

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

  // Preenche o nome do cliente sozinho quando o código chega a 6 dígitos
  useEffect(() => {
    if (!modalAberto) return;
    const cod = form.cod_liberacao;

    if (cod.length !== CODIGO_DIGITOS) {
      if (nomeAutoRef.current) {
        nomeAutoRef.current = false;
        setForm((f) => ({ ...f, nome_cliente: '' }));
      }
      setNomeStatus('idle');
      return;
    }

    let cancelado = false;
    setNomeStatus('buscando');
    supabase
      .from('clientes')
      .select('nome')
      .eq('codigo', cod)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelado) return;
        if (error) {
          setNomeStatus('erro');
          return;
        }
        if (data?.nome) {
          nomeAutoRef.current = true;
          setForm((f) => ({ ...f, nome_cliente: data.nome.trim() }));
          setNomeStatus('encontrado');
        } else {
          if (nomeAutoRef.current) {
            nomeAutoRef.current = false;
            setForm((f) => ({ ...f, nome_cliente: '' }));
          }
          setNomeStatus('nao_encontrado');
        }
      });
    return () => { cancelado = true; };
  }, [modalAberto, form.cod_liberacao]);

  const pedirConfirmacao = (cfg) => setConfirmacao(cfg);

  // Abrir modal para uma nova solicitação
  const abrirNova = () => {
    setEditandoId(null);
    nomeAutoRef.current = false;
    setNomeStatus('idle');
    setForm(formVazio());
    limparAnexosForm();
    setModalAberto(true);
  };

  // Abrir modal para editar uma solicitação existente
  const abrirEdicao = (item) => {
    setEditandoId(item.id);
    nomeAutoRef.current = false;
    setNomeStatus('idle');
    setForm({
      cod_liberacao: item.cod_liberacao || '',
      nome_cliente: item.nome_cliente || '',
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
    cancelarGravacao();
    setModalAberto(false);
    setEditandoId(null);
    setForm(formVazio());
    limparAnexosForm();
  };

  // ===== Visualização do anexo (tela cheia, com botão Fechar) =====
  const fecharPreview = () => {
    setPreview((atual) => {
      if (atual?.local) URL.revokeObjectURL(atual.url);
      return null;
    });
  };

  // Anexo já salvo no Storage
  const abrirPreviewSalvo = async (a) => {
    const toastId = toast.loading('Abrindo...');
    try {
      const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(a.path, 600);
      if (error || !data?.signedUrl) throw error || new Error('sem link');
      if (a.tipo === 'application/pdf') {
        // baixa como blob para o navegador conseguir exibir o PDF dentro da página
        const resp = await fetch(data.signedUrl);
        const blob = await resp.blob();
        const url = URL.createObjectURL(new Blob([blob], { type: 'application/pdf' }));
        setPreview({ url, nome: a.nome, tipo: a.tipo, local: true });
      } else {
        setPreview({ url: data.signedUrl, nome: a.nome, tipo: a.tipo, local: false });
      }
      toast.dismiss(toastId);
    } catch (e) {
      toast.error('Não foi possível abrir o arquivo.', { id: toastId });
    }
  };

  // Arquivo escolhido agora (ainda não enviado)
  const abrirPreviewLocal = (f) => {
    const tipo = tipoDoArquivo(f);
    const url = URL.createObjectURL(new Blob([f], { type: tipo }));
    setPreview({ url, nome: f.name, tipo, local: true });
  };

  // Esc fecha a visualização
  useEffect(() => {
    if (!preview) return;
    const onKey = (e) => { if (e.key === 'Escape') fecharPreview(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [preview]);

  // Esc fecha a solicitação aberta (só se não houver outra janela por cima)
  useEffect(() => {
    if (!modalAprovacao && !modalDetalhe) return;
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      if (preview || confirmacao || anexosAbertoId) return; // essas janelas tratam o próprio Esc
      setModalAprovacao(null);
      setModalDetalhe(null);
      setMotivoRecusaInput('');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [modalAprovacao, modalDetalhe, preview, confirmacao, anexosAbertoId]);

  // ===== Gravação de áudio =====
  const pararTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const liberarMicrofone = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  };

  const iniciarGravacao = async () => {
    if (gravando) return;
    if (anexosExistentes.length + novosArquivos.length >= MAX_ARQUIVOS) {
      toast.error(`Máximo de ${MAX_ARQUIVOS} anexos por solicitação.`);
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      toast.error('Este navegador não permite gravar áudio (use HTTPS e um navegador atualizado).');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const preferidos = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];
      const mime = preferidos.find((m) => MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(m)) || '';
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);

      chunksRef.current = [];
      descartarRef.current = false;
      rec.ondataavailable = (ev) => {
        if (ev.data && ev.data.size) chunksRef.current.push(ev.data);
      };
      rec.onstop = () => {
        liberarMicrofone();
        if (descartarRef.current) {
          descartarRef.current = false;
          return;
        }
        const tipo = (rec.mimeType || mime || 'audio/webm').split(';')[0];
        const blob = new Blob(chunksRef.current, { type: tipo });
        if (!blob.size) {
          toast.error('Nenhum áudio foi gravado.');
          return;
        }
        if (blob.size > MAX_BYTES) {
          toast.error(`O áudio passa de ${MAX_MB} MB.`);
          return;
        }
        const ext = tipo.includes('mp4') ? 'm4a' : tipo.includes('ogg') ? 'ogg' : 'webm';
        const d = new Date();
        const hh = String(d.getHours()).padStart(2, '0');
        const mm = String(d.getMinutes()).padStart(2, '0');
        const ss = String(d.getSeconds()).padStart(2, '0');
        const file = new File([blob], `audio-${hh}${mm}${ss}.${ext}`, { type: tipo });
        setNovosArquivos((prev) => [...prev, file]);
        toast.success('Áudio gravado e adicionado aos anexos.');
      };

      gravadorRef.current = rec;
      rec.start();
      setSegundos(0);
      setGravando(true);
      timerRef.current = setInterval(() => {
        setSegundos((s) => {
          if (s + 1 >= MAX_SEGUNDOS_GRAVACAO) pararGravacao();
          return s + 1;
        });
      }, 1000);
    } catch (err) {
      liberarMicrofone();
      toast.error(
        err?.name === 'NotAllowedError'
          ? 'Permita o uso do microfone para gravar.'
          : 'Não foi possível acessar o microfone.'
      );
    }
  };

  const pararGravacao = () => {
    const rec = gravadorRef.current;
    if (rec && rec.state !== 'inactive') rec.stop();
    pararTimer();
    setGravando(false);
    setSegundos(0);
  };

  const cancelarGravacao = () => {
    const rec = gravadorRef.current;
    if (rec && rec.state !== 'inactive') {
      descartarRef.current = true;
      rec.stop();
    } else {
      liberarMicrofone();
    }
    pararTimer();
    setGravando(false);
    setSegundos(0);
  };

  // Ao sair da página, solta o microfone
  useEffect(() => () => {
    descartarRef.current = true;
    const rec = gravadorRef.current;
    if (rec && rec.state !== 'inactive') rec.stop();
    pararTimer();
    liberarMicrofone();
  }, []);

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

  // Valida o formulário e pede confirmação antes de enviar/salvar
  const handleSubmit = (e) => {
    e.preventDefault();
    if (enviando) return;
    if (gravando) {
      toast.error('Pare a gravação antes de enviar.');
      return;
    }
    const cod = form.cod_liberacao.trim();
    const rca = form.rca.trim();
    const nome = form.nome_cliente.trim();
    if (!/^\d{6}$/.test(cod)) {
      toast.error(`O código do cliente deve ter exatamente ${CODIGO_DIGITOS} dígitos.`);
      return;
    }
    if (!nome) {
      toast.error('Informe o nome do cliente.');
      return;
    }
    if (!rca) {
      toast.error('Preencha os campos obrigatórios!');
      return;
    }

    const qtdAnexos = anexosExistentes.length + novosArquivos.length;
    pedirConfirmacao({
      titulo: editandoId ? 'Salvar alterações?' : 'Enviar solicitação?',
      mensagem: editandoId
        ? 'Os dados atuais desta solicitação serão substituídos.'
        : 'A solicitação será enviada ao aprovador.',
      icone: editandoId ? <Pencil className="w-5 h-5" /> : <Send className="w-5 h-5" />,
      tom: 'indigo',
      textoConfirmar: editandoId ? 'Salvar' : 'Enviar',
      detalhes: [
        ['Cód. cliente', cod],
        ['Cliente', nome],
        ['RCA', rca],
        ['Tipo', form.tipo_solicitacao],
        ['Anexos', String(qtdAnexos)]
      ],
      onConfirm: () => enviarSolicitacao(cod, rca, nome)
    });
  };

  // Criar ou salvar edição (com anexos)
  const enviarSolicitacao = async (cod, rca, nome) => {
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
          nome_cliente: nome,
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
        nome_cliente: nome,
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
  const pedirExcluir = (item) =>
    pedirConfirmacao({
      titulo: 'Excluir solicitação?',
      mensagem: 'Ela será removida permanentemente. Essa ação não pode ser desfeita.',
      icone: <Trash2 className="w-5 h-5" />,
      tom: 'rose',
      textoConfirmar: 'Excluir',
      detalhes: [
        ['Cód. cliente', item.cod_liberacao],
        ['Cliente', item.nome_cliente],
        ['RCA', item.rca],
        ['Tipo', item.tipo_solicitacao]
      ],
      onConfirm: () => handleExcluir(item)
    });

  const handleExcluir = async (item) => {
    const toastId = toast.loading('Excluindo solicitação...');
    const { data, error } = await supabase
      .from('solicitacoes')
      .delete()
      .eq('id', item.id)
      .select();

    if (error) {
      toast.error('Erro ao excluir: ' + error.message, { id: toastId });
    } else if (!data || data.length === 0) {
      toast.error('Não foi possível excluir. Verifique a permissão de DELETE (RLS) da tabela.', { id: toastId });
    } else {
      await removerArquivos((item.anexos || []).map((a) => a.path));
      setSolicitacoes((prev) => prev.filter((x) => x.id !== item.id));
      toast.success('Solicitação excluída.', { id: toastId });
    }
  };

  // Processar Aprovação/Recusa
  const handleAprovarRecusar = (statusAprovado) => {
    if (!modalAprovacao) return;

    if (!statusAprovado && !motivoRecusaInput.trim()) {
      toast.error('Informe o motivo da recusa!');
      return;
    }

    pedirConfirmacao({
      titulo: statusAprovado ? 'Aprovar solicitação?' : 'Recusar solicitação?',
      mensagem: statusAprovado
        ? 'O solicitante receberá a resposta SIM.'
        : 'O solicitante receberá a resposta NÃO com o motivo informado.',
      icone: statusAprovado ? <CheckCircle2 className="w-5 h-5" /> : <XCircle className="w-5 h-5" />,
      tom: statusAprovado ? 'emerald' : 'rose',
      textoConfirmar: statusAprovado ? 'Aprovar (SIM)' : 'Recusar (NÃO)',
      detalhes: [
        ['Cód. cliente', modalAprovacao.cod_liberacao],
        ['Cliente', modalAprovacao.nome_cliente],
        ['RCA', modalAprovacao.rca],
        ...(statusAprovado ? [] : [['Motivo', motivoRecusaInput.trim()]])
      ],
      onConfirm: () => executarAprovacao(statusAprovado)
    });
  };

  const executarAprovacao = async (statusAprovado) => {
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

  // Data compacta para a tabela: 27/10/26 10:20
  const formatDataCurta = (dateStr) => {
    if (!dateStr) return '-';
    const d = new Date(dateStr);
    if (isNaN(d)) return '-';
    return d.toLocaleString('pt-BR', {
      day: '2-digit', month: '2-digit', year: '2-digit',
      hour: '2-digit', minute: '2-digit'
    }).replace(',', '');
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
    const headers = ['Cód. Cliente', 'Cliente', 'RCA', 'Tipo de Solicitação', 'Aprovado (SIM/NÃO)', 'Observações', 'Motivo Recusa', 'Data Enviada', 'Data Finalizada', 'Tempo Conclusão', 'Qtd. Anexos'];
    const rows = solicitacoesFiltradas.map(s => [
      s.cod_liberacao,
      `"${(s.nome_cliente || '').replace(/"/g, '""')}"`,
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
          item.nome_cliente,
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
              onClick={() => pedirExcluir(item)}
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

  // Clicar na solicitação abre ela direto (ignora cliques em botões da própria linha)
  const abrirItem = (item, e) => {
    if (e?.target?.closest?.('button, a, input, select, textarea')) return;
    if (perfil === 'APROVADOR') setModalAprovacao(item);
    else if (podeAlterar(item)) abrirEdicao(item);
    else setModalDetalhe(item);
  };

  const pilulaTipo = (tipo, extra = '') => (
    <span className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-semibold leading-tight ring-1 ring-inset ${corDoTipo(tipo).pill} ${extra}`}>
      <span className={`w-2 h-2 rounded-full shrink-0 ${corDoTipo(tipo).dot}`} />
      <span className="min-w-0">{tipo}</span>
    </span>
  );

  return (
    <div className="min-h-screen bg-slate-100 p-3 sm:p-6 pb-24 md:pb-6 overflow-x-hidden">
      <div className="max-w-[1800px] mx-auto space-y-4 sm:space-y-5">
        
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
                placeholder="Buscar por cliente, cód., RCA, tipo, observação..."
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

            <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
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

            <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
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
            {/* LEGENDA DE CORES POR TIPO */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-3 sm:px-4 py-2.5 border-b border-slate-200 bg-white text-xs">
              <span className="font-semibold text-slate-500 uppercase tracking-wider text-[11px]">Legenda:</span>
              {TIPOS_SOLICITACAO.map((t) => (
                <span key={t} className="inline-flex items-center gap-1.5 text-slate-700">
                  <span className={`w-3 h-3 rounded-full ${corDoTipo(t).dot}`} />
                  {t}
                </span>
              ))}
            </div>

            <div className="hidden xl:block">
              <table className="w-full table-fixed text-left border-collapse text-xs">
                <colgroup>
                  <col style={{ width: '6%' }} />
                  <col style={{ width: '11%' }} />
                  <col style={{ width: '5%' }} />
                  <col style={{ width: '14%' }} />
                  <col style={{ width: '8%' }} />
                  <col style={{ width: '12%' }} />
                  <col style={{ width: '9%' }} />
                  <col style={{ width: '8%' }} />
                  <col style={{ width: '8%' }} />
                  <col style={{ width: '6%' }} />
                  <col style={{ width: '4%' }} />
                  <col style={{ width: '9%' }} />
                </colgroup>
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold uppercase text-[11px] leading-tight">
                    <th className="px-2 py-2.5">Cód.</th>
                    <th className="px-2 py-2.5">Cliente</th>
                    <th className="px-2 py-2.5">RCA</th>
                    <th className="px-2 py-2.5">Tipo</th>
                    <th className="px-2 py-2.5 text-center">Status</th>
                    <th className="px-2 py-2.5">Observações</th>
                    <th className="px-2 py-2.5">Motivo recusa</th>
                    <th className="px-2 py-2.5">Enviada</th>
                    <th className="px-2 py-2.5">Finalizada</th>
                    <th className="px-2 py-2.5 text-center">Tempo</th>
                    <th className="px-2 py-2.5 text-center">Anexos</th>
                    <th className="px-2 py-2.5 text-center">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {solicitacoesFiltradas.map((item, idx) => (
                    <tr
                      key={item.id}
                      onClick={(e) => abrirItem(item, e)}
                      className="fade-in cursor-pointer hover:bg-indigo-50/40 transition"
                      style={{ animationDelay: `${Math.min(idx, 12) * 30}ms` }}
                    >
                      <td className={`px-2 py-2.5 font-semibold text-slate-800 truncate border-l-4 ${corDoTipo(item.tipo_solicitacao).borda}`}>{item.cod_liberacao}</td>
                      <td className="px-2 py-2.5 font-medium text-slate-700 truncate" title={item.nome_cliente}>{item.nome_cliente || <span className="text-slate-300">-</span>}</td>
                      <td className="px-2 py-2.5 font-medium text-slate-600 truncate">{item.rca}</td>
                      <td className="px-2 py-2.5">{pilulaTipo(item.tipo_solicitacao)}</td>
                      <td className="px-2 py-2.5 text-center">{badge(item)}</td>
                      <td className="px-2 py-2.5 truncate text-slate-600" title={item.observacoes}>
                        {item.observacoes || '-'}
                      </td>
                      <td className="px-2 py-2.5 truncate text-rose-600 font-medium" title={item.motivo_recusa}>
                        {item.motivo_recusa || '-'}
                      </td>
                      <td className="px-2 py-2.5 text-slate-500 whitespace-nowrap">{formatDataCurta(item.data_enviada)}</td>
                      <td className="px-2 py-2.5 text-slate-500 whitespace-nowrap">{formatDataCurta(item.data_finalizada)}</td>
                      <td className="px-2 py-2.5 text-center font-mono text-[11px] font-semibold text-slate-700">
                        {calcularTempoConclusao(item.data_enviada, item.data_finalizada)}
                      </td>
                      <td className="px-2 py-2.5 text-center">{chipAnexos(item)}</td>
                      <td className="px-2 py-2.5">
                        <div className="flex items-center justify-center gap-1 flex-wrap">{acoesItem(item)}</div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* LISTA EM CARTÕES (CELULAR E TABLET) — sem rolagem lateral */}
            <div className="xl:hidden grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 p-3">
              {solicitacoesFiltradas.map((item, idx) => (
                <div
                  key={item.id}
                  onClick={(e) => abrirItem(item, e)}
                  className={`fade-in min-w-0 flex flex-col gap-3 bg-white border border-slate-200 border-l-4 ${corDoTipo(item.tipo_solicitacao).borda} rounded-2xl p-4 shadow-sm cursor-pointer`}
                  style={{ animationDelay: `${Math.min(idx, 10) * 30}ms` }}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className={`font-bold break-words ${item.nome_cliente ? 'text-slate-800' : 'text-slate-400 italic font-medium'}`}>
                        {item.nome_cliente || 'Cliente não informado'}
                      </p>
                      <p className="text-xs text-slate-500 mt-0.5">Cód. {item.cod_liberacao} · RCA {item.rca}</p>
                    </div>
                    {badge(item)}
                  </div>

                  <div>{pilulaTipo(item.tipo_solicitacao, 'text-xs')}</div>

                  {item.observacoes && (
                    <p className="text-xs text-slate-600 bg-slate-50 rounded-lg p-2.5 break-words">{item.observacoes}</p>
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

                  <div className="mt-auto flex flex-wrap items-center justify-end gap-2 pt-3 border-t border-slate-100">
                    {acoesItem(item, true)}
                  </div>
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
                        <button
                          type="button"
                          onClick={() => abrirPreviewSalvo(a)}
                          className="w-full flex items-center gap-2 text-sm text-left rounded-lg hover:bg-slate-50 -m-1 p-1 transition"
                          title="Clique para visualizar"
                        >
                          <span className="text-indigo-600">{iconeAnexo(a.tipo, 'w-5 h-5')}</span>
                          <span className="truncate flex-1 font-medium text-slate-800">{a.nome}</span>
                          <span className="text-xs text-slate-400 whitespace-nowrap">{formatarTamanho(a.tamanho)}</span>
                        </button>

                        {url && a.tipo?.startsWith('image/') && (
                          <img
                            src={url}
                            alt={a.nome}
                            onClick={() => abrirPreviewSalvo(a)}
                            className="w-full max-h-72 object-contain rounded-lg bg-slate-50 cursor-zoom-in"
                          />
                        )}
                        {url && a.tipo?.startsWith('audio/') && <audio controls src={url} className="w-full" />}

                        <div className="flex gap-2">
                          <button
                            onClick={() => abrirPreviewSalvo(a)}
                            className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg text-xs font-semibold bg-slate-100 text-slate-700 hover:bg-slate-200 transition"
                          >
                            <Eye className="w-4 h-4" /> Visualizar
                          </button>
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

      {/* VISUALIZAÇÃO DO ANEXO (TELA CHEIA) */}
      {preview && (
        <div className="fixed inset-0 z-[90] bg-slate-900/90 backdrop-blur-sm flex flex-col fade-in">
          <div className="flex items-center justify-between gap-3 px-4 pt-[calc(0.75rem+env(safe-area-inset-top))] pb-3 text-white">
            <span className="truncate text-sm font-medium" title={preview.nome}>{preview.nome}</span>
            <button
              onClick={fecharPreview}
              aria-label="Fechar visualização"
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white/15 hover:bg-white/25 text-sm font-semibold transition shrink-0"
            >
              <X className="w-4 h-4" /> Fechar
            </button>
          </div>
          <div
            className="flex-1 min-h-0 flex items-center justify-center px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]"
            onClick={(e) => { if (e.target === e.currentTarget) fecharPreview(); }}
          >
            {preview.tipo?.startsWith('image/') && (
              <img src={preview.url} alt={preview.nome} className="max-w-full max-h-full object-contain rounded-lg" />
            )}
            {preview.tipo?.startsWith('audio/') && (
              <div className="w-full max-w-md bg-white rounded-2xl p-5 flex flex-col items-center gap-3">
                <Music className="w-8 h-8 text-indigo-600" />
                <audio controls autoPlay src={preview.url} className="w-full" />
              </div>
            )}
            {preview.tipo === 'application/pdf' && (
              <iframe src={preview.url} title={preview.nome} className="w-full h-full rounded-lg bg-white" />
            )}
          </div>
        </div>
      )}

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
                <div className="flex items-center justify-between mb-1">
                  <label htmlFor="cod-cliente" className="block text-xs font-semibold text-slate-600">Código do cliente (6 dígitos) *</label>
                  <span className={`text-[11px] tabular-nums ${form.cod_liberacao.length === CODIGO_DIGITOS ? 'text-emerald-600' : 'text-slate-400'}`}>
                    {form.cod_liberacao.length}/{CODIGO_DIGITOS}
                  </span>
                </div>
                <input
                  id="cod-cliente"
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  required
                  maxLength={CODIGO_DIGITOS}
                  pattern={`[0-9]{${CODIGO_DIGITOS}}`}
                  title={`O código do cliente deve ter ${CODIGO_DIGITOS} dígitos`}
                  placeholder="Ex: 541532"
                  value={form.cod_liberacao}
                  onChange={(e) =>
                    setForm({ ...form, cod_liberacao: e.target.value.replace(/\D/g, '').slice(0, CODIGO_DIGITOS) })
                  }
                  className={`w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:outline-none ${
                    form.cod_liberacao.length > 0 && form.cod_liberacao.length < CODIGO_DIGITOS
                      ? 'border-amber-400 focus:ring-amber-400'
                      : 'border-slate-300 focus:ring-indigo-500'
                  }`}
                />
                {form.cod_liberacao.length > 0 && form.cod_liberacao.length < CODIGO_DIGITOS && (
                  <p className="fade-in text-[11px] text-amber-600 mt-1">
                    Faltam {CODIGO_DIGITOS - form.cod_liberacao.length} dígito(s).
                  </p>
                )}
              </div>

              <div>
                <label htmlFor="nome-cliente" className="block text-xs font-semibold text-slate-600 mb-1">Nome do cliente *</label>
                <input
                  id="nome-cliente"
                  type="text"
                  required
                  autoComplete="off"
                  placeholder={nomeStatus === 'buscando' ? 'Buscando...' : 'Preenchido ao digitar o código'}
                  value={form.nome_cliente}
                  onChange={(e) => {
                    nomeAutoRef.current = false;
                    setForm({ ...form, nome_cliente: e.target.value });
                  }}
                  className={`w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:outline-none transition-colors ${
                    nomeStatus === 'encontrado'
                      ? 'border-emerald-300 bg-emerald-50/50 focus:ring-emerald-500'
                      : 'border-slate-300 focus:ring-indigo-500'
                  }`}
                />
                {nomeStatus === 'encontrado' && (
                  <p className="fade-in text-[11px] text-emerald-600 mt-1">Cliente encontrado na lista.</p>
                )}
                {nomeStatus === 'nao_encontrado' && (
                  <p className="fade-in text-[11px] text-amber-600 mt-1">Código não encontrado na lista. Digite o nome do cliente.</p>
                )}
                {nomeStatus === 'erro' && (
                  <p className="fade-in text-[11px] text-amber-600 mt-1">Não foi possível consultar a lista. Digite o nome do cliente.</p>
                )}
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
                {gravando ? (
                  <div className="flex items-center gap-2 border-2 border-rose-300 bg-rose-50 rounded-lg px-3 py-2.5 text-sm">
                    <span className="w-2.5 h-2.5 rounded-full bg-rose-600 animate-pulse" />
                    <span className="font-semibold text-rose-700 tabular-nums">Gravando {formatarTempo(segundos)}</span>
                    <span className="flex-1" />
                    <button
                      type="button"
                      onClick={cancelarGravacao}
                      className="px-2.5 py-1.5 rounded-lg text-xs font-semibold text-slate-600 hover:bg-white"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      onClick={pararGravacao}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-rose-600 hover:bg-rose-700 text-white"
                    >
                      <Square className="w-3.5 h-3.5" /> Parar
                    </button>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <label
                      htmlFor="anexo-input"
                      className="flex-1 flex items-center justify-center gap-2 border-2 border-dashed border-slate-300 hover:border-indigo-400 hover:bg-indigo-50/40 text-slate-600 rounded-lg px-3 py-3 text-sm cursor-pointer transition"
                    >
                      <Paperclip className="w-4 h-4" /> Anexar arquivos
                    </label>
                    <button
                      type="button"
                      onClick={iniciarGravacao}
                      className="inline-flex items-center justify-center gap-2 border-2 border-dashed border-slate-300 hover:border-rose-400 hover:bg-rose-50/40 text-slate-600 rounded-lg px-3 py-3 text-sm transition"
                    >
                      <Mic className="w-4 h-4" /> Gravar áudio
                    </button>
                  </div>
                )}
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
                        <button
                          type="button"
                          onClick={() => abrirPreviewSalvo(a)}
                          className="truncate flex-1 text-left hover:text-indigo-700 hover:underline"
                          title="Clique para visualizar"
                        >
                          {a.nome}
                        </button>
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
                        <button
                          type="button"
                          onClick={() => abrirPreviewLocal(f)}
                          className="truncate flex-1 text-left hover:text-indigo-700 hover:underline"
                          title="Clique para visualizar"
                        >
                          {f.name}
                        </button>
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
        <div
          className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 z-50 fade-in"
          onClick={() => { setModalAprovacao(null); setMotivoRecusaInput(''); }}
        >
          <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-t-2xl sm:rounded-2xl max-w-md w-full p-5 sm:p-6 shadow-xl border border-slate-200 max-h-[92vh] overflow-y-auto sheet-in pb-[calc(1.25rem+env(safe-area-inset-bottom))]">
            <h2 className="text-lg font-bold text-slate-800 mb-1">Avaliar Solicitação #{modalAprovacao.cod_liberacao}</h2>
            {modalAprovacao.nome_cliente && (
              <p className="text-sm font-semibold text-slate-700 mb-1 break-words">{modalAprovacao.nome_cliente}</p>
            )}
            <p className="text-xs text-slate-500 mb-2">RCA: {modalAprovacao.rca}</p>
            <div className="mb-4">{pilulaTipo(modalAprovacao.tipo_solicitacao)}</div>

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
                  Fechar sem alterar (Esc)
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: DETALHE (SOLICITANTE, SOMENTE LEITURA) */}
      {modalDetalhe && (
        <div
          className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 z-50 fade-in"
          onClick={() => setModalDetalhe(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-t-2xl sm:rounded-2xl max-w-md w-full p-5 sm:p-6 shadow-xl border border-slate-200 max-h-[92vh] overflow-y-auto sheet-in pb-[calc(1.25rem+env(safe-area-inset-bottom))]"
          >
            <h2 className="text-lg font-bold text-slate-800 mb-1">Solicitação #{modalDetalhe.cod_liberacao}</h2>
            {modalDetalhe.nome_cliente && (
              <p className="text-sm font-semibold text-slate-700 mb-1 break-words">{modalDetalhe.nome_cliente}</p>
            )}
            <p className="text-xs text-slate-500 mb-2">RCA: {modalDetalhe.rca}</p>
            <div className="mb-3 flex items-center gap-2 flex-wrap">{pilulaTipo(modalDetalhe.tipo_solicitacao)} {badge(modalDetalhe)}</div>
            {modalDetalhe.observacoes && (
              <div className="bg-slate-50 p-3 rounded-lg text-xs text-slate-700 border border-slate-200 mb-3">
                <strong>Observações:</strong> {modalDetalhe.observacoes}
              </div>
            )}
            {modalDetalhe.motivo_recusa && (
              <div className="bg-rose-50 p-3 rounded-lg text-xs text-rose-700 border border-rose-200 mb-3">
                <strong>Motivo da recusa:</strong> {modalDetalhe.motivo_recusa}
              </div>
            )}
            <div className="text-[11px] text-slate-500 space-y-0.5 mb-4">
              <p>Enviada: {formatDateTime(modalDetalhe.data_enviada)}</p>
              {modalDetalhe.data_finalizada && (
                <p>Finalizada: {formatDateTime(modalDetalhe.data_finalizada)} · Tempo {calcularTempoConclusao(modalDetalhe.data_enviada, modalDetalhe.data_finalizada)}</p>
              )}
            </div>
            {(modalDetalhe.anexos || []).length > 0 && (
              <button
                type="button"
                onClick={() => setAnexosAbertoId(modalDetalhe.id)}
                className="w-full mb-3 inline-flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-sm font-semibold bg-indigo-50 text-indigo-700 hover:bg-indigo-100 transition"
              >
                <Paperclip className="w-4 h-4" /> Ver anexos ({modalDetalhe.anexos.length})
              </button>
            )}
            <button
              type="button"
              onClick={() => setModalDetalhe(null)}
              className="w-full px-4 py-2.5 text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl text-sm font-semibold transition"
            >
              Fechar (Esc)
            </button>
          </div>
        </div>
      )}

      {/* POP-UP DE CONFIRMAÇÃO (com fade) */}
      {confirmacao && <ConfirmarModal cfg={confirmacao} onClose={() => setConfirmacao(null)} />}
    </div>
  );
}
