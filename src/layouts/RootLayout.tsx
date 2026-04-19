import { type ReactElement, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Toaster } from 'sonner';

import Footer from '@/layouts/parts/Footer';
import Header from '@/layouts/parts/Header';
import Website from '@/layouts/Website';
import AIChatAssistant from '@/components/AIChatAssistant';
import { MediaProvider } from '@/context/MediaContext';
import { ProfileProvider, useProfile } from '@/context/ProfileContext';
import { ThemeProvider } from '@/context/ThemeContext';

interface RootLayoutProps {
  children: ReactElement;
}

/** Redirects to /profiles if no profile has been selected yet */
function ProfileGuard({ children }: { children: ReactElement }) {
  const { activeProfile } = useProfile();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    // Don't redirect if already on /profiles
    if (!activeProfile && location.pathname !== '/profiles') {
      navigate('/profiles', { replace: true });
    }
  }, [activeProfile, location.pathname, navigate]);

  return children;
}

export default function RootLayout({ children }: RootLayoutProps) {
  const location = useLocation();
  const isPlayer = location.pathname.startsWith('/player/');
  const isProfiles = location.pathname === '/profiles';

  return (
    <ThemeProvider>
      <ProfileProvider>
        <MediaProvider>
          <Website>
            {!isPlayer && !isProfiles && <Header />}
            <ProfileGuard>
              {children}
            </ProfileGuard>
            {!isPlayer && !isProfiles && <Footer />}
            {!isProfiles && <AIChatAssistant />}
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
      </ProfileProvider>
    </ThemeProvider>
  );
}
