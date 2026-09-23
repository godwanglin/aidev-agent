'use client';

import React from 'react';
import { Folder, FolderOpen } from 'lucide-react';

interface FolderIconProps {
  isOpen?: boolean;
  className?: string;
}

export const FolderIcon: React.FC<FolderIconProps> = ({
  isOpen = false,
  className = 'w-3.5 h-3.5',
}) => {
  if (isOpen) {
    return <FolderOpen className={className} />;
  }

  return <Folder className={className} />;
};
