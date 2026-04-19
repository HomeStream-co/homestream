/**
 * Profile Selector — /profiles
 *
 * Netflix-style "Who's watching?" screen.
 * Adult profile shows a PIN entry overlay if a PIN has been configured.
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { useProfile, PROFILES, type Profile } from '@/context/ProfileContext';
import PinLock from '@/components/PinLock';

export default function ProfilesPage() {
  const { setActiveProfile, adultPinEnabled } = useProfile();
  const navigate = useNavigate();
  const [pinTarget, setPinTarget] = useState<Profile | null>(null);

  function handleSelect(profile: Profile) {
    if (profile.id === 'adult' && adultPinEnabled) {
      setPinTarget(profile);
    } else {
      setActiveProfile(profile.id);
      navigate('/');
    }
  }

  function handlePinSuccess() {
    if (!pinTarget) return;
    setActiveProfile(pinTarget.id);
    setPinTarget(null);
    navigate('/');
  }

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-4">
      <title>HomeStream — Who's Watching?</title>

      {/* Logo / wordmark */}
      <motion.p
        initial={{ opacity: 0, y: -16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="text-primary font-heading text-3xl font-bold tracking-widest mb-14"
      >
        HOMESTREAM
      </motion.p>

      {/* Heading */}
      <motion.h1
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1, duration: 0.4 }}
        className="text-3xl sm:text-4xl font-heading text-foreground mb-12 tracking-wide"
      >
        Who's watching?
      </motion.h1>

      {/* Profile cards */}
      <div className="flex items-center gap-8 sm:gap-12 flex-wrap justify-center">
        {PROFILES.map((profile, i) => (
          <motion.button
            key={profile.id}
            initial={{ opacity: 0, scale: 0.85, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ delay: 0.15 + i * 0.1, duration: 0.35, ease: 'backOut' as const }}
            whileHover={{ scale: 1.08 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => handleSelect(profile)}
            className="flex flex-col items-center gap-4 group"
          >
            {/* Avatar circle */}
            <div className="relative">
              <div
                className={`
                  w-28 h-28 sm:w-36 sm:h-36 rounded-xl flex items-center justify-center text-5xl sm:text-6xl
                  bg-card border-2 border-transparent
                  group-hover:border-white transition-all duration-200
                  ${profile.id === 'kids' ? 'bg-yellow-950/40' : 'bg-card'}
                `}
              >
                {profile.avatar}
              </div>
              {/* PIN lock badge */}
              {profile.id === 'adult' && adultPinEnabled && (
                <div className="absolute -top-1.5 -right-1.5 w-6 h-6 rounded-full bg-primary flex items-center justify-center shadow-lg">
                  <span className="text-[10px]">🔒</span>
                </div>
              )}
            </div>

            {/* Name */}
            <span className="text-muted-foreground group-hover:text-foreground text-sm font-medium transition-colors tracking-wide">
              {profile.name}
            </span>
          </motion.button>
        ))}
      </div>

      {/* Subtle footer note */}
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5, duration: 0.4 }}
        className="mt-16 text-xs text-muted-foreground/50 text-center max-w-xs"
      >
        Kids profile only shows G and PG rated content.
        Switch profiles anytime from the top menu.
      </motion.p>

      {/* PIN overlay */}
      <AnimatePresence>
        {pinTarget && (
          <PinLock
            profileName={pinTarget.name}
            onSuccess={handlePinSuccess}
            onCancel={() => setPinTarget(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
