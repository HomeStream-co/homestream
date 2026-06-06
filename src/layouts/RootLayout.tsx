import { type ReactElement } from 'react';
import { useLocation } from 'react-router-dom';
import { Toaster } from 'sonner';

import Footer from '@/layouts/parts/Footer';
import Header from '@/layouts/parts/Header';
import Website from '@/layouts/Website';
import { AuthProvider } from '@/context/AuthContext';
import { ProfileProvider } from '@/context/ProfileContext';
import { ThemeProvider } from '@/context/ThemeContext';
import { MediaProvider } from '@/context/MediaContext';
import { TMDBProvider } from '@/context/TMDBContext';

interface RootLayoutProps {
  children: ReactElement;
}

function AppShell({ children }: { children: ReactElement }) {
  const location = useLocation();
  const isPlayer = location.pathname.startsWith('/player');
  const isProfiles = location.pathname === '/profiles';
  const hideChrome = isPlayer || isProfiles;

  return (
    <Website>
      <>
        {!hideChrome && <Header />}
        {children}
        {!hideChrome && <Footer />}
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
      </>
    </Website>
  );
}

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <AuthProvider>
      <ProfileProvider>
        <ThemeProvider>
          <MediaProvider>
            <TMDBProvider>
              <AppShell>{children}</AppShell>
            </TMDBProvider>
          </MediaProvider>
        </ThemeProvider>
      </ProfileProvider>
    </AuthProvider>
  );
}
