// Comprime um vídeo no próprio aparelho antes de enviar (sem servidor):
// toca o vídeo escondido, redesenha em no máximo 1280 px (720p) e grava de novo com taxa menor.
// Leva mais ou menos o tempo do vídeo. Se não der certo ou não diminuir, devolve o arquivo original.

const MAX_LADO = 1280;          // 720p
const VIDEO_BPS = 1_200_000;    // ~1,2 Mbps: boa nitidez para celular
const AUDIO_BPS = 96_000;
const NAO_COMPRIMIR_ABAIXO = 3 * 1024 * 1024; // vídeos pequenos já vão direto

export function podeComprimirVideo() {
  return typeof window !== 'undefined' && typeof window.MediaRecorder !== 'undefined' &&
    typeof HTMLCanvasElement !== 'undefined' && !!HTMLCanvasElement.prototype.captureStream;
}

function formatoSaida() {
  const opcoes = [
    ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'mp4'],
    ['video/mp4', 'mp4'],
    ['video/webm;codecs=vp9,opus', 'webm'],
    ['video/webm;codecs=vp8,opus', 'webm'],
    ['video/webm', 'webm']
  ];
  return opcoes.find(([m]) => MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(m)) || null;
}

export async function comprimirVideo(file, onProgresso) {
  if (!file || file.size < NAO_COMPRIMIR_ABAIXO || !podeComprimirVideo()) return { file, comprimido: false };
  const formato = formatoSaida();
  if (!formato) return { file, comprimido: false };

  const url = URL.createObjectURL(file);
  const video = document.createElement('video');
  video.src = url;
  video.playsInline = true;
  video.preload = 'auto';
  video.style.cssText = 'position:fixed;left:-9999px;top:0;width:2px;height:2px;opacity:0;pointer-events:none';
  document.body.appendChild(video);

  let ctxAudio = null;
  try {
    await new Promise((ok, erro) => { video.onloadedmetadata = ok; video.onerror = () => erro(new Error('vídeo ilegível')); });
    const w0 = video.videoWidth, h0 = video.videoHeight, dur = video.duration;
    if (!w0 || !h0 || !isFinite(dur) || dur <= 0) throw new Error('sem dimensões');
    const esc = Math.min(1, MAX_LADO / Math.max(w0, h0));
    const w = Math.round(w0 * esc / 2) * 2, h = Math.round(h0 * esc / 2) * 2;

    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const g = canvas.getContext('2d');
    const stream = canvas.captureStream(30);

    // som: passa pelo AudioContext (não sai no alto-falante, só vai para a gravação)
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      ctxAudio = new AC();
      const fonte = ctxAudio.createMediaElementSource(video);
      const destino = ctxAudio.createMediaStreamDestination();
      fonte.connect(destino);
      destino.stream.getAudioTracks().forEach((t) => stream.addTrack(t));
    } catch (e) { video.muted = true; }

    const rec = new MediaRecorder(stream, { mimeType: formato[0], videoBitsPerSecond: VIDEO_BPS, audioBitsPerSecond: AUDIO_BPS });
    const partes = [];
    rec.ondataavailable = (e) => { if (e.data && e.data.size) partes.push(e.data); };
    const terminou = new Promise((ok) => { rec.onstop = ok; });

    let ativo = true;
    const desenhar = () => {
      if (!ativo) return;
      g.drawImage(video, 0, 0, w, h);
      if (onProgresso) onProgresso(Math.min(99, Math.round((video.currentTime / dur) * 100)));
      if (video.requestVideoFrameCallback) video.requestVideoFrameCallback(desenhar);
      else requestAnimationFrame(desenhar);
    };

    rec.start(1000);
    if (ctxAudio && ctxAudio.state === 'suspended') await ctxAudio.resume();
    await video.play();
    desenhar();
    await new Promise((ok) => { video.onended = ok; });
    ativo = false;
    rec.stop();
    await terminou;

    const tipo = formato[0].split(';')[0];
    const blob = new Blob(partes, { type: tipo });
    if (!blob.size || blob.size >= file.size * 0.9) return { file, comprimido: false };
    const nome = file.name.replace(/\.[^.]+$/, '') + '.' + formato[1];
    if (onProgresso) onProgresso(100);
    return { file: new File([blob], nome, { type: tipo, lastModified: Date.now() }), comprimido: true, antes: file.size };
  } catch (e) {
    console.log('Compressão de vídeo:', e);
    return { file, comprimido: false };
  } finally {
    try { video.pause(); } catch (e) {}
    video.remove();
    URL.revokeObjectURL(url);
    if (ctxAudio) { try { ctxAudio.close(); } catch (e) {} }
  }
}
