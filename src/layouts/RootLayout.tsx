import { type ReactElement, useEffect, useState } from 'react';
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

// Routes that must always render regardless of setup/auth/profile state.
// /remote — phone QR code lands here; must work before setup is complete.
// /tv     — TV 10-foot UI; opened directly on smart TVs.
// /samsung-tv — Samsung setup guide; shown before any config exists.
const ALWAYS_ACCESSIBLE = ['/remote', '/tv', '/samsung-tv'];

/**
 * SetupGuard — redirects to /setup if the server hasn't been configured yet.
 * Runs a single GET /api/setup check on mount. Skips the check when already
 * on /setup (redirect loop) or on always-accessible routes (/remote, /tv,
 * /samsung-tv) which must render before setup is complete.
 */
function SetupGuard({ children }: { children: ReactElement }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [ready, setReady] = useState(false);

  const bypass = location.pathname === '/setup' || ALWAYS_ACCESSIBLE.includes(location.pathname);

  useEffect(() => {
    // Setup page or always-accessible routes — skip the check entirely
    if (bypass) {
      setReady(true);
      return;
    }
    fetch('/api/setup')
      .then(r => r.json())
      .then((data: { setupComplete?: boolean }) => {
        if (!data.setupComplete) {
          navigate('/setup', { replace: true });
        } else {
          setReady(true);
        }
      })
      .catch(() => {
        // If the check fails, let the app render — don't block on network error
        setReady(true);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!ready && !bypass) return null;
  return children;
}

/** Redirects to /profiles if no profile has been selected yet.
 *  Waits for auth to resolve (authenticated !== null) before redirecting
 *  so we don't race with the LoginGate and produce a blank screen.
 *  Always-accessible routes (/remote, /tv, /samsung-tv) are exempt. */
function ProfileGuard({ children }: { children: ReactElement }) {
  const { activeProfile } = useProfile();
  const { authenticated } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    // Don't redirect while auth is still resolving — avoids blank-screen race
    if (authenticated === null) return;
    // Always-accessible routes don't need a profile
    if (ALWAYS_ACCESSIBLE.includes(location.pathname)) return;
    if (!activeProfile && location.pathname !== '/profiles') {
      navigate('/profiles', { replace: true });
    }
  }, [activeProfile, authenticated, location.pathname, navigate]);

  return children;
}

/** Wraps children with TMDBProvider, passing library genres for personalised recs */
function TMDBWrapper({ children }: { children: ReactElement }) {
  const { library } = useMedia();
  const genres = Array.from(new Set(library.flatMap(m => m.genre ?? [])));
  return <TMDBProvider libraryGenres={genres}>{children}</TMDBProvider>;
}

/** Shows LoginGate if admin password is set and session is not valid.
 *  The /setup route and always-accessible routes bypass auth entirely. */
function AuthGate({ children }: { children: ReactElement }) {
  const { authenticated } = useAuth();
  const location = useLocation();

  // Setup wizard and phone/TV routes are always accessible — no auth required
  if (location.pathname === '/setup' || ALWAYS_ACCESSIBLE.includes(location.pathname)) return children;

  // Still checking — render nothing to avoid flash
  if (authenticated === null) return null;

  // Not authenticated — show login wall
  if (authenticated === false) return <LoginGate />;

  return children;
}

export default function RootLayout({ children }: RootLayoutProps) {
  const location = useLocation();
  const isPlayer   = location.pathname.startsWith('/player/');
  const isProfiles = location.pathname === '/profiles';
  const isSetup    = location.pathname === '/setup';
  // Always-accessible full-screen routes — no header, footer, auth, or profile guard
  const isAlwaysAccessible = ALWAYS_ACCESSIBLE.includes(location.pathname);

  // Global listener: phone Browse tab sends 'launch' → navigate TV to player
  useGlobalRemoteLaunch();

  return (
    <ProfileProvider>
      <AuthProvider>
        <ThemeProvider>
          <MediaProvider>
            <TMDBWrapper>
              <Website>
                {isSetup || isAlwaysAccessible ? (
                  // Setup wizard + phone/TV routes: no header, footer, auth, or profile guard
                  children
                ) : (
                  <SetupGuard>
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
                  </SetupGuard>
                )}
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
