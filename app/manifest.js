// Manifesto do app instalável (ícone na tela inicial do celular e do computador).
// O mesmo código serve aos dois links: o perfil vem da variável NEXT_PUBLIC_PERFIL de cada projeto na Vercel.
export default function manifest() {
  const aprovador = process.env.NEXT_PUBLIC_PERFIL === 'aprovador';
  const p = aprovador ? 'aprovador' : 'solicitante';
  return {
    name: aprovador ? 'Liberações — Aprovador' : 'Liberações — Solicitante',
    short_name: aprovador ? 'Aprovador' : 'Solicitações',
    description: 'Solicitações diárias de liberação de crédito — Frigolden',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#eef2ff',
    theme_color: '#4f46e5',
    lang: 'pt-BR',
    icons: [
      { src: `/icons/${p}-192.png`, sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: `/icons/${p}-512.png`, sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: `/icons/${p}-maskable-512.png`, sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
