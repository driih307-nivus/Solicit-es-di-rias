import './globals.css';
import { Toaster } from 'react-hot-toast';

const TEMA_SCRIPT = `(function(){try{var t=localStorage.getItem('sl_tema');var d=t?t==='escuro':window.matchMedia('(prefers-color-scheme: dark)').matches;if(d)document.documentElement.classList.add('dark');}catch(e){}})();`;

const aprovador = process.env.NEXT_PUBLIC_PERFIL === 'aprovador';

export const metadata = {
  title: `${aprovador ? 'Aprovador' : 'Solicitante'} — Solicitações Diárias`,
  description: 'Sistema de gestão e aprovação de solicitações em tempo real',
  // ícone da aba do navegador e da tela inicial (cada perfil tem o seu: aprovador com ✓ verde, solicitante com seta laranja)
  icons: {
    icon: [
      { url: `/icons/${aprovador ? 'aprovador' : 'solicitante'}-48.png`, sizes: '48x48', type: 'image/png' },
      { url: `/icons/${aprovador ? 'aprovador' : 'solicitante'}-192.png`, sizes: '192x192', type: 'image/png' },
    ],
    apple: { url: `/icons/${aprovador ? 'aprovador' : 'solicitante'}-apple-180.png`, sizes: '180x180' },
  },
  appleWebApp: { capable: true, title: aprovador ? 'Aprovador' : 'Solicitações', statusBarStyle: 'default' },
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#4f46e5',
};

export default function RootLayout({ children }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        {/* Aplica o tema salvo antes de desenhar a tela (evita piscar) */}
        <script dangerouslySetInnerHTML={{ __html: TEMA_SCRIPT }} />
      </head>
      <body className="page-fade bg-slate-50 text-slate-900 antialiased min-h-screen">
        <Toaster position="top-center" reverseOrder={false} toastOptions={{ className: 'toast-tema' }} />
        {children}
      </body>
    </html>
  );
}
