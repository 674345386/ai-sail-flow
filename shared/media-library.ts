export type MediaKind = 'image' | 'video';
export type LibraryMedia = {
  id: string;
  kind: MediaKind;
  name: string;
  mime: string;
  size: number;
  createdAt: string;
  url: string;
  thumbnail?: string;
  filename?: string;
  duration?: number;
  width?: number;
  height?: number;
  hasAudio?: boolean;
  cloudPath?: string;
};
