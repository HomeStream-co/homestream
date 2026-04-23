/**
 * GET /api/jellyfin/Users/:userId
 *
 * Returns a single user object. TV apps call this after login to
 * verify the session and get user preferences.
 */
import type { Request, Response } from 'express';

export default function handler(req: Request, res: Response) {
  try {
    const { userId } = req.params;

    // HomeStream only has one user — the admin
    if (userId !== 'homestream-admin' && userId !== 'me') {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      Name: 'Admin',
      ServerId: 'homestream-server-001',
      Id: 'homestream-admin',
      HasPassword: true,
      HasConfiguredPassword: true,
      EnableAutoLogin: false,
      LastLoginDate: new Date().toISOString(),
      LastActivityDate: new Date().toISOString(),
      Policy: {
        IsAdministrator: true,
        IsHidden: false,
        IsDisabled: false,
        EnableMediaPlayback: true,
        EnableAudioPlaybackTranscoding: true,
        EnableVideoPlaybackTranscoding: true,
        EnablePlaybackRemuxing: true,
        EnableContentDownloading: true,
        EnableAllDevices: true,
        EnableAllFolders: true,
        InvalidLoginAttemptCount: 0,
        MaxActiveSessions: 0,
      },
      Configuration: {
        PlayDefaultAudioTrack: true,
        SubtitleLanguagePreference: 'eng',
        SubtitleMode: 'Default',
        EnableNextEpisodeAutoPlay: true,
        RememberAudioSelections: true,
        RememberSubtitleSelections: true,
        HidePlayedInLatest: true,
      },
    });
  } catch (err) {
    console.error('[jellyfin] Users/:userId GET error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}
