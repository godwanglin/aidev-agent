'use client';

export interface FileTreeNode {
  id: string;
  name: string;
  path: string;
  type: 'file' | 'directory';
  children?: FileTreeNode[];
  extension?: string;
  isModified?: boolean;
}

export interface FileExplorerSidebarProps {
  workdir: string;
  projectName?: string;
  files: string[];
  activeFilePath?: string;
  changedFiles?: Array<{ filePath?: string; path?: string; status?: string }>;
  isOpen: boolean;
  width: number;
  onToggleOpen: () => void;
  onWidthChange: (newWidth: number) => void;
  onOpenFile: (filePath: string) => void;
  onRefresh?: () => Promise<void> | void;
}

export interface FileTreeItemProps {
  node: FileTreeNode;
  level: number;
  expandedFolders: Set<string>;
  activeFilePath?: string;
  searchQuery?: string;
  onToggleFolder: (path: string) => void;
  onOpenFile: (path: string) => void;
}
