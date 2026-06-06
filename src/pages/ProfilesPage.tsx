import { useState } from 'react';
import { Helmet } from '@dr.pogodin/react-helmet';
import { Users, Plus, Check, Lock, Baby, User } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useProfile } from '@/context/ProfileContext';
import PinLock from '@/components/PinLock';

export default function ProfilesPage() {
  const { profiles, activeProfile, setActiveProfile } = useProfile();
  const navigate = useNavigate();
  const [pinTarget, setPinTarget] = useState<string | null>(null);

  const handleSelect = (profileId: string) => {
    const profile = profiles.find(p => p.id === profileId);
    if (!profile) return;
    if (profile.hasPin) {
      setPinTarget(profileId);
    } else {
      setActiveProfile(profileId);
      navigate('/');
    }
  };

  const handlePinSuccess = () => {
    if (pinTarget) {
      setActiveProfile(pinTarget);
      setPinTarget(null);
      navigate('/');
    }
  };

  return (
    <>
      <Helmet>
        <title>Profiles — HomeStream</title>
        <meta name="description" content="Select or manage your HomeStream profile." />
      </Helmet>

      <div className="min-h-screen bg-background flex flex-col items-center justify-center px-6 py-16">
        <div className="mb-10 text-center">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto mb-4">
            <Users className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-3xl font-heading text-foreground">Who&apos;s watching?</h1>
          <p className="text-muted-foreground text-sm mt-1">Select a profile to continue</p>
        </div>

        <div className="flex flex-wrap justify-center gap-6 max-w-2xl">
          {profiles.map(profile => {
            const isActive = activeProfile?.id === profile.id;
            const isKids = profile.id === 'kids';
            return (
              <button
                key={profile.id}
                onClick={() => handleSelect(profile.id)}
                className={`flex flex-col items-center gap-3 p-5 rounded-2xl border transition-all group w-36 ${
                  isActive
                    ? 'border-primary bg-primary/10'
                    : 'border-border bg-card hover:border-primary/40 hover:bg-card/80'
                }`}
              >
                <div className={`w-16 h-16 rounded-2xl flex items-center justify-center text-2xl relative ${isKids ? 'bg-pink-500/20' : 'bg-primary/15'}`}>
                  {isKids ? <Baby className="w-8 h-8 text-pink-400" /> : <User className="w-8 h-8 text-primary" />}
                  {profile.hasPin && (
                    <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-card border border-border flex items-center justify-center">
                      <Lock className="w-2.5 h-2.5 text-muted-foreground" />
                    </div>
                  )}
                  {isActive && (
                    <div className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-primary flex items-center justify-center">
                      <Check className="w-2.5 h-2.5 text-primary-foreground" />
                    </div>
                  )}
                </div>
                <div className="text-center">
                  <p className={`text-sm font-semibold ${isActive ? 'text-primary' : 'text-foreground'}`}>{profile.name}</p>
                  {isKids && <p className="text-[10px] text-muted-foreground">Kids mode</p>}
                  {isActive && <p className="text-[10px] text-primary">Active</p>}
                </div>
              </button>
            );
          })}

          {/* Add profile placeholder */}
          <button className="flex flex-col items-center gap-3 p-5 rounded-2xl border border-dashed border-border hover:border-primary/40 transition-all w-36 text-muted-foreground hover:text-foreground">
            <div className="w-16 h-16 rounded-2xl bg-muted/50 flex items-center justify-center">
              <Plus className="w-8 h-8" />
            </div>
            <p className="text-sm font-medium">Add Profile</p>
          </button>
        </div>

        {activeProfile && (
          <button
            onClick={() => navigate('/')}
            className="mt-10 px-6 py-3 bg-primary hover:bg-primary/80 text-primary-foreground font-semibold rounded-xl transition-all"
          >
            Continue as {activeProfile.name}
          </button>
        )}
      </div>

      {pinTarget && (
        <PinLock
          profileName={profiles.find(p => p.id === pinTarget)?.name}
          onSuccess={handlePinSuccess}
          onCancel={() => setPinTarget(null)}
        />
      )}
    </>
  );
}
