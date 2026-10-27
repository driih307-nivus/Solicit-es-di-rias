import './globals.css';
import { Toaster } from 'react-hot-toast';

const aprovador = process.env.NEXT_PUBLIC_PERFIL === 'aprovador';

export const metadata = {
  title: `${aprovador ? 'Aprovador' : 'Solicitante'} — Solicitações Diárias`,
  description: 'Sistema de gestão e aprovação de solicitações em tempo real',
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#4f46e5',
};

export default function RootLayout({ children }) {
  return (
    <html lang="pt-BR">
      <body className="page-fade bg-slate-50 text-slate-900 antialiased min-h-screen">
        <Toaster position="top-center" reverseOrder={false} />
        {children}
      </body>
    </html>
  );
}
