import { type ReactElement, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
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

/** On first load, if setup hasn't been completed, redirect to /setup */
function FirstRunGuard() {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    // Don't redirect if already on /setup or /profiles
    if (location.pathname === '/setup' || location.pathname === '/profiles') return;

    fetch('/api/setup', { credentials: 'include' })
      .then(r => r.json())
      .then((data: { setupComplete?: boolean }) => {
        if (data.setupComplete === false) {
          navigate('/setup', { replace: true });
        }
      })
      .catch(() => { /* non-fatal — stay on current page */ });
  // Only run once on mount
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}

function AppShell({ children }: { children: ReactElement }) {
  const location = useLocation();
  const isPlayer = location.pathname.startsWith('/player');
  const isProfiles = location.pathname === '/profiles';
  const isSetup = location.pathname === '/setup';
  const hideChrome = isPlayer || isProfiles || isSetup;

  // Scroll to top on every route change
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [location.pathname]);

  return (
    <Website>
      <>
        <FirstRunGuard />
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
