import { execAsync } from './execHelper.js';

export interface HwEncoder {
  encoder: 'h264_nvenc' | 'h264_vaapi' | 'h264_videotoolbox' | 'h264_qsv' | 'h264_amf' | 'libx264';
  label: string;
}

let _cached: HwEncoder | null = null;

export async function detectHwEncoder(): Promise<HwEncoder> {
  if (_cached !== null) return _cached;

  try {
    const { stdout } = await execAsync('ffmpeg -encoders 2>&1', { timeout: 5000 });
    if (stdout.includes('h264_nvenc')) {
      _cached = { encoder: 'h264_nvenc', label: 'NVENC' };
      return _cached;
    }
    if (stdout.includes('h264_vaapi')) {
      _cached = { encoder: 'h264_vaapi', label: 'VAAPI' };
      return _cached;
    }
    if (stdout.includes('h264_videotoolbox')) {
      _cached = { encoder: 'h264_videotoolbox', label: 'VideoToolbox' };
      return _cached;
    }
    if (stdout.includes('h264_qsv')) {
      _cached = { encoder: 'h264_qsv', label: 'QSV' };
      return _cached;
    }
    if (stdout.includes('h264_amf')) {
      _cached = { encoder: 'h264_amf', label: 'AMF' };
      return _cached;
    }
  } catch {
    // ffmpeg not available
  }

  _cached = { encoder: 'libx264', label: 'software (libx264)' };
  return _cached;
}
