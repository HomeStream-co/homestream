/**
 * POST /api/jellyfin/Users/AuthenticateByName
 *
 * Jellyfin-compatible authentication endpoint.
 * TV apps (Infuse, Jellyfin for Roku, Fire TV, etc.) call this to log in.
 *
 * Request body: { Username: string, Pw: string }
 * Response: Jellyfin-format auth result with AccessToken and User object
 */
import type { Request, Response } from 'express';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { readConfig } from '../../../../configStore.js';

// In-memory token store shared with Jellyfin session endpoints
export const jellyfinTokens = new Map<string, { userId: string; expiresAt: number }>();
const TOKEN_TTL = 30 * 24 * 60 * 60 * 1000; // 30 days

const SERVER_ID = 'homestream-server-001';
const SERVER_NAME = 'HomeStream';

function isBcryptHash(s: string): boolean {
  return /^\$2[aby]\$\d{2}\$/.test(s);
}

export default async function handler(req: Request, res: Response) {
  try {
    const { Username, Pw } = req.body as { Username?: string; Pw?: string };

    if (!Username || Pw === undefined) {
      return res.status(400).json({ error: 'Username and Pw required' });
    }

    const cfg = readConfig();
    const storedPassword = cfg.adminPassword || '';

    // Validate password
    let valid = false;
    if (!storedPassword) {
      // Open mode — no password set
      valid = true;
    } else if (isBcryptHash(storedPassword)) {
      valid = await bcrypt.compare(Pw, storedPassword);
    } else {
      valid = Pw === storedPassword;
    }

    if (!valid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Generate access token
    const token = crypto.randomBytes(32).toString('hex');
    jellyfinTokens.set(token, {
      userId: 'homestream-admin',
      expiresAt: Date.now() + TOKEN_TTL,
    });

    // Return Jellyfin-format response
    res.json({
      User: {
        Name: Username,
        ServerId: SERVER_ID,
        Id: 'homestream-admin',
        HasPassword: !!storedPassword,
        HasConfiguredPassword: !!storedPassword,
        EnableAutoLogin: false,
        LastLoginDate: new Date().toISOString(),
        LastActivityDate: new Date().toISOString(),
        Policy: {
          IsAdministrator: true,
          IsHidden: false,
          IsDisabled: false,
          EnableRemoteControlOfOtherUsers: true,
          EnableSharedDeviceControl: true,
          EnableRemoteAccess: true,
          EnableLiveTvManagement: false,
          EnableLiveTvAccess: false,
          EnableMediaPlayback: true,
          EnableAudioPlaybackTranscoding: true,
          EnableVideoPlaybackTranscoding: true,
          EnablePlaybackRemuxing: true,
          EnableContentDeletion: false,
          EnableContentDownloading: true,
          EnableSyncTranscoding: true,
          EnableMediaConversion: true,
          EnableAllDevices: true,
          EnableAllChannels: false,
          EnableAllFolders: true,
          InvalidLoginAttemptCount: 0,
          LoginAttemptsBeforeLockout: -1,
          MaxActiveSessions: 0,
          EnablePublicSharing: false,
          BlockedTags: [],
          AllowedTags: [],
          BlockUnratedItems: [],
          RestrictedFeatures: [],
        },
        Configuration: {
          PlayDefaultAudioTrack: true,
          SubtitleLanguagePreference: '',
          DisplayMissingEpisodes: false,
          GroupedFolders: [],
          SubtitleMode: 'Default',
          DisplayCollectionsView: false,
          EnableLocalPassword: false,
          OrderedViews: [],
          LatestItemsExcludes: [],
          MyMediaExcludes: [],
          HidePlayedInLatest: true,
          RememberAudioSelections: true,
          RememberSubtitleSelections: true,
          EnableNextEpisodeAutoPlay: true,
        },
      },
      SessionInfo: {
        UserId: 'homestream-admin',
        UserName: Username,
        Client: 'HomeStream',
        LastActivityDate: new Date().toISOString(),
        DeviceName: 'HomeStream Server',
        DeviceId: SERVER_ID,
        ApplicationVersion: '1.0.0',
        Id: crypto.randomBytes(16).toString('hex'),
        ServerId: SERVER_ID,
      },
      AccessToken: token,
      ServerId: SERVER_ID,
      ServerName: SERVER_NAME,
    });
  } catch (err) {
    res.status(500).json({ error: 'Authentication failed', message: String(err) });
  }
}
