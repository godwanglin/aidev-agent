'use client';

import React from 'react';
import { getIconForFile, DefaultFileIcon } from '@react-symbols/icons/utils';

export interface AestheticFileIconProps {
  filePath?: string;
  fileName?: string;
  className?: string;
  size?: number | string;
  title?: string;
}

/**
 * Extracts a clean filename from a path, url, or mention string.
 */
export function extractFileName(filePathOrName?: string): string {
  if (!filePathOrName) return '';
  let raw = filePathOrName.trim();

  // Strip file:/// protocol
  if (raw.startsWith('file:///')) {
    raw = raw.replace(/^file:\/\/\/?/, '');
  }

  // Strip leading @ mention
  if (raw.startsWith('@')) {
    raw = raw.slice(1);
  }

  // Strip #L1-40 or :1-40 line numbers
  raw = raw.replace(/(?:#L|:)(\d+)(?:-(\d+))?$/, '');

  // Strip query parameters (?file=...)
  raw = raw.split('?')[0];

  // Get the last path segment (handling both / and \)
  const segments = raw.split(/[\\/]/).filter(Boolean);
  return segments.pop() || raw;
}

/**
 * Aesthetic file icon component powered by VSCode Symbols (@react-symbols/icons).
 * Automatically assigns aesthetic, high-fidelity icons for all programming languages,
 * config files, media files, and tools.
 */
export const AestheticFileIcon: React.FC<AestheticFileIconProps> = ({
  filePath,
  fileName: propFileName,
  className = 'w-3.5 h-3.5 shrink-0',
  size,
}) => {
  const fileName = propFileName || extractFileName(filePath);

  if (!fileName) {
    return <DefaultFileIcon className={className} width={size} height={size} />;
  }

  const iconElement = getIconForFile({
    fileName,
    autoAssign: true,
    className,
    width: size,
    height: size,
  });

  return iconElement || <DefaultFileIcon className={className} width={size} height={size} />;
};
