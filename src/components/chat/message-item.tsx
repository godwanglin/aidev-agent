'use client';

import React, { useEffect, useState, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

import { Copy, Check, ListOrdered, FileText, ExternalLink, X, ArrowRight, AlertCircle, AlertTriangle } from 'lucide-react';
import { ReasoningAccordion } from './reasoning-accordion';
import { ToolRow } from './tool-row';
import { FileChip } from './file-chip';
import { SlashChip } from './slash-chip';
import { ImageChip } from './image-chip';
import { CodeRefChip } from './code-ref-chip';
import { QuoteChip } from './quote-chip';
import { ImagePreviewModal } from '@/components/modals/image-preview-modal';
import { FormattedCodeCard } from './formatted-code-card';
import { AgentEmbedCard } from './agent-embed-card';
import { useTheme } from '@/context/theme-context';
import type { MessageRecord } from '@/lib/db';

const KNOWN_EXTENSIONS = new Set([
  'js', 'jsx', 'ts', 'tsx', 'mjs', 'cjs',
  'json', 'py', 'html', 'htm', 'css', 'scss', 'sass', 'less',
  'md', 'mdx', 'sh', 'bash', 'zsh', 'sql',
  'yaml', 'yml', 'toml', 'env', 'prisma',
  'rs', 'go', 'c', 'cpp', 'h', 'hpp', 'java', 'kt', 'rb', 'php',
  'xml', 'svg', 'txt', 'lock', 'config'
]);

export const FRAMEWORK_AND_TECH_IGNORELIST = new Set([
  'next.js', 'node.js', 'react.js', 'vue.js', 'nuxt.js', 'nest.js',
  'express.js', 'three.js', 'd3.js', 'chart.js', 'anime.js', 'electron.js',
  'alpine.js', 'ember.js', 'svelte.js', 'hono.js', 'bun.js', 'phaser.js',
  'p5.js', 'require.js', 'moment.js', 'day.js', 'lodash.js', 'backbone.js',
  'socket.io', 'schema.org', 'w3.org', 'npmjs.com', 'github.com'
]);

export const WELL_KNOWN_ROOT_FILES = new Set([
  'package.json', 'package-lock.json', 'pnpm-lock.yaml', 'yarn.lock', 'bun.lockb',
  'tsconfig.json', 'jsconfig.json',
  'readme.md', 'license', 'dockerfile', 'docker-compose.yml', 'docker-compose.yaml',
  'next.config.js', 'next.config.mjs', 'next.config.ts',
  'vite.config.js', 'vite.config.ts', 'vite.config.mjs',
  'webpack.config.js', 'tailwind.config.js', 'tailwind.config.ts', 'postcss.config.js', 'postcss.config.mjs',
  'components.json', 'biome.json'
]);

interface CompactImagePreviewProps {
  src: string;
  alt?: string;
  onClick: () => void;
}

export const CompactImagePreview: React.FC<CompactImagePreviewProps> = ({ src, alt, onClick }) => {
  const label = alt || 'Screenshot';
  return (
    <span
      role="button"
      tabIndex={0}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onClick();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          e.stopPropagation();
          onClick();
        }
      }}
      className="group relative my-2 inline-flex flex-col max-w-[280px] rounded-lg border border-[#303038] hover:border-blue-500/60 bg-[#16161a] shadow-sm hover:shadow-md transition-all cursor-pointer select-none overflow-hidden text-left"
      title={`Click to view ${label} in detail`}
    >
      <span className="relative max-h-[160px] min-h-[90px] bg-black/50 flex items-center justify-center overflow-hidden p-1">
        <img
          src={src}
          alt={label}
          loading="lazy"
          className="max-h-[150px] w-auto max-w-full rounded object-contain transition-transform duration-200 group-hover:scale-[1.02]"
        />
        <span className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1.5 backdrop-blur-[1px]">
          <span className="text-[11px] font-medium text-white px-2 py-0.5 rounded-full bg-blue-600/85 shadow-xs">
            Zoom
          </span>
        </span>
      </span>
      <span className="px-2.5 py-1 bg-[#1a1a20] border-t border-[#2a2a34] flex items-center justify-between text-[11px] gap-2">
        <span className="font-mono text-[10.5px] truncate max-w-[200px] text-[#cbd5e1]">{label}</span>
        <span className="text-[9.5px] text-blue-400 font-mono px-1 py-0.5 rounded bg-blue-500/15 group-hover:bg-blue-500/25 shrink-0">
          View
        </span>
      </span>
    </span>
  );
};

export function parseFilePathInfo(str: string, isFromCodeTag = false): {
  isFile: boolean;
  path: string;
  lineRange?: { startLine?: number; endLine?: number };
} {
  if (!str) return { isFile: false, path: '' };
  let raw = str.trim();

  // Ignore urls like http:// or https://
  if (/^https?:\/\//i.test(raw)) return { isFile: false, path: '' };

  // Strip file:// protocol if present
  let hasExplicitProtocol = false;
  if (raw.startsWith('file:///')) {
    raw = raw.replace(/^file:\/\/\/?/, '');
    hasExplicitProtocol = true;
  }

  // Strip leading @ if it's a mention
  const hasAtPrefix = raw.startsWith('@');
  if (hasAtPrefix) {
    raw = raw.slice(1);
  }

  // Extract #L1-40 or :1-40 or #L10
  let lineRange: { startLine?: number; endLine?: number } | undefined;
  const hashMatch = /(?:#L|:)(\d+)(?:-(\d+))?$/.exec(raw);
  if (hashMatch) {
    lineRange = {
      startLine: parseInt(hashMatch[1], 10),
      endLine: hashMatch[2] ? parseInt(hashMatch[2], 10) : parseInt(hashMatch[1], 10),
    };
    raw = raw.replace(/(?:#L|:)(\d+)(?:-(\d+))?$/, '');
  }

  // Reject strings containing whitespace or syntax characters
  if (/[\s;{}()=><`"']/.test(raw)) {
    return { isFile: false, path: '' };
  }

  // Check known dotfiles (.gitignore, .env, etc.)
  if (/^\.(gitignore|env(\.[\w.-]+)?|prettierrc(\.[\w.-]+)?|eslintrc(\.[\w.-]+)?|editorconfig|npmrc|dockerignore)$/i.test(raw)) {
    const hasPath = raw.includes('/') || raw.includes('\\');
    if (hasPath || hasAtPrefix || hasExplicitProtocol || Boolean(lineRange)) {
      return { isFile: true, path: raw, lineRange };
    }
    return { isFile: false, path: '' };
  }

  // Check file extension
  const extMatch = /\.([a-zA-Z0-9]+)$/.exec(raw);
  if (!extMatch) return { isFile: false, path: '' };

  const ext = extMatch[1].toLowerCase();
  if (!KNOWN_EXTENSIONS.has(ext)) return { isFile: false, path: '' };

  const cleanName = raw.split(/[/\\]/).pop() || raw;
  const dotIndex = cleanName.lastIndexOf('.');
  // Reject bare extensions like ".html", ".ts", ".css" with no filename before the dot
  if (dotIndex <= 0) {
    return { isFile: false, path: '' };
  }

  // Ignore popular frameworks and brand names that end with .js or domains
  if (FRAMEWORK_AND_TECH_IGNORELIST.has(cleanName.toLowerCase())) {
    return { isFile: false, path: '' };
  }

  const hasPathSeparator = raw.includes('/') || raw.includes('\\');

  // STRICT RULE: Only qualify as a file chip if it has a real path (e.g. "src/foo.ts", "./server.mjs"),
  // an @ mention prefix ("@package.json"), file protocol ("file:///..."), or explicit line numbers ("file.ts:20").
  // Bare filenames like "SKILL.md", "index.html", or "package.json" without path will be rendered as clean code/text.
  if (hasPathSeparator || hasAtPrefix || hasExplicitProtocol || Boolean(lineRange)) {
    return { isFile: true, path: raw, lineRange };
  }

  return { isFile: false, path: '' };
}

export function isSlashCommand(str: string): boolean {
  const trimmed = str.trim();
  return /^\/(plan|test|review|browser|build|run|fix|audit|help|clear|skill:[a-zA-Z0-9_-]+)$/i.test(trimmed);
}

export function formatMessageTimestamp(timestamp?: number | string | null): string {
  if (!timestamp) return '';
  const num = typeof timestamp === 'string' ? parseInt(timestamp, 10) : timestamp;
  if (isNaN(num) || num <= 0) return '';

  const date = new Date(num < 1e12 ? num * 1000 : num);
  if (isNaN(date.getTime())) return '';

  const now = new Date();
  const isSameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();

  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const timeStr = `${hours}:${minutes}`;

  if (isSameDay) {
    return timeStr;
  }

  const months = [
    'Januari',
    'Februari',
    'Maret',
    'April',
    'Mei',
    'Juni',
    'Juli',
    'Agustus',
    'September',
    'Oktober',
    'November',
    'Desember',
  ];

  const day = date.getDate();
  const monthName = months[date.getMonth()];
  const year = date.getFullYear();

  return `${day} ${monthName} ${year} | ${timeStr}`;
}

export interface ExtractedBase64Image {
  id: string;
  label: string;
  dataUrl: string;
}

export function extractAndReplaceBase64Images(text: string): {
  processedText: string;
  images: Map<string, ExtractedBase64Image>;
} {
  if (!text || !text.includes('data:image/')) {
    return { processedText: text, images: new Map() };
  }

  const images = new Map<string, ExtractedBase64Image>();
  let count = 0;
  let result = text;

  // 1. Markdown image syntax: ![alt](data:image/...;base64,...)
  result = result.replace(
    /!\[([^\]]*)\](?:\s*)\(\s*(data:image\/([a-zA-Z0-9+.-]+);base64,[^)]+)\s*\)/gi,
    (_fullMatch, alt, dataUrl, mimeType) => {
      const cleanDataUrl = dataUrl.replace(/\s+/g, '');
      const token = `__b64_img_${count}__`;
      const label = alt?.trim() || `Screenshot (${(mimeType || 'png').toUpperCase()})`;
      images.set(token, { id: token, label, dataUrl: cleanDataUrl });
      count++;
      return token;
    }
  );

  // 2. HTML <img> tags with data:image src
  result = result.replace(
    /<img\s+[^>]*?src=["'](data:image\/([a-zA-Z0-9+.-]+);base64,[^"']+)["'][^>]*?>/gi,
    (fullMatch, dataUrl, mimeType) => {
      const cleanDataUrl = dataUrl.replace(/\s+/g, '');
      const altMatch = /alt=["']([^"']*)["']/i.exec(fullMatch);
      const token = `__b64_img_${count}__`;
      const label = altMatch?.[1]?.trim() || `Image (${(mimeType || 'png').toUpperCase()})`;
      images.set(token, { id: token, label, dataUrl: cleanDataUrl });
      count++;
      return token;
    }
  );

  // 3. Markdown link syntax or parentheses: [alt](data:image/...) or (data:image/...)
  result = result.replace(
    /(?:\[([^\]]*)\])?(?:\s*)\(\s*(data:image\/([a-zA-Z0-9+.-]+);base64,[^)]+)\s*\)/gi,
    (_fullMatch, labelText, dataUrl, mimeType) => {
      const cleanDataUrl = dataUrl.replace(/\s+/g, '');
      const token = `__b64_img_${count}__`;
      const label = labelText?.trim() || `Screenshot (${(mimeType || 'png').toUpperCase()})`;
      images.set(token, { id: token, label, dataUrl: cleanDataUrl });
      count++;
      return token;
    }
  );

  // 4. Bare data:image/ URLs that might still exist in the text
  result = result.replace(
    /(data:image\/([a-zA-Z0-9+.-]+);base64,[A-Za-z0-9+/=]{20,})/gi,
    (_fullMatch, dataUrl, mimeType) => {
      const cleanDataUrl = dataUrl.replace(/\s+/g, '');
      const token = `__b64_img_${count}__`;
      const label = `Screenshot (${(mimeType || 'png').toUpperCase()})`;
      images.set(token, { id: token, label, dataUrl: cleanDataUrl });
      count++;
      return token;
    }
  );

  return { processedText: result, images };
}

export function renderContentWithChips(
  text: string,
  onOpenFile?: (filePath: string, lineRange?: { startLine?: number; endLine?: number }) => void,
  onOpenImage?: (imageId: string) => void,
  base64ImagesMap?: Map<string, ExtractedBase64Image>,
  onOpenBase64?: (url: string, title?: string) => void,
  onOpenBrowser?: (url: string) => void,
  isUserMessage = false
): React.ReactNode {
  if (!text) return null;

  // 1. Find block-level code references and quote selections
  interface BlockMatch {
    type: 'code_ref' | 'quote';
    start: number;
    end: number;
    node: React.ReactNode;
  }

  const blockMatches: BlockMatch[] = [];

  // Regex to match code references like Gambar 2:
  // "Regarding file `file1.txt` at line 2:\n```javascript\nBaris 1: Ini adalah file pertama\n```"
  const codeRefRegex = /Regarding file `([^`]+)` at line (\d+):(?:\r?\n|\s)*```([a-zA-Z0-9_-]*)\r?\n([\s\S]*?)\r?\n```/g;
  let crMatch: RegExpExecArray | null;
  while ((crMatch = codeRefRegex.exec(text)) !== null) {
    const filePath = crMatch[1];
    const lineNum = parseInt(crMatch[2], 10);
    const snippet = crMatch[4];
    blockMatches.push({
      type: 'code_ref',
      start: crMatch.index,
      end: crMatch.index + crMatch[0].length,
      node: (
        <CodeRefChip
          key={`coderef_${crMatch.index}`}
          filePath={filePath}
          lineNum={lineNum}
          snippet={snippet.trim()}
          interactive={false}
          onOpenFile={onOpenFile}
        />
      ),
    });
  }

  // Regex to match quoted selections:
  // "> Quoted text:\n> line 1\n> line 2"
  const quoteRegex = /> Quoted (?:text|selection):(?:\r?\n|\s)*((?:> .*(?:\r?\n|$))+)/g;
  let qMatch: RegExpExecArray | null;
  while ((qMatch = quoteRegex.exec(text)) !== null) {
    const rawLines = qMatch[1];
    const cleanSnippet = rawLines
      .split('\n')
      .map((l) => l.replace(/^>\s?/, ''))
      .join('\n')
      .trim();
    blockMatches.push({
      type: 'quote',
      start: qMatch.index,
      end: qMatch.index + qMatch[0].length,
      node: (
        <QuoteChip
          key={`quote_${qMatch.index}`}
          snippet={cleanSnippet}
          interactive={false}
        />
      ),
    });
  }

  // Sort block matches by start index
  blockMatches.sort((a, b) => a.start - b.start);

  // Helper to render inline tokens ([gambar:id], __b64_img_0__, /slash, https://urls, @file)
  const renderInlineTokens = (subText: string, keyOffset: number): React.ReactNode[] => {
    // Note: URLs (https?://...) are explicitly tokenized FIRST so they never get sliced by file extension patterns
    const tokenRegex = /(\[gambar:[a-zA-Z0-9_-]+\]|__b64_img_\d+__|\/(?:plan|test|review|browser|build|run|fix|audit|help|clear|skill:[a-zA-Z0-9_-]+)\b|https?:\/\/[^\s<>"'`()]+|@?[a-zA-Z0-9_\-./\\]+?\.[a-zA-Z0-9]+(?:(?:#L|:)\d+(?:-\d+)?)?|\.(?:gitignore|env(?:[\w.-]+)?|prettierrc|eslintrc|editorconfig))/g;
    const parts: React.ReactNode[] = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = tokenRegex.exec(subText)) !== null) {
      const matchedToken = match[0];
      const matchIndex = match.index;

      if (matchIndex > lastIndex) {
        parts.push(subText.slice(lastIndex, matchIndex));
      }

      // Safeguard: Do not match file paths inside HTML tags or attribute values (e.g. <agent-embed src="...">)
      const textBefore = subText.slice(0, matchIndex);
      const lastOpenTag = textBefore.lastIndexOf('<');
      const lastCloseTag = textBefore.lastIndexOf('>');
      const isInsideTag = lastOpenTag > -1 && (lastCloseTag === -1 || lastCloseTag < lastOpenTag);
      const isAttributeValue = /(?:src|href)=["'][^"']*$/i.test(textBefore);

      if (isInsideTag || isAttributeValue) {
        parts.push(matchedToken);
        lastIndex = matchIndex + matchedToken.length;
        continue;
      }

      if (matchedToken.startsWith('[gambar:') && matchedToken.endsWith(']')) {
        const imgId = matchedToken.slice(8, -1);
        parts.push(
          <ImageChip
            key={`img_${keyOffset}_${matchIndex}`}
            imageId={imgId}
            interactive={false}
            onClick={onOpenImage ? () => onOpenImage(imgId) : undefined}
          />
        );
      } else if (matchedToken.startsWith('__b64_img_') && matchedToken.endsWith('__')) {
        const b64 = base64ImagesMap?.get(matchedToken);
        if (b64) {
          if (isUserMessage) {
            parts.push(
              <ImageChip
                key={`b64_${keyOffset}_${matchIndex}`}
                label={b64.label || 'gambar'}
                thumbnailUrl={b64.dataUrl}
                interactive={false}
                onClick={() => onOpenBase64?.(b64.dataUrl, b64.label)}
              />
            );
          } else {
            parts.push(
              <CompactImagePreview
                key={`b64_${keyOffset}_${matchIndex}`}
                src={b64.dataUrl}
                alt={b64.label}
                onClick={() => onOpenBase64?.(b64.dataUrl, b64.label)}
              />
            );
          }
        } else {
          parts.push(matchedToken);
        }
      } else if (isSlashCommand(matchedToken)) {
        parts.push(<SlashChip key={`slash_${keyOffset}_${matchIndex}`} command={matchedToken} />);
      } else if (matchedToken.startsWith('http://') || matchedToken.startsWith('https://')) {
        // Strip trailing punctuation like dot or comma from URL if written at the end of sentence
        let cleanUrl = matchedToken;
        let trailingPunct = '';
        const punctMatch = /[.,;!?]+$/.exec(cleanUrl);
        if (punctMatch) {
          trailingPunct = punctMatch[0];
          cleanUrl = cleanUrl.slice(0, -trailingPunct.length);
        }

        const isDirectImage = /\.(png|jpe?g|webp|gif|svg)(\?.*)?$/i.test(cleanUrl);
        if (isDirectImage) {
          if (isUserMessage) {
            const fileName = cleanUrl.split('/').pop()?.split('?')[0] || 'gambar';
            parts.push(
              <ImageChip
                key={`url_img_${keyOffset}_${matchIndex}`}
                label={fileName}
                thumbnailUrl={cleanUrl}
                interactive={false}
                onClick={() => {
                  if (onOpenBase64) {
                    onOpenBase64(cleanUrl, fileName);
                  } else {
                    window.open(cleanUrl, '_blank');
                  }
                }}
              />
            );
          } else {
            parts.push(
              <CompactImagePreview
                key={`url_img_${keyOffset}_${matchIndex}`}
                src={cleanUrl}
                alt="Gambar"
                onClick={() => {
                  if (onOpenBase64) {
                    onOpenBase64(cleanUrl, 'Gambar');
                  } else {
                    window.open(cleanUrl, '_blank');
                  }
                }}
              />
            );
          }
        } else {
          parts.push(
            <a
              key={`url_link_${keyOffset}_${matchIndex}`}
              href={cleanUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => {
                if (cleanUrl && /billing|pricing/i.test(cleanUrl)) {
                  e.preventDefault();
                  window.open(cleanUrl, '_blank');
                  return;
                }
                if (onOpenBrowser && /^https?:\/\//i.test(cleanUrl)) {
                  e.preventDefault();
                  onOpenBrowser(cleanUrl);
                }
              }}
              className="text-[#58a6ff] hover:underline cursor-pointer inline-flex items-center gap-0.5"
            >
              <span>{cleanUrl}</span>
              <ExternalLink className="w-2.5 h-2.5 opacity-60 inline shrink-0" />
            </a>
          );
        }

        if (trailingPunct) {
          parts.push(trailingPunct);
        }
      } else {
        const fileInfo = parseFilePathInfo(matchedToken, false);
        if (fileInfo.isFile) {
          parts.push(
            <FileChip
              key={`file_${keyOffset}_${matchIndex}`}
              filePath={fileInfo.path}
              lineRange={fileInfo.lineRange}
              onOpenFile={onOpenFile}
            />
          );
        } else {
          parts.push(matchedToken);
        }
      }

      lastIndex = matchIndex + matchedToken.length;
    }

    if (lastIndex < subText.length) {
      parts.push(subText.slice(lastIndex));
    }

    return parts;
  };

  if (blockMatches.length === 0) {
    const inlineOnly = renderInlineTokens(text, 0);
    return inlineOnly.length > 0 ? inlineOnly : text;
  }

  const finalParts: React.ReactNode[] = [];
  let curIndex = 0;

  for (let i = 0; i < blockMatches.length; i++) {
    const bm = blockMatches[i];
    if (bm.start > curIndex) {
      const prefix = text.slice(curIndex, bm.start);
      finalParts.push(...renderInlineTokens(prefix, curIndex));
    }
    finalParts.push(bm.node);
    curIndex = bm.end;
  }

  if (curIndex < text.length) {
    const suffix = text.slice(curIndex);
    finalParts.push(...renderInlineTokens(suffix, curIndex));
  }

  return finalParts;
}

interface MessageItemProps {
  message: MessageRecord;
  hasGroupedActivity?: boolean;
  onOpenFileDiff?: (filePath: string) => void;
  onOpenFile?: (filePath: string, lineRange?: { startLine?: number; endLine?: number }) => void;
  onOpenBrowser?: (url: string) => void;
  footerCard?: React.ReactNode;
  onApprovePlan?: () => void;
  onRejectPlan?: () => void;
  showFooterActions?: boolean;
  copyText?: string;
  workdir?: string;
  latestUpdateTodosId?: string | null;
}

export const MessageItem = React.memo<MessageItemProps>(function MessageItem({
  message,
  hasGroupedActivity = false,
  onOpenFileDiff,
  onOpenFile,
  onOpenBrowser,
  footerCard,
  onApprovePlan,
  onRejectPlan,
  showFooterActions = true,
  copyText,
  workdir,
  latestUpdateTodosId,
}) {
  const [copied, setCopied] = useState(false);
  const [selectedPreviewImage, setSelectedPreviewImage] = useState<{
    url: string;
    title?: string;
    subtitle?: string;
  } | null>(null);

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const { processedText: processedAssistantText, images: assistantBase64Images } = useMemo(() => {
    return extractAndReplaceBase64Images(message.content || '');
  }, [message.content]);

  const contentSegments = useMemo<Array<{ type: 'markdown' | 'embed'; content: string; src?: string }>>(() => {
    if (!processedAssistantText || !processedAssistantText.includes('<agent-embed')) {
      return [{ type: 'markdown', content: processedAssistantText }];
    }

    const segments: Array<{ type: 'markdown' | 'embed'; content: string; src?: string }> = [];
    const regex = /<agent-embed\s+[^>]*?src=["']([^"']+)["'][^>]*>(?:<\/agent-embed>)?|<agent-embed\s+[^>]*?src=["']([^"']+)["'][^>]*\/>/gi;
    let lastIdx = 0;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(processedAssistantText)) !== null) {
      if (match.index > lastIdx) {
        const textBefore = processedAssistantText.slice(lastIdx, match.index);
        if (textBefore.trim()) {
          segments.push({ type: 'markdown', content: textBefore });
        }
      }
      const embedSrc = match[1] || match[2] || '';
      if (embedSrc) {
        segments.push({ type: 'embed', content: match[0], src: embedSrc });
      }
      lastIdx = match.index + match[0].length;
    }

    if (lastIdx < processedAssistantText.length) {
      const textAfter = processedAssistantText.slice(lastIdx);
      if (textAfter.trim()) {
        segments.push({ type: 'markdown', content: textAfter });
      }
    }

    return segments.length > 0 ? segments : [{ type: 'markdown', content: processedAssistantText }];
  }, [processedAssistantText]);

  const cleanCopyContent = useMemo(() => {
    if (copyText !== undefined) return copyText;
    const raw = message.content || '';
    if (!raw.includes('data:image/')) return raw;
    return raw.replace(/data:image\/[a-zA-Z0-9+.-]+;base64,[A-Za-z0-9+/=\s]+/gi, '[Screenshot]');
  }, [copyText, message.content]);

  const renderMixedChildren = (children: any) => {
    return React.Children.map(children, (child) => {
      if (typeof child === 'string') {
        return renderContentWithChips(
          child,
          onOpenFile,
          undefined,
          assistantBase64Images,
          (url, title) => setSelectedPreviewImage({ url, title }),
          onOpenBrowser
        );
      }
      return child;
    });
  };

  const { chatWidthClass } = useTheme();
  const isUser = message.role === 'user';
  const isTool = message.role === 'tool';

  const timestampStr = formatMessageTimestamp(message.created_at);

  // 1. Tool Message
  if (isTool) {
    const lowerTool = (message.tool_name || '').toLowerCase();
    if (['update_todos', 'update_todo', 'todo_write', 'manage_tasks', 'todos', 'tasks'].includes(lowerTool)) {
      return null;
    }

    return (
      <div className={`${chatWidthClass} mx-auto w-full px-4 py-0.5`}>
        <ToolRow
          toolName={message.tool_name || 'tool'}
          argumentsText={message.tool_arguments || undefined}
          resultText={message.tool_result || message.content || undefined}
          status={(message.status as any) || 'COMPLETED'}
          onOpenFileDiff={onOpenFileDiff}
          onOpenFile={onOpenFile}
          onOpenBrowser={onOpenBrowser}
        />
      </div>
    );
  }

  // 2. User Message (Pill card with actions & interactive chips)
  if (isUser) {
    let userText = message.content || '';
    let attachedImages: Array<{ id?: string; name?: string; url: string }> = [];

    if (userText.startsWith('[{"type":')) {
      try {
        const parsed = JSON.parse(userText);
        if (Array.isArray(parsed)) {
          userText = parsed.find((p: any) => p.type === 'text')?.text || '';
          attachedImages = parsed
            .filter((p: any) => p.type === 'image_url' && (p.image_url?.url || p.url))
            .map((p: any, idx: number) => ({
              id: p.image_id ? String(p.image_id) : String(idx + 1),
              name: p.name,
              url: p.image_url?.url || p.url,
            }));
        }
      } catch {}
    }

    const { processedText: processedUserText, images: userBase64Images } = extractAndReplaceBase64Images(userText);

    const handleOpenImage = (imgId: string) => {
      const found = attachedImages.find((img) => img.id === imgId);
      if (found) {
        setSelectedPreviewImage({
          url: found.url,
          title: `[gambar:${found.id}]`,
          subtitle: found.name || 'screenshot',
        });
      } else if (attachedImages.length > 0) {
        const idx = parseInt(imgId, 10);
        const fallback =
          !isNaN(idx) && attachedImages[idx - 1] ? attachedImages[idx - 1] : attachedImages[0];
        setSelectedPreviewImage({
          url: fallback.url,
          title: `[gambar:${imgId}]`,
          subtitle: fallback.name || 'screenshot',
        });
      }
    };

    return (
      <div className={`${chatWidthClass} mx-auto w-full px-4 pt-2.5 pb-2 select-none group/user`}>
        <div className="rounded-xl bg-[#1c1c1c] border border-[#262626] px-3.5 py-2 text-[13px] text-[#cccccc] font-sans leading-normal shadow-sm select-text">
          {attachedImages.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-2 pb-2 border-b border-[#262626]">
              {attachedImages.map((img, idx) => (
                <div
                  key={idx}
                  onClick={() =>
                    setSelectedPreviewImage({
                      url: img.url,
                      title: `[gambar:${img.id || idx + 1}]`,
                      subtitle: img.name || 'screenshot',
                    })
                  }
                  className="group/userthumb relative rounded-lg overflow-hidden border border-[#303038] hover:border-blue-500/50 max-w-[200px] max-h-[140px] bg-black/40 shadow-sm cursor-pointer hover:opacity-95 transition-all"
                  title={`Lihat preview [gambar:${img.id || idx + 1}]`}
                >
                  <img
                    src={img.url}
                    alt={`gambar:${img.id || idx + 1}`}
                    className="w-full h-full object-cover pointer-events-none"
                  />
                  <div className="absolute bottom-1 left-1 px-1.5 py-0.5 rounded bg-black/75 backdrop-blur-xs text-[10px] font-mono text-blue-300 pointer-events-none">
                    [gambar:{img.id || idx + 1}]
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="whitespace-pre-wrap">
            {renderContentWithChips(
              processedUserText,
              onOpenFile,
              handleOpenImage,
              userBase64Images,
              (url, title) => setSelectedPreviewImage({ url, title }),
              onOpenBrowser,
              true
            )}
          </div>
        </div>
        {/* User Card Actions */}
        <div className="flex items-center gap-2 mt-1 px-1 text-[#6e6e6e] opacity-0 group-hover/user:opacity-100 transition-opacity duration-150 select-none min-h-[20px]">
          <button
            type="button"
            onClick={() => handleCopy(cleanCopyContent)}
            className="p-1 rounded hover:text-[#cccccc] transition cursor-pointer"
            title="Copy prompt"
          >
            {copied ? (
              <Check className="w-3.5 h-3.5 text-[#7aae66]" />
            ) : (
              <Copy className="w-3.5 h-3.5" />
            )}
          </button>
          {timestampStr && (
            <span className="text-[11px] font-sans text-[#666666]">
              {timestampStr}
            </span>
          )}
        </div>

        {/* Modal Preview for user attached images */}
        {selectedPreviewImage && (
          <ImagePreviewModal
            isOpen={Boolean(selectedPreviewImage)}
            imageUrl={selectedPreviewImage.url}
            title={selectedPreviewImage.title}
            subtitle={selectedPreviewImage.subtitle}
            onClose={() => setSelectedPreviewImage(null)}
          />
        )}
      </div>
    );
  }

  // 3. Assistant Message (Markdown canvas with interactive File & Slash chips)

  const isPlanMessage =
    message.role === 'assistant' &&
    typeof message.content === 'string' &&
    (message.content.trim().startsWith('# Implementation Plan') ||
      message.content.trim().startsWith('## Implementation Plan') ||
      message.content.trim().startsWith('Implementation Plan:') ||
      message.content.includes('# Implementation Plan') ||
      message.content.includes('## Implementation Plan'));

  const isErrorMessage =
    message.status === 'ERROR' ||
    (message.role === 'assistant' &&
      typeof message.content === 'string' &&
      (message.content.startsWith('⚠️') ||
        /^(400|401|402|403|404|429|500)\s+/i.test(message.content.trim()) ||
        message.content.includes('memerlukan paket langganan') ||
        message.content.includes('Request Error:')));

  const isBillingError =
    typeof message.content === 'string' &&
    (message.content.includes('paket langganan') ||
      message.content.includes('billing') ||
      message.content.includes('upgrade paket') ||
      message.content.includes('403 Model'));

  const billingUrlMatch =
    typeof message.content === 'string'
      ? message.content.match(/https?:\/\/[^\s)]+(?:billing|pricing)[^\s)]*/i) ||
        (isBillingError ? message.content.match(/https?:\/\/[^\s)]+/i) : null)
      : null;
  const billingUrl = billingUrlMatch ? billingUrlMatch[0] : (isBillingError ? 'https://aidev.weebinhub.biz.id/billing' : null);

  return (
    <div className={`${chatWidthClass} mx-auto w-full px-4 pt-2 pb-2.5 space-y-2 select-text font-sans group/assistant`}>
      {/* Reasoning Monologue */}
      {message.reasoning_content && !hasGroupedActivity && (
        <ReasoningAccordion reasoning={message.reasoning_content} />
      )}

      {/* Markdown Content */}
      {message.content && (
        <div className="text-[#cccccc] text-[13px] leading-relaxed select-text font-sans">
          {isPlanMessage ? (
            <p className="mb-2 last:mb-0 leading-relaxed text-[#cccccc] text-[13px]">
              I have generated the implementation plan for this task. The complete plan has been opened in the sidebar editor (<button
                type="button"
                onClick={() => onOpenFile?.('implementation_plan.md')}
                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-[#222226] hover:bg-[#2c2c32] text-[#cccccc] hover:text-white border border-[#333338] font-mono text-[11.5px] align-baseline transition cursor-pointer"
                title="Open implementation_plan.md in sidebar editor"
              >
                <FileText className="w-3 h-3 text-[#8c8c8c]" />
                <span>implementation_plan.md</span>
                <ExternalLink className="w-2.5 h-2.5 opacity-60" />
              </button>) for your review.
            </p>
          ) : isErrorMessage ? (
            <div className={`my-2 rounded-xl border p-4 text-[#e0e0e0] shadow-lg ${
              isBillingError
                ? 'border-amber-500/30 bg-[#1c1612]'
                : 'border-red-500/30 bg-[#1c1214]'
            }`}>
              <div className="flex items-start gap-3">
                <div className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border ${
                  isBillingError
                    ? 'bg-amber-500/15 text-amber-400 border-amber-500/30'
                    : 'bg-red-500/15 text-red-400 border-red-500/30'
                }`}>
                  {isBillingError ? <AlertTriangle className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                </div>
                <div className="flex-1 min-w-0 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className={`text-[12px] font-semibold uppercase tracking-wider ${
                      isBillingError ? 'text-amber-400' : 'text-red-400'
                    }`}>
                      {isBillingError ? 'Paket Langganan Diperlukan (403)' : 'Gagal Memproses Permintaan'}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleCopy(cleanCopyContent)}
                      className="p-1 rounded hover:bg-white/10 text-white/50 hover:text-white transition cursor-pointer"
                      title="Salin pesan error"
                    >
                      {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                  <div className={`text-[13px] leading-relaxed ${isBillingError ? 'text-[#fef3c7]' : 'text-[#fecdd3]'}`}>
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      components={{
                        a({ href, children }: any) {
                          const isBillingLink = Boolean(href && /billing|pricing/i.test(href));
                          return (
                            <a
                              href={href}
                              onClick={(e) => {
                                if (isBillingLink) {
                                  e.preventDefault();
                                  window.open(href, '_blank');
                                  return;
                                }
                                if (onOpenBrowser && href && /^https?:\/\//i.test(href)) {
                                  e.preventDefault();
                                  onOpenBrowser(href);
                                }
                              }}
                              target="_blank"
                              rel="noopener noreferrer"
                              className={`font-medium underline decoration-current/50 hover:text-white transition ${
                                isBillingError ? 'text-amber-300' : 'text-red-300'
                              }`}
                            >
                              {children}
                            </a>
                          );
                        },
                        p({ children }: any) {
                          return <p className="leading-relaxed mb-1 last:mb-0">{children}</p>;
                        },
                      }}
                    >
                      {message.content}
                    </ReactMarkdown>
                  </div>

                  {billingUrl && (
                    <div className="pt-2 flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          window.open(billingUrl, '_blank');
                        }}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-[12px] font-medium transition shadow-sm cursor-pointer"
                      >
                        <span>Upgrade Paket di Billing</span>
                        <ExternalLink className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            contentSegments.map((seg, sIdx) => {
              if (seg.type === 'embed' && seg.src) {
                return (
                  <AgentEmbedCard
                    key={`embed_${sIdx}`}
                    src={seg.src}
                    workdir={workdir}
                    sessionId={message.session_id}
                    onOpenFile={onOpenFile}
                    onOpenBrowser={onOpenBrowser}
                  />
                );
              }

              return (
                <ReactMarkdown
                  key={`md_${sIdx}`}
                  remarkPlugins={[remarkGfm]}
                  components={{
              code({ node, className, children, ...props }: any) {
                const match = /language-(\w+)/.exec(className || '');
                const isInline = !match && !String(children).includes('\n');
                const textContent = String(children || '').trim();

                if (isInline) {
                  if (isSlashCommand(textContent)) {
                    return <SlashChip command={textContent} />;
                  }
                  if (textContent.startsWith('__b64_img_') && textContent.endsWith('__')) {
                    const b64 = assistantBase64Images.get(textContent);
                    if (b64) {
                      return (
                        <CompactImagePreview
                          src={b64.dataUrl}
                          alt={b64.label}
                          onClick={() => setSelectedPreviewImage({ url: b64.dataUrl, title: b64.label })}
                        />
                      );
                    }
                  }
                  const fileInfo = parseFilePathInfo(textContent, true);
                  if (fileInfo.isFile) {
                    return (
                      <FileChip
                        filePath={fileInfo.path}
                        lineRange={fileInfo.lineRange}
                        onOpenFile={onOpenFile}
                      />
                    );
                  }
                  return (
                    <code className="px-1.5 py-0.5 rounded bg-[#222222] text-[#d7ba7d] font-mono text-[11.5px]" {...props}>
                      {children}
                    </code>
                  );
                }

                return (
                  <div className="my-3">
                    <FormattedCodeCard
                      code={String(children || '')}
                      defaultLanguage={match ? match[1] : undefined}
                      allowPrettyJson={true}
                      maxHeight="max-h-[500px]"
                    />
                  </div>
                );
              },
              a({ href, children }: any) {
                const textContent = String(children || '').trim();
                const target = href || textContent;
                const isDirectImage = Boolean(href && (
                  href.startsWith('/api/media') ||
                  /^data:image\/[a-zA-Z0-9+.-]+;base64,/i.test(href) ||
                  /\.(png|jpe?g|webp|gif|svg)(\?.*)?$/i.test(href)
                ));
                if (isDirectImage) {
                  const label = String(children || '').trim() || 'Gambar';
                  return (
                    <CompactImagePreview
                      src={href}
                      alt={label}
                      onClick={() => setSelectedPreviewImage({ url: href, title: label })}
                    />
                  );
                }
                const fileInfo = parseFilePathInfo(target, false);
                if (fileInfo.isFile) {
                  return (
                    <FileChip
                      filePath={fileInfo.path}
                      lineRange={fileInfo.lineRange}
                      onOpenFile={onOpenFile}
                    />
                  );
                }
                return (
                  <a
                    href={href}
                    onClick={(e) => {
                      if (href && /billing|pricing/i.test(href)) {
                        e.preventDefault();
                        window.open(href, '_blank');
                        return;
                      }
                      if (onOpenBrowser && href && /^https?:\/\//i.test(href)) {
                        e.preventDefault();
                        onOpenBrowser(href);
                      }
                    }}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[#58a6ff] hover:underline cursor-pointer"
                    title={href && /^https?:\/\//i.test(href) ? "Click to open Live Preview in workspace panel" : undefined}
                  >
                    {children}
                  </a>
                );
              },
              p({ children }: any) {
                return (
                  <p className="mb-3 last:mb-0 leading-relaxed text-[#cccccc] text-[13px]">
                    {renderMixedChildren(children)}
                  </p>
                );
              },
              ul({ className, children }: any) {
                const isTaskList =
                  className?.includes('contains-task-list') ||
                  React.Children.toArray(children).some(
                    (child: any) =>
                      child?.props?.className?.includes('task-list-item') ||
                      (child?.props?.children &&
                        React.Children.toArray(child.props.children).some(
                          (c: any) => c?.props?.type === 'checkbox'
                        ))
                  );
                return (
                  <ul
                    className={`${
                      isTaskList ? 'list-none pl-0 space-y-1.5' : 'list-disc pl-5 space-y-1'
                    } mb-3 text-[#cccccc] text-[13px]`}
                  >
                    {children}
                  </ul>
                );
              },
              ol({ children }: any) {
                return <ol className="list-decimal pl-5 mb-3 space-y-1 text-[#cccccc] text-[13px]">{children}</ol>;
              },
              li({ className, children }: any) {
                const childrenArray = React.Children.toArray(children);
                let checkbox: React.ReactNode = null;
                const content: React.ReactNode[] = [];

                childrenArray.forEach((child: any) => {
                  if (
                    child?.props?.type === 'checkbox' ||
                    child?.type === 'input' ||
                    child?.props?.node?.tagName === 'input'
                  ) {
                    checkbox = child;
                  } else {
                    content.push(child);
                  }
                });

                if (checkbox) {
                  return (
                    <li className="list-none flex items-start gap-2 my-1 text-[#e2e8f0] text-[13px] leading-relaxed">
                      <span className="shrink-0 mt-0.5 inline-flex items-center">{checkbox}</span>
                      <div className="flex-1 min-w-0 break-words leading-relaxed text-[#cccccc]">
                        {renderMixedChildren(content)}
                      </div>
                    </li>
                  );
                }

                return (
                  <li className="leading-relaxed my-1">
                    {renderMixedChildren(children)}
                  </li>
                );
              },
              input({ type, checked }: any) {
                if (type === 'checkbox') {
                  return (
                    <span
                      className={`inline-flex items-center justify-center w-3.5 h-3.5 rounded-[3px] shrink-0 mt-[3px] transition-all select-none ${
                        checked
                          ? 'bg-[#38bdf8]/15 border border-[#38bdf8]/60 text-[#38bdf8] shadow-[0_0_8px_rgba(56,189,248,0.2)]'
                          : 'bg-[#16161c] border border-[#333340] text-transparent'
                      }`}
                    >
                      {checked && (
                        <svg
                          className="w-2.5 h-2.5 stroke-[3] fill-none stroke-current"
                          viewBox="0 0 24 24"
                        >
                          <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                    </span>
                  );
                }
                return null;
              },
              table({ children }: any) {
                return (
                  <div className="my-3 overflow-x-auto rounded-xl border border-[#222222] bg-[#161616]/70 shadow-sm">
                    <table className="w-full text-xs text-[#cccccc] border-collapse">{children}</table>
                  </div>
                );
              },
              th({ children }: any) {
                return (
                  <th className="px-3.5 py-2 text-left font-medium text-[#8c8c8c] border-b border-[#262626] bg-[#1a1a1a]/80">
                    {children}
                  </th>
                );
              },
              td({ children }: any) {
                return (
                  <td className="px-3.5 py-2 text-left border-b border-[#222222]/60 align-middle">
                    {renderMixedChildren(children)}
                  </td>
                );
              },
              h1({ children }: any) {
                return <h1 className="text-base font-semibold text-white mt-4 mb-2">{children}</h1>;
              },
              h2({ children }: any) {
                return <h2 className="text-sm font-semibold text-white mt-3 mb-1.5">{children}</h2>;
              },
              h3({ children }: any) {
                return <h3 className="text-xs font-semibold text-[#cccccc] mt-2.5 mb-1">{children}</h3>;
              },
              hr() {
                return <hr className="my-7 md:my-8 border-t border-white/[0.08]" />;
              },
              img({ src, alt }: any) {
                if (!src) return null;
                const label = alt || 'Screenshot';
                return (
                  <CompactImagePreview
                    src={src}
                    alt={label}
                    onClick={() => setSelectedPreviewImage({ url: src, title: label })}
                  />
                );
              },
            }}
                >
                  {seg.content}
                </ReactMarkdown>
              );
            })
          )}
        </div>
      )}

      {/* Optional Card (e.g. TurnDiffCard rendered below message and above copy/timestamp) */}
      {footerCard}

      {/* Assistant Footer Actions (Copy button & timestamp) - only rendered at the end of the turn */}
      {showFooterActions && message.content && (
        <div className="flex items-center gap-2 pt-2 pb-1 text-[#6e6e6e] min-h-[28px]">
          <button
            type="button"
            onClick={() => handleCopy(cleanCopyContent)}
            className="p-1 rounded hover:text-[#cccccc] transition cursor-pointer"
            title="Copy response"
          >
            {copied ? (
              <Check className="w-3.5 h-3.5 text-[#7aae66]" />
            ) : (
              <Copy className="w-3.5 h-3.5" />
            )}
          </button>
          {timestampStr && (
            <span className="text-[11px] font-sans text-[#666666] opacity-0 group-hover/assistant:opacity-100 transition-opacity duration-200 select-none">
              {timestampStr}
            </span>
          )}
        </div>
      )}

      {/* Modal Preview for assistant message images */}
      {selectedPreviewImage && (
        <ImagePreviewModal
          isOpen={Boolean(selectedPreviewImage)}
          imageUrl={selectedPreviewImage.url}
          title={selectedPreviewImage.title}
          subtitle={selectedPreviewImage.subtitle}
          onClose={() => setSelectedPreviewImage(null)}
        />
      )}
    </div>
  );
});
