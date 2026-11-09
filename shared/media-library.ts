export type MediaKind = 'image' | 'video';
export type LibraryMediaAssociation = {
  projectId: string;
  projectTitle: string;
  creativeId: string;
  creativeTitle: string;
};
export type LibraryMedia = {
  id: string;
  kind: MediaKind;
  name: string;
  mime: string;
  size: number;
  createdAt: string;
  origin?: 'user-upload';
  url: string;
  thumbnail?: string;
  filename?: string;
  duration?: number;
  width?: number;
  height?: number;
  hasAudio?: boolean;
  cloudPath?: string;
  associations?: LibraryMediaAssociation[];
};
