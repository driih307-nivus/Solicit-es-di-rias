'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { comprimirVideo } from '@/lib/comprimirVideo';
import { listarRcasPortal, notificarRcaPortal, rcasEmCache, mesmoCodigo } from '@/lib/portal';
import toast from 'react-hot-toast';
import confetti from 'canvas-confetti';
import {
  Clock, CheckCircle2, XCircle, AlertCircle, Plus, Search,
  Download, RefreshCw, UserCheck, Send, MessageSquare, Shield, User,
  Pencil, Trash2, X, CalendarDays,
  Paperclip, FileText, Music, Image as ImageIcon, Video, ExternalLink, Mic, Square, Eye, Bell, BellOff, Sun, Moon, RotateCcw, GripVertical, Printer, Timer, TrendingDown, TrendingUp
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
const MAX_ARQUIVOS = 20;
const MAX_MB = 10;
const MAX_BYTES = MAX_MB * 1024 * 1024;
const MAX_VIDEO_MB = 50;                       // depois da compressão
const MAX_VIDEO_BYTES = MAX_VIDEO_MB * 1024 * 1024;
const MAX_VIDEO_ORIGINAL_BYTES = 500 * 1024 * 1024; // vídeo escolhido (antes de comprimir)
const ACEITA_ARQUIVOS = 'image/*,audio/*,video/*,application/pdf,.pdf,.m4a,.opus,.amr,.aac,.heic,.mp4,.mov,.3gp,.webm';

const MIME_POR_EXTENSAO = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', heic: 'image/heic',
  mp3: 'audio/mpeg', m4a: 'audio/mp4', wav: 'audio/wav', ogg: 'audio/ogg', opus: 'audio/ogg',
  aac: 'audio/aac', amr: 'audio/amr', webm: 'audio/webm',
  mp4: 'video/mp4', mov: 'video/quicktime', '3gp': 'video/3gpp', m4v: 'video/x-m4v'
};

// Descobre o tipo do arquivo (alguns celulares enviam o tipo vazio)
const tipoDoArquivo = (file) => {
  if (file.type === 'video/webm' || (file.type && file.type.startsWith('video/'))) return file.type;
  if (file.type) return file.type;
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  return MIME_POR_EXTENSAO[ext] || '';
};

const tipoPermitido = (tipo) =>
  tipo.startsWith('image/') || tipo.startsWith('audio/') || tipo.startsWith('video/') || tipo === 'application/pdf';

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
  tipo.startsWith('video/') ? <Video className={cls} /> :
  <FileText className={cls} />;

const MAX_SEGUNDOS_GRAVACAO = 300; // 5 minutos

const formatarTempo = (seg) =>
  `${Math.floor(seg / 60)}:${String(seg % 60).padStart(2, '0')}`;

// ===== Funcionário solicitante =====
// Lista padrão (usada se a tabela "funcionarios" ainda não existir no Supabase).
// Para incluir alguém novo sem mexer no código: insira o nome na tabela "funcionarios".
const FUNCIONARIOS_PADRAO = [
  'Adriano Valério',
  'Jacqueline Calheiro',
  'Fabrício Roderico',
  'Anne Silva',
  'Jennifer Santos'
];
const CHAVE_SOLICITANTE = 'sl_solicitante';

// Cor do nome de cada solicitante (pelo primeiro nome, sem acento). Quem não estiver aqui fica azul.
// As cores ficam em globals.css (.sol-cor-*), com versão clara para o tema escuro.
const CORES_SOLICITANTE = { adriano: 'azul', jennifer: 'laranja', jenifer: 'laranja', fabricio: 'verde', anne: 'rosa', jacqueline: 'roxo' };
const corSolicitante = (nome) => {
  const primeiro = String(nome || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().split(/\s+/)[0].toLowerCase();
  return 'sol-cor-' + (CORES_SOLICITANTE[primeiro] || 'azul');
};

const solicitanteSalvo = () => {
  try {
    return localStorage.getItem(CHAVE_SOLICITANTE) || '';
  } catch (e) {
    return '';
  }
};

const lembrarSolicitante = (nome) => {
  try {
    if (nome) localStorage.setItem(CHAVE_SOLICITANTE, nome);
  } catch (e) {}
};

// ===== Colunas da tabela (computador): ordem pode ser reorganizada arrastando o título =====
const COLUNAS_PADRAO = [
  'cod', 'cliente', 'rca', 'tipo', 'status', 'observacoes', 'motivo',
  'enviada', 'finalizada', 'tempo', 'anexos', 'acoes', 'solicitante'
];
const CHAVE_COLUNAS = 'sl_colunas_ordem';

// Garante uma ordem válida (ignora colunas que não existem e acrescenta as novas no fim)
const normalizarOrdem = (lista) => {
  const validas = (Array.isArray(lista) ? lista : []).filter((c, i, arr) => COLUNAS_PADRAO.includes(c) && arr.indexOf(c) === i);
  return [...validas, ...COLUNAS_PADRAO.filter((c) => !validas.includes(c))];
};

const ordemColunasSalva = () => {
  try {
    return normalizarOrdem(JSON.parse(localStorage.getItem(CHAVE_COLUNAS) || 'null'));
  } catch (e) {
    return COLUNAS_PADRAO;
  }
};

const formVazio = () => ({
  solicitante: typeof window !== 'undefined' ? solicitanteSalvo() : '',
  cod_liberacao: '',
  nome_cliente: '',
  rca: '',
  tipo_solicitacao: TIPOS_SOLICITACAO[0],
  observacoes: ''
});

// O caso aparece no período se foi enviado OU reaberto dentro dele
const noPeriodo = (item, ini, fim) => {
  if (!ini && !fim) return true;
  const dentro = (v) => {
    const d = paraDataLocal(v);
    return Boolean(d) && (!ini || d >= ini) && (!fim || d <= fim);
  };
  return dentro(item.data_enviada) || dentro(item.reaberta_em);
};

// Tempo em minutos -> "18 min", "1h 05min", "<1 min"
const fmtMinutos = (ms) => {
  if (ms == null || !isFinite(ms)) return '—';
  const m = Math.round(ms / 60000);
  if (m < 1) return '<1 min';
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${String(m % 60).padStart(2, '0')}min`;
  return `${Math.floor(h / 24)}d ${h % 24}h`;
};

// Ordem da lista: o que foi reaberto sobe para o topo (pela hora da reabertura)
const ultimaMovimentacao = (i) => new Date(i.reaberta_em || i.data_enviada).getTime() || 0;

// Uma atualização é "reabertura" quando um caso respondido volta para PENDENTE
const ehReabertura = (antes, novo) => {
  if (novo.status !== 'PENDENTE') return false;
  if (antes) return antes.status !== 'PENDENTE';
  return Boolean(novo.reaberta_em && Date.now() - new Date(novo.reaberta_em).getTime() < 20000);
};

const TONS = {
  indigo: { icone: 'bg-indigo-50 text-indigo-600', botao: 'bg-indigo-600 hover:bg-indigo-700' },
  emerald: { icone: 'bg-emerald-50 text-emerald-600', botao: 'bg-emerald-600 hover:bg-emerald-700' },
  rose: { icone: 'bg-rose-50 text-rose-600', botao: 'bg-rose-600 hover:bg-rose-700' },
  amber: { icone: 'bg-amber-50 text-amber-600', botao: 'bg-amber-600 hover:bg-amber-700' }
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
  // tempo de resposta: respondidas dos 7 dias anteriores a hoje (comparação) e relógio do "pendente há mais tempo"
  const [respostas7d, setRespostas7d] = useState([]);
  const [agoraTempo, setAgoraTempo] = useState(() => Date.now());
  const [loading, setLoading] = useState(true);
  const perfil = PERFIL; // 'SOLICITANTE' ou 'APROVADOR' (definido pelo link)
  const [pronto, setPronto] = useState(false);
  const [hoje, setHoje] = useState('');
  const [seguindoHoje, setSeguindoHoje] = useState(true);
  const [pendentesAnteriores, setPendentesAnteriores] = useState(0);
  const reqRef = useRef(0);
  const hojeAnteriorRef = useRef('');
  const [filtroStatus, setFiltroStatus] = useState('TODOS');
  const [filtroSolicitante, setFiltroSolicitante] = useState(''); // '' = todos
  const [funcionarios, setFuncionarios] = useState(FUNCIONARIOS_PADRAO);
  const [ordemColunas, setOrdemColunas] = useState(COLUNAS_PADRAO);
  const [colArrastada, setColArrastada] = useState(null);
  const [colAlvo, setColAlvo] = useState(null);

  // Ordem das colunas salva neste aparelho
  useEffect(() => {
    setOrdemColunas(ordemColunasSalva());
  }, []);

  const salvarOrdemColunas = (nova) => {
    setOrdemColunas(nova);
    try {
      localStorage.setItem(CHAVE_COLUNAS, JSON.stringify(nova));
    } catch (e) {}
  };

  const moverColuna = (origem, destino) => {
    if (!origem || !destino || origem === destino) return;
    const nova = ordemColunas.filter((c) => c !== origem);
    const iDestino = ordemColunas.indexOf(destino);
    const iOrigem = ordemColunas.indexOf(origem);
    // arrastando para a direita entra depois do alvo; para a esquerda, antes
    const pos = nova.indexOf(destino) + (iOrigem < iDestino ? 1 : 0);
    nova.splice(pos, 0, origem);
    salvarOrdemColunas(nova);
  };

  const restaurarColunas = () => {
    salvarOrdemColunas(COLUNAS_PADRAO);
    toast.success('Ordem das colunas restaurada.');
  };

  const ordemPersonalizada = ordemColunas.join() !== COLUNAS_PADRAO.join();
  const [busca, setBusca] = useState('');
  const [modalAberto, setModalAberto] = useState(false);
  const [modalAprovacao, setModalAprovacao] = useState(null);
  const [modalDetalhe, setModalDetalhe] = useState(null);       // visualização (solicitante)
  const [dataInicio, setDataInicio] = useState('');
  const [dataFim, setDataFim] = useState('');
  const [editandoId, setEditandoId] = useState(null);
  const [confirmacao, setConfirmacao] = useState(null);      // pop-up de confirmação
  const [selecionados, setSelecionados] = useState(() => new Set()); // ids marcados para excluir em lote
  const [excluindoLote, setExcluindoLote] = useState(false);
  const [rcasPortal, setRcasPortal] = useState([]);              // RCAs cadastrados no Portal do Representante
  const [nomeStatus, setNomeStatus] = useState('idle');        // idle | buscando | encontrado | nao_encontrado | cadastrado | erro
  const [cadastrandoCliente, setCadastrandoCliente] = useState(false);
  const nomeAutoRef = useRef(false);                           // nome veio da lista (preenchido sozinho)
  const [enviando, setEnviando] = useState(false);
  const [anexosExistentes, setAnexosExistentes] = useState([]); // já salvos (edição)
  const [anexosRemovidos, setAnexosRemovidos] = useState([]);   // marcados para remover ao salvar
  const [novosArquivos, setNovosArquivos] = useState([]);       // escolhidos agora (File[])
  const [anexosAbertoId, setAnexosAbertoId] = useState(null);   // janela de visualização
  const [comprimindo, setComprimindo] = useState(0);           // vídeos sendo comprimidos
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

  // Lista atual acessível dentro do tempo real (sem recriar a inscrição)
  const solicitacoesRef = useRef([]);
  solicitacoesRef.current = solicitacoes;
  const periodoRef = useRef({});
  periodoRef.current = { ini: dataInicio, fim: dataFim };

  // ===== Tema claro / escuro =====
  const [tema, setTema] = useState('claro');

  useEffect(() => {
    setTema(document.documentElement.classList.contains('dark') ? 'escuro' : 'claro');
  }, []);

  const alternarTema = () => {
    const escuro = !document.documentElement.classList.contains('dark');
    document.documentElement.classList.toggle('dark', escuro);
    setTema(escuro ? 'escuro' : 'claro');
    try {
      localStorage.setItem('sl_tema', escuro ? 'escuro' : 'claro');
    } catch (e) {}
  };

  // ===== Pré-visualização ao passar o mouse (observação, cliente, motivo) =====
  const previaRef = useRef(null);
  const [previa, setPrevia] = useState(null); // { titulo, texto, x, y }

  const posicionarPrevia = (x, y) => {
    const el = previaRef.current;
    if (!el) return;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    let left = x + 14;
    let top = y + 18;
    if (left + w > window.innerWidth - 8) left = Math.max(8, x - w - 14);
    if (top + h > window.innerHeight - 8) top = Math.max(8, y - h - 14);
    el.style.left = left + 'px';
    el.style.top = top + 'px';
  };
  const entrarPrevia = (e, titulo, texto) => {
    if (!texto) return;
    setPrevia({ titulo, texto, x: e.clientX, y: e.clientY });
  };
  const moverPrevia = (e) => posicionarPrevia(e.clientX, e.clientY); // sem re-renderizar a tela
  const sairPrevia = () => setPrevia(null);

  useEffect(() => {
    if (previa) posicionarPrevia(previa.x, previa.y);
  }, [previa]);

  // ===== Som de notificação (o mesmo beep de sempre) =====
  const audioCtxRef = useRef(null);

  const obterAudioCtx = () => {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    if (!audioCtxRef.current) audioCtxRef.current = new AC();
    return audioCtxRef.current;
  };

  const playNotificationSound = () => {
    try {
      const audioCtx = obterAudioCtx();
      if (!audioCtx) return;
      if (audioCtx.state === 'suspended') audioCtx.resume();
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

  // Libera o áudio no primeiro toque/clique (o navegador exige isso para tocar com a aba em segundo plano)
  useEffect(() => {
    const liberar = () => {
      try {
        const ctx = obterAudioCtx();
        if (ctx && ctx.state === 'suspended') ctx.resume();
      } catch (e) {}
    };
    window.addEventListener('pointerdown', liberar, { once: true });
    window.addEventListener('keydown', liberar, { once: true });
    return () => {
      window.removeEventListener('pointerdown', liberar);
      window.removeEventListener('keydown', liberar);
    };
  }, []);

  // ===== Aviso do sistema (canto da tela, como o WhatsApp Web) =====
  const [avisosPerm, setAvisosPerm] = useState('default'); // default | granted | denied | nao-suportado

  const [bannerAvisosFechado, setBannerAvisosFechado] = useState(false);

  useEffect(() => {
    // No celular o navegador não permite aviso direto da página (só com push): esconde a opção
    const movel = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    if (!('Notification' in window) || movel) {
      setAvisosPerm('nao-suportado');
      return;
    }
    setAvisosPerm(Notification.permission);
    try {
      const adiado = Number(localStorage.getItem('sl_avisos_depois') || 0);
      if (adiado && Date.now() - adiado < 24 * 60 * 60 * 1000) setBannerAvisosFechado(true);
    } catch (e) {}
  }, []);

  const adiarAvisos = () => {
    setBannerAvisosFechado(true);
    try {
      localStorage.setItem('sl_avisos_depois', String(Date.now()));
    } catch (e) {}
  };

  const mostrarAviso = (titulo, corpo, tag) => {
    try {
      if (typeof window === 'undefined' || !('Notification' in window)) return;
      if (Notification.permission !== 'granted') return;
      const n = new Notification(titulo, {
        body: corpo,
        tag, // avisos do mesmo pedido substituem o anterior
        silent: true // o som é o beep do próprio app (evita som duplo)
      });
      n.onclick = () => {
        window.focus();
        n.close();
      };
      setTimeout(() => n.close(), 10000);
    } catch (e) {
      // alguns celulares não permitem aviso direto da página
    }
  };

  const ativarAvisos = async () => {
    if (!('Notification' in window)) return;
    let perm = Notification.permission;
    if (perm === 'default') {
      perm = await Notification.requestPermission();
      setAvisosPerm(perm);
    }
    if (perm === 'granted') {
      playNotificationSound();
      mostrarAviso('Avisos ativados', 'Você será avisado aqui quando chegar uma novidade.', 'teste');
      toast.success('Avisos ativados!');
    } else if (perm === 'denied') {
      toast.error('Avisos bloqueados. Clique no cadeado ao lado do endereço do site e permita as notificações.', { duration: 7000 });
    }
  };

  // Mostra o aviso do sistema quando a janela não está em primeiro plano
  const avisarSistema = (payload) => {
    if (typeof document === 'undefined') return;
    if (!document.hidden && document.hasFocus()) return; // já está olhando para o app
    if (payload.eventType === 'INSERT') {
      const n = payload.new;
      mostrarAviso('Nova solicitação', `${n.solicitante ? n.solicitante + ' • ' : ''}Pedido ${n.cod_liberacao} • RCA ${n.rca} • ${n.tipo_solicitacao}`, `sol-${n.id}`);
    } else if (payload.eventType === 'UPDATE') {
      const n = payload.new;
      const reaberta = ehReabertura(solicitacoesRef.current.find((i) => i.id === n.id), n);
      const rotulo = reaberta
        ? 'Reaberta 🔄 — voltou para análise'
        : n.status === 'SIM' ? 'Aprovada ✅' : n.status === 'NAO' ? 'Recusada ❌' : 'Pendente';
      mostrarAviso(`Solicitação ${n.cod_liberacao}`, reaberta ? rotulo : `Status: ${rotulo}`, `sol-${n.id}`);
    }
  };

  // Carrega os funcionários da tabela "funcionarios" (se não existir, fica a lista padrão)
  useEffect(() => {
    supabase
      .from('funcionarios')
      .select('nome')
      .eq('ativo', true)
      .order('nome')
      .then(({ data, error }) => {
        if (!error && data && data.length) {
          setFuncionarios(data.map((f) => String(f.nome || '').trim()).filter(Boolean));
        }
      });
  }, []);

  // Carregar dados do período selecionado (padrão: apenas o dia de hoje)
  const fetchSolicitacoes = async () => {
    const reqId = ++reqRef.current;
    setLoading(true);
    const ini = dataInicio ? new Date(`${dataInicio}T00:00:00`).toISOString() : null;
    const fim = dataFim ? new Date(`${dataFim}T23:59:59.999`).toISOString() : null;
    const montar = (comReaberta) => {
      let q = supabase
        .from('solicitacoes')
        .select('*')
        .order('data_enviada', { ascending: false })
        .limit(LIMITE_LINHAS);
      if (!comReaberta || (!ini && !fim)) {
        if (ini) q = q.gte('data_enviada', ini);
        if (fim) q = q.lte('data_enviada', fim);
        return q;
      }
      const grupo = (campo) => {
        const c = [ini && `${campo}.gte.${ini}`, fim && `${campo}.lte.${fim}`].filter(Boolean);
        return c.length > 1 ? `and(${c.join(',')})` : c[0];
      };
      return q.or(`${grupo('data_enviada')},${grupo('reaberta_em')}`);
    };
    let resp = await montar(true);
    if (resp.error) resp = await montar(false); // coluna reaberta_em ainda não criada
    const { data, error } = resp;
    if (reqId !== reqRef.current) return; // resposta antiga, ignora

    if (error) {
      toast.error('Erro ao carregar solicitações');
    } else {
      // remove repetidos (por segurança, se o tempo real e a recarga chegarem juntos)
      const vistos = new Set();
      setSolicitacoes((data || []).filter((item) => (vistos.has(item.id) ? false : (vistos.add(item.id), true))));
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
      setFiltroSolicitante('');
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
    const corte = new Date(`${hoje}T00:00:00`).toISOString();
    const base = () =>
      supabase
        .from('solicitacoes')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'PENDENTE')
        .lt('data_enviada', corte);
    base()
      .or(`reaberta_em.is.null,reaberta_em.lt.${corte}`)
      .then(({ count, error }) => {
        if (error) base().then((r) => setPendentesAnteriores(r.count || 0)); // sem a coluna nova
        else setPendentesAnteriores(count || 0);
      });
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
          avisarSistema(payload);
          if (payload.eventType === 'INSERT') {
            toast.success(`Nova solicitação recebida: Pedido ${payload.new.cod_liberacao}`, {
              icon: '🔔',
              duration: 5000
            });
            // a lista pode já ter recarregado com ela (quem enviou): não duplica
            // só entra na lista se cair no período exibido (ex.: olhando outro dia, a nova não aparece misturada)
            const { ini, fim } = periodoRef.current;
            setSolicitacoes((prev) => (prev.some((item) => item.id === payload.new.id) || !noPeriodo(payload.new, ini, fim) ? prev : [payload.new, ...prev]));
          } else if (payload.eventType === 'UPDATE') {
            const reaberta = ehReabertura(solicitacoesRef.current.find((i) => i.id === payload.new.id), payload.new);
            toast(reaberta
              ? `Solicitação ${payload.new.cod_liberacao} reaberta — voltou para análise`
              : `Solicitação ${payload.new.cod_liberacao} atualizada para [${payload.new.status}]`, {
              icon: reaberta ? '🔄' : payload.new.status === 'SIM' ? '✅' : payload.new.status === 'NAO' ? '❌' : 'ℹ️',
              duration: 4000
            });
            setSolicitacoes((prev) => {
              if (prev.some((item) => item.id === payload.new.id)) {
                return prev.map((item) => (item.id === payload.new.id ? payload.new : item));
              }
              // caso de outro dia reaberto agora: entra na lista se cair no período exibido
              const { ini, fim } = periodoRef.current;
              return noPeriodo(payload.new, ini, fim) ? [payload.new, ...prev] : prev;
            });
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

  // Lista de RCAs do portal: usa o que está guardado e atualiza ao abrir o app e o formulário
  useEffect(() => {
    setRcasPortal(rcasEmCache());
    listarRcasPortal().then((l) => { if (l) setRcasPortal(l); });
  }, []);
  useEffect(() => {
    if (modalAberto) listarRcasPortal().then((l) => { if (l) setRcasPortal(l); });
  }, [modalAberto]);
  const rcaDoPortal = (cod) => rcasPortal.find((r) => mesmoCodigo(r.cod, cod)) || null;

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

  // Cadastra na tabela "clientes" um código que não estava na lista (para as próximas vezes já vir preenchido)
  const cadastrarCliente = async (cod, nome, silencioso = false) => {
    const codigo = String(cod || '').trim();
    const nomeLimpo = String(nome || '').trim().replace(/\s+/g, ' ').toUpperCase();
    if (!/^\d{6}$/.test(codigo)) {
      if (!silencioso) toast.error(`Digite o código com ${CODIGO_DIGITOS} dígitos antes de cadastrar.`);
      return false;
    }
    if (nomeLimpo.length < 2) {
      if (!silencioso) toast.error('Digite o nome do cliente antes de cadastrar.');
      return false;
    }
    setCadastrandoCliente(true);
    try {
      const { error } = await supabase.from('clientes').insert([{ codigo, nome: nomeLimpo }]);
      if (error && error.code !== '23505') { // 23505 = já existe: conta como cadastrado
        if (!silencioso) toast.error('Não foi possível cadastrar o cliente: ' + (error.message || 'verifique a permissão de INSERT (RLS) da tabela clientes.'));
        else console.log('Cliente não cadastrado:', error);
        return false;
      }
      if (!silencioso) {
        nomeAutoRef.current = true;
        setForm((f) => (f.cod_liberacao === codigo ? { ...f, nome_cliente: nomeLimpo } : f));
        setNomeStatus('cadastrado');
        toast.success(`Cliente ${codigo} cadastrado na lista.`);
      }
      return true;
    } finally {
      setCadastrandoCliente(false);
    }
  };

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
      solicitante: item.solicitante || '',
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

  // Escolher arquivos no formulário (valida tipo, tamanho e quantidade; vídeos são comprimidos aqui)
  const escolherArquivos = async (e) => {
    const lista = Array.from(e.target.files || []);
    e.target.value = ''; // permite escolher o mesmo arquivo de novo
    if (!lista.length) return;

    let total = anexosExistentes.length + novosArquivos.length;
    const aceitos = [];
    const videos = [];
    for (const f of lista) {
      const tipo = tipoDoArquivo(f);
      if (!tipoPermitido(tipo)) {
        toast.error(`"${f.name}": use imagem, áudio, vídeo ou PDF.`);
        continue;
      }
      const ehVideo = tipo.startsWith('video/');
      if (!ehVideo && f.size > MAX_BYTES) {
        toast.error(`"${f.name}" passa de ${MAX_MB} MB.`);
        continue;
      }
      if (ehVideo && f.size > MAX_VIDEO_ORIGINAL_BYTES) {
        toast.error(`"${f.name}" é grande demais (máx. 500 MB antes de comprimir).`);
        continue;
      }
      if (total >= MAX_ARQUIVOS) {
        toast.error(`Máximo de ${MAX_ARQUIVOS} anexos por solicitação.`);
        break;
      }
      (ehVideo ? videos : aceitos).push(f);
      total++;
    }
    if (aceitos.length) setNovosArquivos((prev) => [...prev, ...aceitos]);

    for (const v of videos) {
      const toastId = toast.loading(`Comprimindo "${v.name}"... 0% (mantenha esta tela aberta)`);
      setComprimindo((n) => n + 1);
      try {
        const r = await comprimirVideo(v, (pct) => toast.loading(`Comprimindo "${v.name}"... ${pct}% (mantenha esta tela aberta)`, { id: toastId }));
        if (r.file.size > MAX_VIDEO_BYTES) {
          toast.error(`"${v.name}" ficou com ${formatarTamanho(r.file.size)} e passa de ${MAX_VIDEO_MB} MB. Envie um vídeo mais curto.`, { id: toastId });
          continue;
        }
        setNovosArquivos((prev) => [...prev, r.file]);
        toast.success(r.comprimido
          ? `Vídeo comprimido: ${formatarTamanho(r.antes)} → ${formatarTamanho(r.file.size)}.`
          : `Vídeo adicionado (${formatarTamanho(r.file.size)}).`, { id: toastId });
      } finally {
        setComprimindo((n) => n - 1);
      }
    }
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
    if (comprimindo > 0) {
      toast.error('Aguarde terminar a compressão do vídeo.');
      return;
    }
    if (enviando) return;
    if (gravando) {
      toast.error('Pare a gravação antes de enviar.');
      return;
    }
    const solicitante = (form.solicitante || '').trim();
    const cod = form.cod_liberacao.trim();
    const rca = form.rca.trim();
    const nome = form.nome_cliente.trim();
    if (!solicitante) {
      toast.error('Escolha o funcionário solicitante.');
      return;
    }
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
    const clienteNovo = nomeStatus === 'nao_encontrado';
    pedirConfirmacao({
      titulo: editandoId ? 'Salvar alterações?' : 'Enviar solicitação?',
      mensagem: editandoId
        ? 'Os dados atuais desta solicitação serão substituídos.'
        : 'A solicitação será enviada ao aprovador.',
      icone: editandoId ? <Pencil className="w-5 h-5" /> : <Send className="w-5 h-5" />,
      tom: 'indigo',
      textoConfirmar: editandoId ? 'Salvar' : 'Enviar',
      detalhes: [
        ['Solicitante', solicitante],
        ['Cód. cliente', cod],
        ['Cliente', nome],
        ['RCA', rcaDoPortal(rca) ? `${rca} - ${rcaDoPortal(rca).nome}` : `${rca} (não cadastrado no portal: não será notificado)`],
        ['Tipo', form.tipo_solicitacao],
        ['Anexos', String(qtdAnexos)],
        ...(clienteNovo ? [['Cliente novo', 'será cadastrado na lista']] : [])
      ],
      onConfirm: () => enviarSolicitacao(cod, rca, nome, clienteNovo, solicitante)
    });
  };

  // Criar ou salvar edição (com anexos)
  const enviarSolicitacao = async (cod, rca, nome, clienteNovo = false, solicitante = '') => {
    lembrarSolicitante(solicitante); // próxima solicitação já vem com o mesmo nome neste aparelho
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
          solicitante,
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
        toast.error('Erro ao salvar: ' + error.message + (/solicitante/i.test(error.message) ? ' (rode o arquivo solicitante.sql no Supabase)' : ''), { id: toastId, duration: 7000 });
      } else if (!data || data.length === 0) {
        await removerArquivos(enviados.map((a) => a.path));
        toast.error('Não foi possível salvar. Verifique a permissão de UPDATE (RLS) da tabela.', { id: toastId });
      } else {
        await removerArquivos(anexosRemovidos.map((a) => a.path));
        if (clienteNovo) await cadastrarCliente(cod, nome, true);
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
        solicitante,
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
      toast.error('Erro ao enviar: ' + error.message + (/solicitante/i.test(error.message) ? ' (rode o arquivo solicitante.sql no Supabase)' : ''), { id: toastId, duration: 7000 });
    } else {
      if (clienteNovo) await cadastrarCliente(cod, nome, true);
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
        ['Solicitante', item.solicitante],
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
        ['Solicitante', modalAprovacao.solicitante],
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
      const idResp = modalAprovacao.id;
      setModalAprovacao(null);
      setMotivoRecusaInput('');
      fetchSolicitacoes();
      // Avisa o representante no Portal (card Notificações + push no celular)
      notificarRcaPortal(idResp).then((r) => {
        if (r?.ok && !r.ja_enviada) toast.success(`RCA ${r.rca} notificado no portal${r.enviados ? '' : ' (sem notificação ativa no celular; fica no card Notificações)'}.`, { icon: '📲', duration: 5000 });
        else if (r?.motivo === 'rca_nao_cadastrado') toast(`RCA ${r.rca || ''} não está cadastrado no portal: não foi notificado.`, { icon: '⚠️', duration: 6000 });
        else if (!r?.ok && !r?.ja_enviada) toast(`Não foi possível notificar o RCA no portal${r?.error ? ': ' + r.error : ''}.`, { icon: '⚠️', duration: 6000 });
      });
    }
  };

  // Reabrir: volta para análise sem apagar nada (observações e anexos ficam; a resposta anterior vai para o histórico)
  const pedirReabrir = (item) =>
    pedirConfirmacao({
      titulo: 'Reabrir solicitação?',
      mensagem: 'Ela volta para análise e sobe para o topo. Observações, motivo da recusa e anexos são mantidos; a resposta anterior fica no histórico.',
      icone: <RotateCcw className="w-5 h-5" />,
      tom: 'amber',
      textoConfirmar: 'Reabrir',
      detalhes: [
        ['Cód. cliente', item.cod_liberacao],
        ['Cliente', item.nome_cliente],
        ['RCA', item.rca],
        ['Resposta atual', item.status === 'SIM' ? 'Aprovada (SIM)' : 'Recusada (NÃO)']
      ],
      onConfirm: () => executarReabertura(item)
    });

  const executarReabertura = async (item) => {
    if (item.status === 'PENDENTE') return;
    const toastId = toast.loading('Reabrindo solicitação...');
    const entrada = {
      acao: 'reaberta',
      em: new Date().toISOString(),
      por: perfil,
      status_anterior: item.status,
      motivo_recusa: item.motivo_recusa || '',
      observacoes: item.observacoes || '',
      finalizada_em: item.data_finalizada || null
    };
    const { data, error } = await supabase
      .from('solicitacoes')
      .update({
        status: 'PENDENTE',
        data_finalizada: null,
        reaberta_em: entrada.em,
        historico: [...(item.historico || []), entrada]
      })
      .eq('id', item.id)
      .select();

    if (error) {
      const dica = /historico|reaberta_em/i.test(error.message) ? ' (rode o arquivo reabrir.sql no Supabase)' : '';
      toast.error('Erro ao reabrir: ' + error.message + dica, { id: toastId, duration: 7000 });
    } else if (!data || data.length === 0) {
      toast.error('Não foi possível reabrir. Verifique a permissão de UPDATE (RLS) da tabela.', { id: toastId });
    } else {
      toast.success('Solicitação reaberta — voltou para análise.', { id: toastId });
      setSolicitacoes((prev) => prev.map((i) => (i.id === data[0].id ? data[0] : i)));
      setModalAprovacao(null);
      setModalDetalhe(null);
      setMotivoRecusaInput('');
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
    const headers = ['Solicitante', 'Cód. Cliente', 'Cliente', 'RCA', 'Tipo de Solicitação', 'Aprovado (SIM/NÃO)', 'Observações', 'Motivo Recusa', 'Data Enviada', 'Data Finalizada', 'Tempo Conclusão', 'Qtd. Anexos'];
    const rows = solicitacoesFiltradas.map(s => [
      `"${(s.solicitante || '').replace(/"/g, '""')}"`,
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

  // ===== Tempo médio de resposta (do envio até aprovar/recusar) =====
  useEffect(() => {
    let vivo = true;
    const carregar7d = async () => {
      const fim = new Date(`${diaDeHoje()}T00:00:00`);
      const ini = new Date(fim.getTime() - 7 * 86400000);
      const { data } = await supabase
        .from('solicitacoes')
        .select('data_enviada,data_finalizada,solicitante')
        .gte('data_enviada', ini.toISOString())
        .lt('data_enviada', fim.toISOString())
        .not('data_finalizada', 'is', null)
        .limit(5000);
      if (vivo) setRespostas7d(data || []);
    };
    carregar7d();
    const t1 = setInterval(carregar7d, 30 * 60000);
    const t2 = setInterval(() => setAgoraTempo(Date.now()), 30000);
    return () => { vivo = false; clearInterval(t1); clearInterval(t2); };
  }, []);

  const tempoResposta = useMemo(() => {
    const doSol = (i) => !filtroSolicitante || (i.solicitante || '') === filtroSolicitante;
    const base = solicitacoes.filter((i) => noPeriodo(i, dataInicio, dataFim) && doSol(i));
    const ms = base
      .filter((i) => i.data_enviada && i.data_finalizada && i.status !== 'PENDENTE')
      .map((i) => new Date(i.data_finalizada) - new Date(i.data_enviada))
      .filter((v) => v >= 0);
    const media = ms.length ? ms.reduce((a, b) => a + b, 0) / ms.length : null;
    const ms7 = respostas7d.filter(doSol).map((i) => new Date(i.data_finalizada) - new Date(i.data_enviada)).filter((v) => v >= 0);
    const media7 = ms7.length ? ms7.reduce((a, b) => a + b, 0) / ms7.length : null;
    const pend = base.filter((i) => i.status === 'PENDENTE').sort((a, b) => ultimaMovimentacao(a) - ultimaMovimentacao(b))[0] || null;
    return {
      n: ms.length,
      media,
      min: ms.length ? Math.min(...ms) : null,
      max: ms.length ? Math.max(...ms) : null,
      ate15: ms.length ? Math.round(ms.filter((v) => v <= 15 * 60000).length / ms.length * 100) : null,
      media7,
      pend,
      pendMs: pend ? Math.max(0, agoraTempo - ultimaMovimentacao(pend)) : null
    };
  }, [solicitacoes, dataInicio, dataFim, filtroSolicitante, respostas7d, agoraTempo]);

  // ===== Relatório para imprimir / salvar em PDF (usa o que está na tela: período, status, solicitante e busca) =====
  const imprimirRelatorio = () => {
    const lista = solicitacoesFiltradas;
    if (!lista.length) { toast.error('Nenhuma solicitação na tela para imprimir.'); return; }
    const esc = (t) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const HEX = { azul: '#4338ca', laranja: '#ea580c', verde: '#166534', rosa: '#db2777', roxo: '#7e22ce' };
    const corNome = (n) => HEX[corSolicitante(n).replace('sol-cor-', '')] || HEX.azul;
    const n = { SIM: 0, NAO: 0, PENDENTE: 0 };
    lista.forEach((i) => { n[i.status] = (n[i.status] || 0) + 1; });
    const tempos = lista.filter((i) => i.data_finalizada && i.data_enviada).map((i) => new Date(i.data_finalizada) - new Date(i.data_enviada)).filter((ms) => ms >= 0);
    const medio = tempos.length ? tempos.reduce((a, b) => a + b, 0) / tempos.length : null;
    const fmtDur = (ms) => {
      if (ms == null) return '—';
      const m = Math.round(ms / 60000);
      return m < 60 ? `${m} min` : `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}min`;
    };
    const porSol = {};
    lista.forEach((i) => {
      const k = i.solicitante || 'Não informado';
      const o = (porSol[k] = porSol[k] || { total: 0, SIM: 0, NAO: 0, PENDENTE: 0 });
      o.total++; o[i.status] = (o[i.status] || 0) + 1;
    });
    const statusPill = (st) => st === 'SIM' ? '<span class="pill sim">Aprovada</span>' : st === 'NAO' ? '<span class="pill nao">Recusada</span>' : '<span class="pill pend">Pendente</span>';
    const filtros = [
      `Período: ${esc(rotuloPeriodo)}`,
      filtroStatus !== 'TODOS' ? `Status: ${filtroStatus === 'SIM' ? 'Aprovadas' : filtroStatus === 'NAO' ? 'Recusadas' : 'Pendentes'}` : '',
      filtroSolicitante ? `Solicitante: ${esc(filtroSolicitante)}` : '',
      busca.trim() ? `Busca: “${esc(busca.trim())}”` : ''
    ].filter(Boolean).join('  ·  ');
    const agora = new Date().toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    const linhas = lista.map((i) => {
      const obs = [i.observacoes ? `<div class="obs"><b>Obs.:</b> ${esc(i.observacoes)}</div>` : '', i.status === 'NAO' && i.motivo_recusa ? `<div class="obs nao-t"><b>Motivo:</b> ${esc(i.motivo_recusa)}</div>` : ''].join('');
      return `<tr>
        <td class="dt">${(() => { const d = formatDataCurta(i.data_enviada).split(' '); return `${esc(d[0] || '')}<br><span>${esc(d[1] || '')}</span>`; })()}</td>
        <td class="nw b">${esc(i.cod_liberacao)}</td>
        <td><div class="b">${esc(i.nome_cliente || '—')}</div>${obs}</td>
        <td class="nw">${esc(i.rca)}</td>
        <td>${esc(i.tipo_solicitacao)}</td>
        <td class="b" style="color:${corNome(i.solicitante)}">${esc(i.solicitante || '—')}</td>
        <td class="nw c">${statusPill(i.status)}${i.reaberta_em ? '<div class="mini">reaberta</div>' : ''}</td>
        <td class="nw c">${i.data_finalizada ? esc(calcularTempoConclusao(i.data_enviada, i.data_finalizada)) : '—'}</td>
      </tr>`;
    }).join('');
    const resumoSol = Object.entries(porSol).sort((a, b) => b[1].total - a[1].total).map(([k, o]) =>
      `<tr><td class="b" style="color:${corNome(k)}">${esc(k)}</td><td class="c">${o.total}</td><td class="c sim-t">${o.SIM || 0}</td><td class="c nao-t">${o.NAO || 0}</td><td class="c pend-t">${o.PENDENTE || 0}</td></tr>`).join('');
    const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Relatório de Solicitações - ${esc(rotuloPeriodo)}</title>
<style>
  @page { size: A4 portrait; margin: 10mm 9mm 13mm; @bottom-right { content: "Página " counter(page) " de " counter(pages); font: 9px system-ui, sans-serif; color: #64748b; } }
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { font: 10px/1.35 system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif; color: #0f172a; margin: 0; }
  .topo { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 3px solid #4f46e5; padding-bottom: 8px; margin-bottom: 10px; }
  .marca { font-size: 10px; font-weight: 800; letter-spacing: .12em; color: #4f46e5; text-transform: uppercase; }
  h1 { font-size: 20px; margin: 2px 0 0; }
  .meta { text-align: right; color: #475569; font-size: 10px; }
  .filtros { color: #334155; font-size: 10.5px; margin-bottom: 10px; }
  .cards { display: grid; grid-template-columns: repeat(5, 1fr); gap: 6px; margin-bottom: 10px; }
  .card { border: 1px solid #e2e8f0; border-radius: 10px; padding: 8px 10px; }
  .card .r { font-size: 9px; font-weight: 700; text-transform: uppercase; color: #64748b; letter-spacing: .04em; }
  .card .v { font-size: 16px; font-weight: 800; margin-top: 2px; }
  .sim-t { color: #047857; } .nao-t { color: #be123c; } .pend-t { color: #b45309; }
  .card.sim { background: #ecfdf5; border-color: #a7f3d0; } .card.nao { background: #fff1f2; border-color: #fecdd3; } .card.pend { background: #fffbeb; border-color: #fde68a; }
  table { width: 100%; border-collapse: collapse; }
  thead { display: table-header-group; }
  table { table-layout: fixed; }
  th { background: #f1f5f9; color: #334155; font-size: 8.5px; text-transform: uppercase; letter-spacing: .04em; text-align: left; padding: 5px 5px; border-bottom: 1px solid #cbd5e1; }
  td { padding: 5px 5px; border-bottom: 1px solid #e2e8f0; vertical-align: top; overflow-wrap: anywhere; }
  tbody tr:nth-child(even) td { background: #f8fafc; }
  tr { break-inside: avoid; page-break-inside: avoid; }
  .nw { white-space: nowrap; } .b { font-weight: 700; } .c { text-align: center; }
  .obs { font-size: 8.5px; color: #475569; margin-top: 2px; }
  .mini { font-size: 8.5px; color: #64748b; margin-top: 2px; }
  .pill { display: inline-block; padding: 2px 6px; border-radius: 999px; font-size: 8.5px; font-weight: 800; }
  .pill.sim { background: #d1fae5; color: #065f46; } .pill.nao { background: #ffe4e6; color: #9f1239; } .pill.pend { background: #fef3c7; color: #92400e; }
  .sec { font-size: 11px; font-weight: 800; color: #334155; margin: 14px 0 6px; text-transform: uppercase; letter-spacing: .05em; }
  .resumo { width: 70%; table-layout: auto; }
  .dt { font-size: 9px; line-height: 1.25; } .dt span { color: #64748b; }
  .rodape { margin-top: 10px; font-size: 9px; color: #94a3b8; text-align: right; }
</style></head><body>
  <div class="topo">
    <div><div class="marca">Frigolden · Solicitações Diárias</div><h1>Relatório de Solicitações</h1></div>
    <div class="meta">Gerado em ${agora}<br>${lista.length} ${lista.length > 1 ? 'solicitações' : 'solicitação'}</div>
  </div>
  <div class="filtros">${filtros}</div>
  <div class="cards">
    <div class="card"><div class="r">Total</div><div class="v">${lista.length}</div></div>
    <div class="card sim"><div class="r">Aprovadas</div><div class="v sim-t">${n.SIM}</div></div>
    <div class="card nao"><div class="r">Recusadas</div><div class="v nao-t">${n.NAO}</div></div>
    <div class="card pend"><div class="r">Pendentes</div><div class="v pend-t">${n.PENDENTE}</div></div>
    <div class="card"><div class="r">Tempo médio de resposta</div><div class="v">${fmtDur(medio)}</div></div>
  </div>
  <table>
    <colgroup><col style="width:9%"><col style="width:8%"><col style="width:31%"><col style="width:6%"><col style="width:14%"><col style="width:12%"><col style="width:11%"><col style="width:9%"></colgroup>
    <thead><tr><th>Enviada</th><th>Cód.</th><th>Cliente</th><th>RCA</th><th>Tipo</th><th>Solicitante</th><th class="c">Status</th><th class="c">Tempo</th></tr></thead>
    <tbody>${linhas}</tbody>
  </table>
  ${Object.keys(porSol).length > 1 ? `<div class="sec">Resumo por solicitante</div>
  <table class="resumo"><thead><tr><th>Solicitante</th><th class="c">Total</th><th class="c">Aprovadas</th><th class="c">Recusadas</th><th class="c">Pendentes</th></tr></thead><tbody>${resumoSol}</tbody></table>` : ''}
  <div class="rodape">Frigolden · Relatório gerado pelo app de Solicitações</div>
  <script>window.onload = function () { setTimeout(function () { window.focus(); window.print(); }, 300); };<\/script>
</body></html>`;
    // nova aba (no celular abre a tela de imprimir/salvar PDF); se o navegador bloquear, imprime por um quadro escondido
    const w = window.open('', '_blank');
    if (w && w.document) {
      w.document.open(); w.document.write(html); w.document.close();
      return;
    }
    const f = document.createElement('iframe');
    f.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
    document.body.appendChild(f);
    f.contentDocument.open(); f.contentDocument.write(html.replace(/<script>[\s\S]*?<\/script>/, '')); f.contentDocument.close();
    setTimeout(() => { f.contentWindow.focus(); f.contentWindow.print(); setTimeout(() => f.remove(), 2000); }, 400);
  };

  // Itens dentro do período selecionado (base dos contadores)
  const doPeriodo = useMemo(
    () =>
      solicitacoes.filter((item) => noPeriodo(item, dataInicio, dataFim)),
    [solicitacoes, dataInicio, dataFim]
  );

  // Filtros: status + período (data enviada) + busca por vários termos, sem acento
  const solicitacoesFiltradas = useMemo(() => {
    const termos = normalizar(busca).split(/\s+/).filter(Boolean);

    return solicitacoes.filter((item) => {
      if (filtroStatus !== 'TODOS' && item.status !== filtroStatus) return false;

      if (filtroSolicitante && (item.solicitante || '') !== filtroSolicitante) return false;

      if (!noPeriodo(item, dataInicio, dataFim)) return false;

      if (termos.length === 0) return true;

      const statusTexto =
        item.status === 'SIM' ? 'sim aprovado' : item.status === 'NAO' ? 'nao recusado' : 'pendente em analise';
      const alvo = normalizar(
        [
          item.solicitante,
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
    }).sort((a, b) => ultimaMovimentacao(b) - ultimaMovimentacao(a)); // reabertos no topo
  }, [solicitacoes, filtroStatus, filtroSolicitante, busca, dataInicio, dataFim]);

  // Seleção em lote: só entram as que o perfil pode alterar e que estão na tela (filtro, data e busca)
  const selecionaveis = useMemo(
    () => solicitacoesFiltradas.filter((i) => perfil === 'APROVADOR' || i.status === 'PENDENTE'),
    [solicitacoesFiltradas, perfil]
  );
  const idsSelecionaveis = useMemo(() => new Set(selecionaveis.map((i) => i.id)), [selecionaveis]);

  // Ao mudar filtro, busca ou período, desmarca o que saiu da tela
  useEffect(() => {
    setSelecionados((prev) => {
      const prox = new Set([...prev].filter((id) => idsSelecionaveis.has(id)));
      return prox.size === prev.size ? prev : prox;
    });
  }, [idsSelecionaveis]);

  const qtdSel = selecionados.size;
  const todosMarcados = selecionaveis.length > 0 && qtdSel === selecionaveis.length;
  const algunsMarcados = qtdSel > 0 && !todosMarcados;
  const refMarcarTodos = useRef(null);
  const refMarcarTodosTopo = useRef(null);
  useEffect(() => {
    [refMarcarTodos, refMarcarTodosTopo].forEach((r) => { if (r.current) r.current.indeterminate = algunsMarcados; });
  }, [algunsMarcados, qtdSel, selecionaveis.length]);

  const alternarSelecao = (id) =>
    setSelecionados((prev) => {
      const prox = new Set(prev);
      if (prox.has(id)) prox.delete(id); else prox.add(id);
      return prox;
    });

  const alternarTodos = () =>
    setSelecionados(todosMarcados ? new Set() : new Set(selecionaveis.map((i) => i.id)));

  const limparSelecao = () => setSelecionados(new Set());

  const pedirExcluirSelecionadas = () => {
    const itens = solicitacoes.filter((i) => selecionados.has(i.id));
    if (!itens.length) return;
    const nAnexos = itens.reduce((t, i) => t + (i.anexos || []).length, 0);
    const nomes = itens.slice(0, 3).map((i) => i.nome_cliente || i.cod_liberacao).join(', ') + (itens.length > 3 ? ` +${itens.length - 3}` : '');
    pedirConfirmacao({
      titulo: itens.length === 1 ? 'Excluir 1 solicitação?' : `Excluir ${itens.length} solicitações?`,
      mensagem: 'Elas serão removidas permanentemente, junto com os anexos. Essa ação não pode ser desfeita.',
      icone: <Trash2 className="w-5 h-5" />,
      tom: 'rose',
      textoConfirmar: itens.length === 1 ? 'Excluir' : `Excluir ${itens.length}`,
      detalhes: [
        ['Solicitações', String(itens.length)],
        ['Anexos', String(nAnexos)],
        ['Clientes', nomes]
      ],
      onConfirm: () => handleExcluirSelecionadas(itens)
    });
  };

  const handleExcluirSelecionadas = async (itens) => {
    setExcluindoLote(true);
    const toastId = toast.loading(`Excluindo ${itens.length} solicitação(ões)...`);
    const apagados = new Set();
    let erro = null;
    try {
      for (let k = 0; k < itens.length; k += 100) {
        const lote = itens.slice(k, k + 100).map((i) => i.id);
        const { data, error } = await supabase.from('solicitacoes').delete().in('id', lote).select('id');
        if (error) { erro = error.message; break; }
        (data || []).forEach((r) => apagados.add(r.id));
      }
      if (apagados.size) {
        await removerArquivos(itens.filter((i) => apagados.has(i.id)).flatMap((i) => (i.anexos || []).map((a) => a.path)));
        setSolicitacoes((prev) => prev.filter((x) => !apagados.has(x.id)));
        setSelecionados((prev) => new Set([...prev].filter((id) => !apagados.has(id))));
      }
      if (erro) toast.error(`Erro ao excluir: ${erro}${apagados.size ? ` (${apagados.size} já excluída(s))` : ''}`, { id: toastId });
      else if (!apagados.size) toast.error('Não foi possível excluir. Verifique a permissão de DELETE (RLS) da tabela.', { id: toastId });
      else if (apagados.size < itens.length) toast.error(`${apagados.size} de ${itens.length} excluídas. As outras não foram permitidas pelo banco.`, { id: toastId });
      else toast.success(apagados.size === 1 ? 'Solicitação excluída.' : `${apagados.size} solicitações excluídas.`, { id: toastId });
    } finally {
      setExcluindoLote(false);
    }
  };

  const visaoPadrao = seguindoHoje && dataInicio === hoje && dataFim === hoje;
  const temFiltroAtivo = Boolean(busca || filtroStatus !== 'TODOS' || filtroSolicitante || !visaoPadrao);

  // Opções do filtro: lista de funcionários + nomes que já aparecem nas solicitações
  const opcoesSolicitante = useMemo(() => {
    const nomes = new Set(funcionarios);
    solicitacoes.forEach((i) => { if (i.solicitante) nomes.add(i.solicitante); });
    return [...nomes].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [funcionarios, solicitacoes]);

  // Volta para a visão limpa do dia
  const limparFiltros = () => {
    setBusca('');
    setFiltroStatus('TODOS');
    setFiltroSolicitante('');
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
    <span className="inline-flex flex-col items-center gap-0.5">
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
      {item.status === 'PENDENTE' && item.reaberta_em && (
        <span className="text-[10px] font-semibold text-amber-700 whitespace-nowrap">🔄 Reaberta</span>
      )}
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
        {item.status !== 'PENDENTE' && (
          <button
            onClick={() => pedirReabrir(item)}
            title="Reabrir para análise"
            aria-label="Reabrir solicitação"
            className={`${pad} rounded-lg text-slate-500 hover:text-amber-600 hover:bg-amber-50 transition`}
          >
            <RotateCcw className={ic} />
          </button>
        )}
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

  const blocoHistorico = (item) => {
    const h = item.historico || [];
    if (h.length === 0) return null;
    return (
      <div className="bg-amber-50 p-3 rounded-lg text-xs text-amber-800 border border-amber-200 mb-3">
        <p className="font-semibold mb-1.5 flex items-center gap-1.5">
          <RotateCcw className="w-3.5 h-3.5" /> Histórico de reaberturas ({h.length})
        </p>
        <ul className="space-y-1.5">
          {[...h].reverse().map((e, i) => (
            <li key={i} className="break-words">
              Reaberta em {formatDateTime(e.em)} ({e.por === 'APROVADOR' ? 'aprovador' : 'solicitante'}). Resposta anterior:{' '}
              <strong>{e.status_anterior === 'SIM' ? 'Aprovada (SIM)' : 'Recusada (NÃO)'}</strong>
              {e.finalizada_em ? ` em ${formatDateTime(e.finalizada_em)}` : ''}
              {e.motivo_recusa ? ` — Motivo: ${e.motivo_recusa}` : ''}
              {e.observacoes && e.observacoes !== item.observacoes ? ` — Obs. do solicitante na época: ${e.observacoes}` : ''}
            </li>
          ))}
        </ul>
      </div>
    );
  };

  // Cada coluna: título, largura, alinhamento e conteúdo da célula
  const previaProps = (titulo, texto) => ({
    onMouseEnter: (e) => entrarPrevia(e, titulo, texto),
    onMouseMove: moverPrevia,
    onMouseLeave: sairPrevia
  });
  const DEF_COLUNAS = {
    cod:         { titulo: 'Cód.',          largura: 6,  td: 'font-semibold text-slate-800 truncate', cel: (i) => i.cod_liberacao },
    cliente:     { titulo: 'Cliente',       largura: 10, td: 'font-medium text-slate-700 truncate', props: (i) => previaProps('Cliente', i.nome_cliente),
                   cel: (i) => i.nome_cliente || <span className="text-slate-300">-</span> },
    rca:         { titulo: 'RCA',           largura: 4,  td: 'font-medium text-slate-600 truncate', cel: (i) => i.rca },
    tipo:        { titulo: 'Tipo',          largura: 13, td: '', cel: (i) => pilulaTipo(i.tipo_solicitacao) },
    status:      { titulo: 'Status',        largura: 7,  centro: true, td: '', cel: (i) => badge(i) },
    observacoes: { titulo: 'Observações',   largura: 9,  td: 'truncate text-slate-600', props: (i) => previaProps('Observações', i.observacoes),
                   cel: (i) => i.observacoes || '-' },
    motivo:      { titulo: 'Motivo recusa', largura: 8,  td: 'truncate text-rose-600 font-medium', props: (i) => previaProps('Motivo da recusa', i.motivo_recusa),
                   cel: (i) => i.motivo_recusa || '-' },
    enviada:     { titulo: 'Enviada',       largura: 7,  td: 'text-slate-500 whitespace-nowrap', cel: (i) => formatDataCurta(i.data_enviada) },
    finalizada:  { titulo: 'Finalizada',    largura: 7,  td: 'text-slate-500 whitespace-nowrap', cel: (i) => formatDataCurta(i.data_finalizada) },
    tempo:       { titulo: 'Tempo',         largura: 5,  centro: true, td: 'font-mono text-[11px] font-semibold text-slate-700',
                   cel: (i) => calcularTempoConclusao(i.data_enviada, i.data_finalizada) },
    anexos:      { titulo: 'Anexos',        largura: 4,  centro: true, td: '', cel: (i) => chipAnexos(i) },
    acoes:       { titulo: 'Ações',         largura: 9,  td: '',
                   cel: (i) => <div className="flex items-center justify-center gap-1 flex-wrap">{acoesItem(i)}</div> },
    solicitante: { titulo: 'Solicitante',   largura: 8,  td: 'font-semibold truncate', props: (i) => previaProps('Solicitante', i.solicitante),
                   cel: (i) => i.solicitante ? <span className={corSolicitante(i.solicitante)}>{i.solicitante}</span> : <span className="text-slate-300">-</span> }
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
              onClick={alternarTema}
              title={tema === 'escuro' ? 'Mudar para o tema claro' : 'Mudar para o tema escuro'}
              aria-label={tema === 'escuro' ? 'Mudar para o tema claro' : 'Mudar para o tema escuro'}
              className="flex-1 md:flex-none justify-center border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 px-3 py-2.5 md:py-2 rounded-xl text-sm font-medium flex items-center gap-2 transition"
            >
              {tema === 'escuro' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
              {tema === 'escuro' ? 'Claro' : 'Escuro'}
            </button>

            {avisosPerm !== 'nao-suportado' && (
              <button
                onClick={ativarAvisos}
                title={
                  avisosPerm === 'granted'
                    ? 'Avisos ativos — clique para testar o aviso e o som'
                    : avisosPerm === 'denied'
                    ? 'Bloqueado no navegador: clique no cadeado ao lado do endereço e permita as notificações'
                    : 'Receber avisos no canto da tela, com som'
                }
                className={`flex-1 md:flex-none justify-center px-3 py-2.5 md:py-2 rounded-xl text-sm font-medium flex items-center gap-2 transition border ${
                  avisosPerm === 'granted'
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                    : avisosPerm === 'denied'
                    ? 'border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100'
                    : 'border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100'
                }`}
              >
                {avisosPerm === 'denied' ? <BellOff className="w-4 h-4" /> : <Bell className="w-4 h-4" />}
                {avisosPerm === 'granted' ? 'Avisos ativos' : avisosPerm === 'denied' ? 'Avisos bloqueados' : 'Ativar avisos'}
              </button>
            )}

            <button
              onClick={exportToCSV}
              className="flex-1 md:flex-none justify-center border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 px-3 py-2.5 md:py-2 rounded-xl text-sm font-medium flex items-center gap-2 transition"
            >
              <Download className="w-4 h-4" /> Exportar CSV
            </button>

            <button
              onClick={imprimirRelatorio}
              title="Imprimir ou salvar em PDF o que está na tela (período, status, solicitante e busca)"
              className="flex-1 md:flex-none justify-center border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 px-3 py-2.5 md:py-2 rounded-xl text-sm font-medium flex items-center gap-2 transition"
            >
              <Printer className="w-4 h-4" /> Imprimir / PDF
            </button>
          </div>
        </div>

        {/* ESTATÍSTICAS RÁPIDAS (clique em um cartão para filtrar por status) */}
        <div className="stagger grid grid-cols-2 md:grid-cols-5 gap-3">
          {[
            { st: 'TODOS', rotulo: 'Total do período', n: doPeriodo.length, Icone: RefreshCw,
              card: 'border-slate-200', rot: 'text-slate-500', num: 'text-slate-800', icone: 'bg-slate-100 text-slate-600', ring: 'ring-indigo-500' },
            { st: 'PENDENTE', rotulo: 'Pendentes', n: doPeriodo.filter((s) => s.status === 'PENDENTE').length, Icone: Clock,
              card: 'border-amber-200 bg-amber-50/30', rot: 'text-amber-700', num: 'text-amber-800', icone: 'bg-amber-100 text-amber-600', ring: 'ring-amber-400' },
            { st: 'SIM', rotulo: 'Aprovados (SIM)', n: doPeriodo.filter((s) => s.status === 'SIM').length, Icone: CheckCircle2,
              card: 'border-emerald-200 bg-emerald-50/30', rot: 'text-emerald-700', num: 'text-emerald-800', icone: 'bg-emerald-100 text-emerald-600', ring: 'ring-emerald-500' },
            { st: 'NAO', rotulo: 'Recusados (NÃO)', n: doPeriodo.filter((s) => s.status === 'NAO').length, Icone: XCircle,
              card: 'border-rose-200 bg-rose-50/30', rot: 'text-rose-700', num: 'text-rose-800', icone: 'bg-rose-100 text-rose-600', ring: 'ring-rose-400' }
          ].map(({ st, rotulo, n, Icone, card, rot, num, icone, ring }) => {
            const ativo = st !== 'TODOS' && filtroStatus === st;
            return (
              <button
                key={st}
                type="button"
                onClick={() => setFiltroStatus(ativo ? 'TODOS' : st)}
                aria-pressed={ativo}
                title={st === 'TODOS' ? 'Mostrar todos os status' : ativo ? 'Clique para remover o filtro' : `Filtrar: ${rotulo}`}
                className={`bg-white p-4 rounded-xl border ${card} shadow-sm flex items-center justify-between w-full text-left transition hover:shadow-md ${ativo ? `ring-2 ${ring}` : ''}`}
              >
                <div>
                  <p className={`text-xs font-medium ${rot}`}>{rotulo}</p>
                  <p className={`text-xl font-bold ${num}`}>{n}</p>
                </div>
                <span className={`p-2 rounded-lg ${icone}`}><Icone className="w-4 h-4" /></span>
              </button>
            );
          })}
          {/* Tempo médio de resposta: cor pela faixa (até 10 min verde, 10–20 azul, 20–30 laranja, acima de 30 vermelho pulsando) */}
          {(() => {
            const t = tempoResposta;
            const min = t.n ? t.media / 60000 : null;
            const f = min == null
              ? { card: 'border-slate-200', rot: 'text-slate-500', num: 'text-slate-800', icone: 'bg-slate-100 text-slate-600', emoji: '⏱️', txt: 'sem respostas ainda' }
              : min <= 10 ? { card: 'border-emerald-200 bg-emerald-50/30', rot: 'text-emerald-700', num: 'text-emerald-800', icone: 'bg-emerald-100 text-emerald-600', emoji: '🚀', txt: 'excelente' }
              : min <= 20 ? { card: 'border-sky-200 bg-sky-50/30', rot: 'text-sky-700', num: 'text-sky-800', icone: 'bg-sky-100 text-sky-600', emoji: '⚡', txt: 'bom' }
              : min <= 30 ? { card: 'border-orange-200 bg-orange-50/30', rot: 'text-orange-700', num: 'text-orange-800', icone: 'bg-orange-100 text-orange-600', emoji: '⏳', txt: 'atenção' }
              : { card: 'border-rose-200 bg-rose-50/30 tmr-pulsa', rot: 'text-rose-700', num: 'text-rose-800', icone: 'bg-rose-100 text-rose-600', emoji: '🐢', txt: 'demorado' };
            const melhor = t.media7 != null && t.n && t.media < t.media7;
            return (
              <div className={`col-span-2 md:col-span-1 bg-white p-4 rounded-xl border ${f.card} shadow-sm w-full text-left space-y-1.5`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className={`text-xs font-medium ${f.rot}`}>Tempo médio de resposta</p>
                    <p className={`text-xl font-bold ${f.num}`}>{t.n ? fmtMinutos(t.media) : '—'} <span className="text-base" title={f.txt}>{f.emoji}</span></p>
                  </div>
                  <span className={`p-2 rounded-lg ${f.icone}`}><Timer className="w-4 h-4" /></span>
                </div>
                {t.n > 0 && (
                  <div className="text-[11px] leading-snug text-slate-600 space-y-0.5">
                    <p>⚡ Mais rápida <b>{fmtMinutos(t.min)}</b> · 🐢 Mais demorada <b>{fmtMinutos(t.max)}</b></p>
                    <p>✅ <b>{t.ate15}%</b> em até 15 min · 📋 {t.n} respondida{t.n === 1 ? '' : 's'}</p>
                    {t.media7 != null && Math.abs(t.media - t.media7) >= 60000 && (
                      <p className={`font-semibold ${melhor ? 'text-emerald-700' : 'text-rose-700'}`}>
                        {melhor ? '📉' : '📈'} {fmtMinutos(Math.abs(t.media - t.media7))} {melhor ? 'mais rápido' : 'mais lento'} que os últimos 7 dias ({fmtMinutos(t.media7)})
                      </p>
                    )}
                  </div>
                )}
                {t.pend && (
                  <button type="button" onClick={() => setFiltroStatus('PENDENTE')} title="Ver as pendentes"
                    className="w-full text-left text-[11px] font-semibold rounded-lg px-2 py-1 bg-amber-50 border border-amber-200 text-amber-800">
                    ⌛ Pendente há <b>{fmtMinutos(t.pendMs)}</b> · pedido {t.pend.cod_liberacao}
                  </button>
                )}
              </div>
            );
          })()}
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
                placeholder="Buscar por solicitante, cliente, cód., RCA, tipo..."
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
            <div className="w-full sm:w-auto sm:min-w-[11rem]">
              <label htmlFor="filtro-solicitante" className="block text-xs font-semibold text-slate-600 mb-1">Solicitante</label>
              <select
                id="filtro-solicitante"
                value={filtroSolicitante}
                onChange={(e) => setFiltroSolicitante(e.target.value)}
                className={`w-full border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 ${filtroSolicitante ? 'border-indigo-300 bg-indigo-50/60 text-indigo-800 font-semibold' : 'border-slate-200'}`}
              >
                <option value="">Todos os funcionários</option>
                {opcoesSolicitante.map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </div>
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

            {/* SELEÇÃO EM LOTE */}
            {selecionaveis.length > 0 && (
              <div className={`flex flex-wrap items-center gap-2 sm:gap-3 px-3 sm:px-4 py-2.5 border-b border-slate-200 text-xs transition-colors ${qtdSel ? 'bg-rose-50/70' : 'bg-slate-50/60'}`}>
                <label className="inline-flex items-center gap-2 font-semibold text-slate-700 cursor-pointer select-none min-h-[36px]">
                  <input
                    ref={refMarcarTodosTopo}
                    type="checkbox"
                    checked={todosMarcados}
                    onChange={alternarTodos}
                    className="w-4 h-4 accent-indigo-600 cursor-pointer"
                  />
                  {todosMarcados ? 'Desmarcar todas' : `Marcar todas (${selecionaveis.length})`}
                </label>
                {qtdSel > 0 && (
                  <span className="fade-in text-slate-600">
                    <b className="text-slate-800">{qtdSel}</b> selecionada{qtdSel > 1 ? 's' : ''}
                  </span>
                )}
                {qtdSel > 0 && (
                  <div className="fade-in flex items-center gap-2 ml-auto">
                    <button
                      type="button"
                      onClick={limparSelecao}
                      className="px-3 py-2 rounded-lg font-semibold text-slate-600 hover:bg-slate-200/70 transition"
                    >
                      Limpar
                    </button>
                    <button
                      type="button"
                      onClick={pedirExcluirSelecionadas}
                      disabled={excluindoLote}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg font-semibold text-white bg-rose-600 hover:bg-rose-700 disabled:opacity-60 transition shadow-sm"
                    >
                      <Trash2 className="w-4 h-4" />
                      Excluir selecionadas ({qtdSel})
                    </button>
                  </div>
                )}
              </div>
            )}

            <div className="hidden xl:block">
              <div className="flex items-center justify-end gap-3 px-4 py-1.5 border-b border-slate-200 text-[11px] text-slate-500">
                <span className="inline-flex items-center gap-1">
                  <GripVertical className="w-3.5 h-3.5" /> Arraste o título de uma coluna para mudar a ordem
                </span>
                {ordemPersonalizada && (
                  <button
                    type="button"
                    onClick={restaurarColunas}
                    className="fade-in inline-flex items-center gap-1 px-2.5 py-1 rounded-lg font-semibold text-indigo-600 hover:bg-indigo-50 transition"
                  >
                    <RotateCcw className="w-3.5 h-3.5" /> Restaurar ordem padrão
                  </button>
                )}
              </div>
              <table className="w-full table-fixed text-left border-collapse text-xs">
                <colgroup>
                  <col style={{ width: '3%' }} />
                  {ordemColunas.map((c) => (
                    <col key={c} style={{ width: `${DEF_COLUNAS[c].largura}%` }} />
                  ))}
                </colgroup>
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold uppercase text-[11px] leading-tight">
                    <th className="pl-3 pr-1 py-2.5">
                      <input
                        ref={refMarcarTodos}
                        type="checkbox"
                        checked={todosMarcados}
                        onChange={alternarTodos}
                        disabled={selecionaveis.length === 0}
                        aria-label="Marcar todas as solicitações da lista"
                        title="Marcar todas"
                        className="w-4 h-4 accent-indigo-600 cursor-pointer align-middle"
                      />
                    </th>
                    {ordemColunas.map((c) => {
                      const col = DEF_COLUNAS[c];
                      const alvo = colAlvo === c && colArrastada && colArrastada !== c;
                      const paraDireita = alvo && ordemColunas.indexOf(colArrastada) < ordemColunas.indexOf(c);
                      return (
                        <th
                          key={c}
                          draggable
                          title="Arraste para mudar a posição da coluna"
                          onDragStart={(e) => {
                            setColArrastada(c);
                            e.dataTransfer.effectAllowed = 'move';
                            try { e.dataTransfer.setData('text/plain', c); } catch (err) {}
                          }}
                          onDragOver={(e) => {
                            if (!colArrastada) return;
                            e.preventDefault();
                            e.dataTransfer.dropEffect = 'move';
                            if (colAlvo !== c) setColAlvo(c);
                          }}
                          onDrop={(e) => {
                            e.preventDefault();
                            moverColuna(colArrastada, c);
                            setColArrastada(null);
                            setColAlvo(null);
                          }}
                          onDragEnd={() => { setColArrastada(null); setColAlvo(null); }}
                          className={`group px-2 py-2.5 cursor-grab active:cursor-grabbing select-none transition-colors ${col.centro || c === 'acoes' ? 'text-center' : ''} ${
                            colArrastada === c ? 'opacity-40' : ''
                          } ${alvo ? `bg-indigo-100/70 text-indigo-700 ${paraDireita ? 'shadow-[inset_-3px_0_0_0_#6366f1]' : 'shadow-[inset_3px_0_0_0_#6366f1]'}` : 'hover:bg-slate-100'}`}
                        >
                          <span className="inline-flex items-center gap-1 max-w-full">
                            <GripVertical className="w-3 h-3 shrink-0 opacity-30 group-hover:opacity-80" />
                            <span className="truncate">{col.titulo}</span>
                          </span>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {solicitacoesFiltradas.map((item, idx) => (
                    <tr
                      key={item.id}
                      onClick={(e) => abrirItem(item, e)}
                      className={`fade-in cursor-pointer transition ${selecionados.has(item.id) ? 'bg-rose-50/70 hover:bg-rose-50' : 'hover:bg-indigo-50/40'}`}
                      style={{ animationDelay: `${Math.min(idx, 12) * 30}ms` }}
                    >
                      <td className={`pl-2 pr-1 py-2.5 border-l-4 ${corDoTipo(item.tipo_solicitacao).borda}`}>
                        {idsSelecionaveis.has(item.id) && (
                          <input
                            type="checkbox"
                            checked={selecionados.has(item.id)}
                            onChange={() => alternarSelecao(item.id)}
                            aria-label={`Selecionar ${item.nome_cliente || item.cod_liberacao}`}
                            className="w-4 h-4 accent-indigo-600 cursor-pointer align-middle"
                          />
                        )}
                      </td>
                      {ordemColunas.map((c) => {
                        const col = DEF_COLUNAS[c];
                        return (
                          <td
                            key={c}
                            className={`px-2 py-2.5 ${col.centro ? 'text-center' : ''} ${col.td} ${colAlvo === c && colArrastada && colArrastada !== c ? 'bg-indigo-50/60' : ''}`}
                            {...(col.props ? col.props(item) : {})}
                          >
                            {col.cel(item)}
                          </td>
                        );
                      })}
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
                  className={`fade-in min-w-0 flex flex-col gap-3 border border-l-4 ${corDoTipo(item.tipo_solicitacao).borda} rounded-2xl p-4 shadow-sm cursor-pointer transition-colors ${selecionados.has(item.id) ? 'bg-rose-50/70 border-rose-200 ring-2 ring-rose-300' : 'bg-white border-slate-200'}`}
                  style={{ animationDelay: `${Math.min(idx, 10) * 30}ms` }}
                >
                  <div className="flex items-start justify-between gap-2">
                    {idsSelecionaveis.has(item.id) && (
                      <input
                        type="checkbox"
                        checked={selecionados.has(item.id)}
                        onChange={() => alternarSelecao(item.id)}
                        aria-label={`Selecionar ${item.nome_cliente || item.cod_liberacao}`}
                        className="w-5 h-5 mt-0.5 shrink-0 accent-indigo-600 cursor-pointer"
                      />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className={`font-bold break-words ${item.nome_cliente ? 'text-slate-800' : 'text-slate-400 italic font-medium'}`}>
                        {item.nome_cliente || 'Cliente não informado'}
                      </p>
                      <p className="text-xs text-slate-500 mt-0.5">Cód. {item.cod_liberacao} · RCA {item.rca}</p>
                      {item.solicitante && (
                        <p className={`text-xs font-semibold mt-0.5 flex items-center gap-1 min-w-0 ${corSolicitante(item.solicitante)}`}>
                          <User className="w-3.5 h-3.5 shrink-0" /> <span className="truncate">{item.solicitante}</span>
                        </p>
                      )}
                    </div>
                    {badge(item)}
                  </div>

                  <div>{pilulaTipo(item.tipo_solicitacao, 'text-xs')}</div>

                  {item.observacoes && (
                    <p className="text-xs text-slate-600 bg-slate-50 rounded-lg p-2.5 break-words">{item.observacoes}</p>
                  )}
                  {item.motivo_recusa && (
                    <p className="text-xs text-rose-600 font-medium break-words">{item.status === 'PENDENTE' ? 'Recusa anterior' : 'Motivo'}: {item.motivo_recusa}</p>
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
                        {url && a.tipo?.startsWith('video/') && <video controls playsInline preload="metadata" src={url} className="w-full max-h-72 rounded-lg bg-black" />}

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
            {preview.tipo?.startsWith('video/') && (
              <video controls autoPlay playsInline src={preview.url} className="max-w-full max-h-full rounded-lg bg-black" />
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
                <label htmlFor="solicitante" className="block text-xs font-semibold text-slate-600 mb-1">Funcionário solicitante *</label>
                <select
                  id="solicitante"
                  required
                  value={form.solicitante}
                  onChange={(e) => setForm({ ...form, solicitante: e.target.value })}
                  className={`w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none ${form.solicitante ? 'border-slate-300' : 'border-amber-300 text-slate-500'}`}
                >
                  <option value="" disabled>Escolha quem está pedindo</option>
                  {(form.solicitante && !funcionarios.includes(form.solicitante)
                    ? [form.solicitante, ...funcionarios]
                    : funcionarios
                  ).map((n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
                {!editandoId && form.solicitante && (
                  <p className="text-[11px] text-slate-400 mt-1">Fica lembrado neste aparelho para as próximas solicitações.</p>
                )}
              </div>

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
                  placeholder={nomeStatus === 'buscando' ? 'Buscando...' : nomeStatus === 'nao_encontrado' ? 'Digite o nome do cliente' : 'Preenchido ao digitar o código'}
                  value={form.nome_cliente}
                  onChange={(e) => {
                    nomeAutoRef.current = false;
                    setForm({ ...form, nome_cliente: e.target.value });
                  }}
                  className={`w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:outline-none transition-colors ${
                    nomeStatus === 'encontrado' || nomeStatus === 'cadastrado'
                      ? 'border-emerald-300 bg-emerald-50/50 focus:ring-emerald-500'
                      : nomeStatus === 'nao_encontrado'
                      ? 'border-amber-300 focus:ring-amber-400'
                      : 'border-slate-300 focus:ring-indigo-500'
                  }`}
                />
                {nomeStatus === 'encontrado' && (
                  <p className="fade-in text-[11px] text-emerald-600 mt-1">Cliente encontrado na lista.</p>
                )}
                {nomeStatus === 'cadastrado' && (
                  <p className="fade-in text-[11px] text-emerald-600 mt-1">Cliente cadastrado na lista. Das próximas vezes o nome já vem preenchido.</p>
                )}
                {nomeStatus === 'nao_encontrado' && (
                  <div className="fade-in mt-1.5 rounded-lg border border-amber-200 bg-amber-50 p-2.5 space-y-2">
                    <p className="text-[11px] text-amber-700">
                      Código <b>{form.cod_liberacao}</b> não está na lista. Digite o nome acima e cadastre o cliente. Se enviar sem cadastrar, ele é cadastrado junto com a solicitação.
                    </p>
                    <button
                      type="button"
                      onClick={() => cadastrarCliente(form.cod_liberacao, form.nome_cliente)}
                      disabled={cadastrandoCliente || form.nome_cliente.trim().length < 2}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold text-white bg-amber-600 hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
                    >
                      {cadastrandoCliente ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <UserCheck className="w-3.5 h-3.5" />}
                      {cadastrandoCliente ? 'Cadastrando...' : 'Cadastrar cliente na lista'}
                    </button>
                  </div>
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
                  inputMode="numeric"
                  autoComplete="off"
                  list="lista-rcas-portal"
                  placeholder="Ex: 1203"
                  value={form.rca}
                  onChange={(e) => setForm({ ...form, rca: e.target.value.replace(/\s+-.*$/, '').trim() })}
                  className={`w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:outline-none transition-colors ${
                    form.rca.trim() && rcaDoPortal(form.rca)
                      ? 'border-emerald-300 bg-emerald-50/50 focus:ring-emerald-500'
                      : form.rca.trim().length >= 4 && rcasPortal.length
                      ? 'border-amber-300 focus:ring-amber-400'
                      : 'border-slate-300 focus:ring-indigo-500'
                  }`}
                />
                <datalist id="lista-rcas-portal">
                  {rcasPortal.map((r) => <option key={r.cod} value={r.cod}>{r.cod} - {r.nome}</option>)}
                </datalist>
                {form.rca.trim() && rcaDoPortal(form.rca) && (
                  <p className="fade-in text-[11px] text-emerald-600 mt-1">{rcaDoPortal(form.rca).nome} · será notificado no portal.</p>
                )}
                {form.rca.trim().length >= 4 && rcasPortal.length > 0 && !rcaDoPortal(form.rca) && (
                  <p className="fade-in text-[11px] text-amber-600 mt-1">RCA {form.rca.trim()} não está cadastrado no Portal do Representante: a resposta não chega até ele.</p>
                )}
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
                <label className="block text-xs font-semibold text-slate-600 mb-1">Anexos (imagem, áudio, vídeo ou PDF)</label>
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
            <p className="text-xs text-slate-500 mb-2">RCA: {modalAprovacao.rca}{modalAprovacao.solicitante ? ` · Solicitante: ${modalAprovacao.solicitante}` : ''}</p>
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

            {blocoHistorico(modalAprovacao)}

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

              {modalAprovacao.status !== 'PENDENTE' && (
                <button
                  type="button"
                  onClick={() => pedirReabrir(modalAprovacao)}
                  className="w-full inline-flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-sm font-semibold bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100 transition"
                >
                  <RotateCcw className="w-4 h-4" /> Reabrir para análise
                </button>
              )}

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
            <p className="text-xs text-slate-500 mb-2">RCA: {modalDetalhe.rca}{modalDetalhe.solicitante ? ` · Solicitante: ${modalDetalhe.solicitante}` : ''}</p>
            <div className="mb-3 flex items-center gap-2 flex-wrap">{pilulaTipo(modalDetalhe.tipo_solicitacao)} {badge(modalDetalhe)}</div>
            {modalDetalhe.observacoes && (
              <div className="bg-slate-50 p-3 rounded-lg text-xs text-slate-700 border border-slate-200 mb-3">
                <strong>Observações:</strong> {modalDetalhe.observacoes}
              </div>
            )}
            {modalDetalhe.motivo_recusa && (
              <div className="bg-rose-50 p-3 rounded-lg text-xs text-rose-700 border border-rose-200 mb-3">
                <strong>{modalDetalhe.status === 'PENDENTE' ? 'Motivo da recusa anterior:' : 'Motivo da recusa:'}</strong> {modalDetalhe.motivo_recusa}
              </div>
            )}
            {blocoHistorico(modalDetalhe)}
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
            {modalDetalhe.status !== 'PENDENTE' && (
              <button
                type="button"
                onClick={() => pedirReabrir(modalDetalhe)}
                className="w-full mb-3 inline-flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-sm font-semibold bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100 transition"
              >
                <RotateCcw className="w-4 h-4" /> Reabrir para análise
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

      {/* PEDIDO DE PERMISSÃO DOS AVISOS */}
      {avisosPerm === 'default' && !bannerAvisosFechado && (
        <div className="fixed inset-x-0 bottom-4 z-40 flex justify-center px-4 pointer-events-none">
          <div className="fade-up pointer-events-auto w-full max-w-md bg-white border border-indigo-200 rounded-2xl shadow-xl p-4 flex items-start gap-3">
            <span className="p-2 bg-indigo-50 text-indigo-600 rounded-lg shrink-0">
              <Bell className="w-5 h-5" />
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-slate-800">Ativar avisos de novidades?</p>
              <p className="text-xs text-slate-500 mt-0.5">
                Você será avisado no canto da tela, com som, mesmo quando o app estiver em segundo plano.
              </p>
              <div className="flex gap-2 mt-3">
                <button
                  onClick={ativarAvisos}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white transition"
                >
                  Ativar avisos
                </button>
                <button
                  onClick={adiarAvisos}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-100 transition"
                >
                  Agora não
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* PRÉ-VISUALIZAÇÃO AO PASSAR O MOUSE */}
      {previa && (
        <div
          ref={previaRef}
          className="fade-in fixed z-[60] max-w-sm bg-slate-900 text-white text-xs rounded-lg shadow-xl border border-slate-600 px-3 py-2 pointer-events-none"
          style={{ left: previa.x + 14, top: previa.y + 18 }}
        >
          <p className="text-[10px] font-semibold uppercase tracking-wider text-indigo-300 mb-1">{previa.titulo}</p>
          <p className="whitespace-pre-wrap break-words leading-relaxed">{previa.texto}</p>
        </div>
      )}

      {/* POP-UP DE CONFIRMAÇÃO (com fade) */}
      {confirmacao && <ConfirmarModal cfg={confirmacao} onClose={() => setConfirmacao(null)} />}
    </div>
  );
}
