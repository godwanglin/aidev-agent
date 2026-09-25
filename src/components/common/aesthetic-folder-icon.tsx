'use client';

import React from 'react';
import {
  getIconForFolder,
  DefaultFolderIcon,
  DefaultFolderOpenedIcon,
} from '@react-symbols/icons/utils';

export interface AestheticFolderIconProps {
  folderName: string;
  isOpen?: boolean;
  className?: string;
  size?: number | string;
}

/**
 * Aesthetic folder icon component powered by VS Code Symbols (@react-symbols/icons).
 * Automatically provides distinct official VS Code folder icons (e.g. src, components,
 * public, api, test, node_modules, etc.) with open and closed states.
 */
export const AestheticFolderIcon: React.FC<AestheticFolderIconProps> = ({
  folderName,
  isOpen = false,
  className = 'w-3.5 h-3.5 shrink-0',
  size,
}) => {
  if (isOpen) {
    return <DefaultFolderOpenedIcon className={className} width={size} height={size} />;
  }

  try {
    const iconElement = getIconForFolder({
      folderName,
      className,
      width: size,
      height: size,
    });

    if (iconElement) {
      return iconElement;
    }
  } catch {
    // Fallback if lookup throws
  }

  return <DefaultFolderIcon className={className} width={size} height={size} />;
};
