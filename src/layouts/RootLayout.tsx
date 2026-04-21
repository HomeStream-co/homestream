import { type ReactElement, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Toaster } from 'sonner';

import Footer from '@/layouts/parts/Footer';
import Header from '@/layouts/parts/Header';
import Website from '@/layouts/Website';
import AIChatAssistant from '@/components/AIChatAssistant';
import LoginGate from '@/components/LoginGate';
import { MediaProvider, useMedia } from '@/context/MediaContext';
import { ProfileProvider, useProfile } from '@/context/ProfileContext';
import { ThemeProvider } from '@/context/ThemeContext';
import { TMDBProvider } from '@/context/TMDBContext';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { useGlobalRemoteLaunch } from '@/hooks/useGlobalRemoteLaunch';

interface RootLayoutProps {
  children: ReactElement;
}

/** Redirects to /profiles if no profile has been selected yet */
function ProfileGuard({ children }: { children: ReactElement }) {
  const { activeProfile } = useProfile();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (!activeProfile && location.pathname !== '/profiles') {
      navigate('/profiles', { replace: true });
    }
  }, [activeProfile, location.pathname, navigate]);

  return children;
}

/** Wraps children with TMDBProvider, passing library genres for personalised recs */
function TMDBWrapper({ children }: { children: ReactElement }) {
  const { library } = useMedia();
  const genres = Array.from(new Set(library.flatMap(m => m.genre ?? [])));
  return <TMDBProvider libraryGenres={genres}>{children}</TMDBProvider>;
}

/** Shows LoginGate if admin password is set and session is not valid */
function AuthGate({ children }: { children: ReactElement }) {
  const { authenticated } = useAuth();

  // Still checking — render nothing to avoid flash
  if (authenticated === null) return null;

  // Not authenticated — show login wall
  if (authenticated === false) return <LoginGate />;

  return children;
}

export default function RootLayout({ children }: RootLayoutProps) {
  const location = useLocation();
  const isPlayer = location.pathname.startsWith('/player/');
  const isProfiles = location.pathname === '/profiles';

  // Global listener: phone Browse tab sends 'launch' → navigate TV to player
  useGlobalRemoteLaunch();

  return (
    <ProfileProvider>
      <AuthProvider>
        <ThemeProvider>
          <MediaProvider>
            <TMDBWrapper>
              <Website>
                <AuthGate>
                  <>
                    {!isPlayer && !isProfiles && <Header />}
                    <ProfileGuard>
                      {children}
                    </ProfileGuard>
                    {!isPlayer && !isProfiles && <Footer />}
                    {!isProfiles && <AIChatAssistant />}
                  </>
                </AuthGate>
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
            </TMDBWrapper>
          </MediaProvider>
        </ThemeProvider>
      </AuthProvider>
    </ProfileProvider>
  );
}
