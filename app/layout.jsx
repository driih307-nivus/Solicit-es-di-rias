import './globals.css';
import { Toaster } from 'react-hot-toast';

export const metadata = {
  title: 'Solicitações Diárias',
  description: 'Sistema de gestão e aprovação de solicitações em tempo real',
};

export default function RootLayout({ children }) {
  return (
    <html lang="pt-BR">
      <body className="bg-slate-50 text-slate-900 antialiased min-h-screen">
        <Toaster position="top-right" reverseOrder={false} />
        {children}
      </body>
    </html>
  );
}
