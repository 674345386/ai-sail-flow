export type MediaKind = 'image' | 'video';
export type LibrarySort = 'recent' | 'oldest' | 'name';
export type MediaBackup = 'pending' | 'synced' | 'failed';
export type LibraryCounts = Record<MediaKind | 'all', number>;
export type LibraryQuery = { kind?: MediaKind; query?: string; sort?: LibrarySort; cursor?: string; limit?: number };
export type LibraryPage = {
  items: LibraryMedia[];
  counts: LibraryCounts;
  matchingTotal: number;
  nextCursor?: string;
  indexing: boolean;
  warning?: string;
};
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
  backup?: MediaBackup;
  associations?: LibraryMediaAssociation[];
};
export const cloudMediaFolder = (userId: string) => `${userId}/workspace-media`;
