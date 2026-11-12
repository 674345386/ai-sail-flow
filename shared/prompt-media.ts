export type PromptMediaKind = 'image' | 'video' | 'audio';
const imageTypes = ['image/jpeg', 'image/png', 'image/webp'];
const videoTypes = ['video/mp4', 'video/quicktime', 'video/webm'];
const audioTypes = ['audio/mpeg', 'audio/mp3', 'audio/mp4', 'audio/x-m4a', 'audio/wav', 'audio/x-wav', 'audio/wave', 'audio/vnd.wave', 'audio/aac', 'audio/flac', 'audio/x-flac', 'audio/ogg', 'audio/opus', 'audio/webm'];
export const promptMediaAccept = [...imageTypes, ...videoTypes, ...audioTypes, '.jpg', '.jpeg', '.png', '.webp', '.mp4', '.mov', '.webm', '.mp3', '.m4a', '.wav', '.aac', '.flac', '.ogg', '.opus'].join(',');
export const promptMediaLimits = {
  image: { count: 3, bytes: 10 * 1024 * 1024 },
  video: { count: 1, bytes: 250 * 1024 * 1024 },
  audio: { count: 1, bytes: 50 * 1024 * 1024 },
};

export function promptMediaKind(file: Pick<File, 'type' | 'name'>): PromptMediaKind | null {
  if (imageTypes.includes(file.type)) return 'image';
  if (videoTypes.includes(file.type)) return 'video';
  if (audioTypes.includes(file.type)) return 'audio';
  if (file.type && file.type !== 'application/octet-stream') return null;
  if (/\.(jpe?g|png|webp)$/i.test(file.name)) return 'image';
  if (/\.(mp4|mov|webm)$/i.test(file.name)) return 'video';
  if (/\.(mp3|m4a|wav|aac|flac|ogg|opus)$/i.test(file.name)) return 'audio';
  return null;
}

export function validatePromptMedia(files: File[], existing: PromptMediaKind[]): 'formats' | 'tooLarge' | 'tooMany' | null {
  const entries = files.map(file => ({ file, kind: promptMediaKind(file) }));
  if (entries.some(item => !item.kind)) return 'formats';
  if (entries.some(item => item.file.size > promptMediaLimits[item.kind!].bytes)) return 'tooLarge';
  for (const kind of ['image', 'video', 'audio'] as const) {
    if (existing.filter(value => value === kind).length + entries.filter(item => item.kind === kind).length > promptMediaLimits[kind].count) return 'tooMany';
  }
  return null;
}

/** Browsers expose pasted screenshots/files through files, items, or both. */
export function clipboardMediaFiles(clipboard: Pick<DataTransfer, 'files' | 'items'>): File[] {
  if (clipboard.files.length) return Array.from(clipboard.files);
  return Array.from(clipboard.items).filter(item => item.kind === 'file')
    .map(item => item.getAsFile()).filter((file): file is File => file !== null);
}
