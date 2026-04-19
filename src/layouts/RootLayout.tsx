import { type ReactElement } from 'react';
import { useLocation } from 'react-router-dom';
import { Toaster } from 'sonner';

import Footer from '@/layouts/parts/Footer';
import Header from '@/layouts/parts/Header';
import Website from '@/layouts/Website';
import AIChatAssistant from '@/components/AIChatAssistant';
import { MediaProvider } from '@/context/MediaContext';

interface RootLayoutProps {
  children: ReactElement;
}

export default function RootLayout({ children }: RootLayoutProps) {
  const location = useLocation();
  const isPlayer = location.pathname.startsWith('/player/');

  return (
    <MediaProvider>
      <Website>
        {!isPlayer && <Header />}
        {children}
        {!isPlayer && <Footer />}
        <AIChatAssistant />
        <Toaster
          theme="dark"
          position="bottom-left"
          toastOptions={{
            style: {
              background: 'hsl(var(--card))',
              border: '1px solid hsl(var(--border))',
              color: 'hsl(var(--foreground))',
            },
          }}
        />
      </Website>
    </MediaProvider>
  );
}
