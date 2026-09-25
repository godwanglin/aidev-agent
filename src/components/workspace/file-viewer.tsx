'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import Prism from 'prismjs';
import 'prismjs/components/prism-javascript';
import 'prismjs/components/prism-typescript';
import 'prismjs/components/prism-jsx';
import 'prismjs/components/prism-tsx';
import 'prismjs/components/prism-json';
import 'prismjs/components/prism-bash';
import 'prismjs/components/prism-python';
import 'prismjs/components/prism-sql';
import 'prismjs/components/prism-diff';
import 'prismjs/components/prism-css';
import 'prismjs/components/prism-markdown';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { createPortal } from 'react-dom';
import { useTheme } from '@/context/theme-context';
import {
  Copy,
  Check,
  Plus,
  X,
  Send,
  MoreVertical,
  ChevronRight,
  ChevronLeft,
  Folder,
  FolderOpen,
  Search,
  Loader2,
  MessageSquare,
  WrapText,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Code2,
  Eye,
} from 'lucide-react';
import { AestheticFileIcon } from '@/components/common/aesthetic-file-icon';
import { BottomSheet } from '@/components/ui/bottom-sheet';
import { isBinaryExtension } from '@/lib/binary-detector';
import { BinaryFilePlaceholder } from './binary-file-placeholder';

const MarkdownCodeBlock: React.FC<{
  language?: string;
  code: string;
}> = ({ language, code }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const highlightedHtml = useMemo(() => {
    if (!language) return null;
    const langKey = language.toLowerCase();
    const grammar = Prism.languages[langKey] || Prism.languages.javascript;
    if (grammar) {
      try {
        return Prism.highlight(code, grammar, langKey);
      } catch {}
    }
    return null;
  }, [code, language]);

  return (
    <div className="relative my-4 rounded-xl bg-[#141418] border border-[#24242c] overflow-hidden shadow-sm group">
      <div className="bg-[#18181f] px-3.5 py-1.5 flex items-center justify-between text-[11px] text-[#8e8e98] border-b border-[#24242c]">
        <span className="font-mono text-[#cbd5e1] font-medium">{language || 'code'}</span>
        <button
          type="button"
          onClick={handleCopy}
          className="hover:text-white text-[#8c8c92] transition text-[11px] flex items-center gap-1.5 cursor-pointer px-2 py-0.5 rounded hover:bg-[#23232c]"
          title="Copy code snippet"
        >
          {copied ? (
            <>
              <Check className="w-3 h-3 text-[#7ee787]" />
              <span className="text-[#7ee787]">Copied!</span>
            </>
          ) : (
            <>
              <Copy className="w-3 h-3" />
              <span>Copy</span>
            </>
          )}
        </button>
      </div>
      <pre className="p-4 overflow-x-auto text-[12.5px] font-mono leading-relaxed text-[#e2e8f0]">
        {highlightedHtml ? (
          <code dangerouslySetInnerHTML={{ __html: highlightedHtml }} />
        ) : (
          <code>{code}</code>
        )}
      </pre>
    </div>
  );
};

const MarkdownPreview: React.FC<{
  content: string;
  filePath: string;
}> = ({ content, filePath }) => {
  if (!content.trim()) {
    return (
      <div className="flex-1 overflow-y-auto p-8 select-text font-sans bg-[#101010] flex items-center justify-center">
        <div className="text-center text-xs text-[#6e6e76] italic">
          Empty markdown file
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-8 md:p-12 select-text font-sans bg-[#101010]">
      <div className="max-w-4xl mx-auto">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            h1: ({ children }: any) => (
              <h1 className="text-2xl md:text-3xl font-bold text-white mt-10 mb-6 pb-3 border-b border-white/[0.07]">
                {children}
              </h1>
            ),
            h2: ({ children }: any) => (
              <h2 className="text-xl md:text-2xl font-semibold text-white mt-9 mb-5 pb-2.5 border-b border-white/[0.05]">
                {children}
              </h2>
            ),
            h3: ({ children }: any) => (
              <h3 className="text-base md:text-lg font-semibold text-[#f1f5f9] mt-7 mb-3.5">
                {children}
              </h3>
            ),
            h4: ({ children }: any) => (
              <h4 className="text-sm md:text-base font-semibold text-[#e2e8f0] mt-6 mb-3">
                {children}
              </h4>
            ),
            p: ({ children }: any) => (
              <p className="mb-5 text-[#d0d4dc] leading-[1.8] text-[13.5px] last:mb-0">
                {children}
              </p>
            ),
            ul: ({ className, children }: any) => {
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
                    isTaskList ? 'list-none pl-0.5 space-y-2.5' : 'list-disc pl-6 space-y-2.5'
                  } mb-5 text-[13.5px] text-[#d0d4dc]`}
                >
                  {children}
                </ul>
              );
            },
            ol: ({ children }: any) => (
              <ol className="list-decimal pl-6 mb-5 space-y-2.5 text-[13.5px] text-[#d0d4dc]">
                {children}
              </ol>
            ),
            li: ({ className, children }: any) => {
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
                  <li className="list-none flex items-start gap-2.5 my-1.5 text-[#e2e8f0] leading-relaxed text-[13px]">
                    <span className="shrink-0 mt-0.5 inline-flex items-center">{checkbox}</span>
                    <div className="flex-1 min-w-0 break-words leading-relaxed text-[#d0d4dc]">
                      {content}
                    </div>
                  </li>
                );
              }

              return (
                <li className="leading-[1.8] pl-1.5 text-[#d0d4dc] my-1 text-[13.5px]">
                  {children}
                </li>
              );
            },
            blockquote: ({ children }: any) => (
              <blockquote className="border-l-3 border-[#38bdf8] bg-[#14151a] px-5 py-4 rounded-r-xl my-6 text-[#cbd5e1] italic text-[13.5px] leading-[1.8] shadow-xs space-y-3">
                {children}
              </blockquote>
            ),
            table: ({ children }: any) => (
              <div className="my-7 overflow-x-auto rounded-xl border border-white/[0.08] bg-[#141418] shadow-sm">
                <table className="w-full text-[13px] text-[#d0d4dc] border-collapse">
                  {children}
                </table>
              </div>
            ),
            thead: ({ children }: any) => (
              <thead className="bg-[#18181c] text-[#94a3b8] font-semibold border-b border-white/[0.08]">
                {children}
              </thead>
            ),
            th: ({ children }: any) => (
              <th className="px-4 py-2.5 text-left font-semibold text-[#94a3b8] border-b border-white/[0.08]">
                {children}
              </th>
            ),
            tbody: ({ children }: any) => (
              <tbody className="divide-y divide-white/[0.04]">
                {children}
              </tbody>
            ),
            tr: ({ children }: any) => (
              <tr className="hover:bg-white/[0.02] transition-colors">
                {children}
              </tr>
            ),
            td: ({ children }: any) => (
              <td className="px-4 py-2.5 border-b border-white/[0.04] align-middle">
                {children}
              </td>
            ),
            hr: () => <hr className="my-8 border-t border-white/[0.07]" />,
            a: ({ href, children }: any) => (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#58a6ff] hover:underline underline-offset-2 transition font-medium cursor-pointer"
              >
                {children}
              </a>
            ),
            code({ node, className, children, ...props }: any) {
              const match = /language-(\w+)/.exec(className || '');
              const isInline = !match && !String(children).includes('\n');
              const textContent = String(children || '').replace(/\n$/, '');

              if (isInline) {
                return (
                  <code
                    className="inline-block px-1.5 py-0.5 rounded-md bg-[#1d1d24] text-[#e2e8f0] font-mono text-[11.5px] border border-[#2c2c36] whitespace-nowrap mx-0.5 align-baseline break-keep"
                    {...props}
                  >
                    {children}
                  </code>
                );
              }

              return (
                <MarkdownCodeBlock
                  language={match ? match[1] : undefined}
                  code={textContent}
                />
              );
            },
            img: ({ src, alt }: any) => {
              if (!src) return null;
              return (
                <div className="my-6 rounded-xl overflow-hidden border border-[#272730] bg-[#121316] max-w-2xl shadow-md">
                  <img
                    src={src}
                    alt={alt || 'Image'}
                    className="max-w-full max-h-[480px] object-contain mx-auto"
                  />
                  {alt && (
                    <div className="px-3 py-1.5 text-center text-[11px] text-[#888892] bg-[#16171b] border-t border-[#222228]">
                      {alt}
                    </div>
                  )}
                </div>
              );
            },
            input: ({ type, checked }: any) => {
              if (type === 'checkbox') {
                return (
                  <span
                    className={`inline-flex items-center justify-center w-4 h-4 rounded-[4px] shrink-0 mt-[3.5px] transition-all select-none ${
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
              return <input type={type} />;
            },
            strong: ({ children }: any) => (
              <strong className="font-semibold text-white">{children}</strong>
            ),
            em: ({ children }: any) => (
              <em className="italic text-[#e2e8f0]">{children}</em>
            ),
          }}
        >
          {content}
        </ReactMarkdown>
      </div>
    </div>
  );
};

interface BreadcrumbPopoverState {
  isOpen: boolean;
  segmentIndex: number;
  segmentName: string;
  browseDir: string;
  initialDir: string;
  history: string[];
  anchorPos: { top: number; left: number };
  items: Array<{ name: string; isDirectory: boolean; isHidden: boolean }>;
  isLoading: boolean;
  searchQuery: string;
  error: string | null;
}

function getDirectoryForSegment(
  segments: string[],
  idx: number,
  rawPath: string
): { dirPath: string; activeName: string } {
  const normalized = rawPath.replace(/\\/g, '/');
  const isWindows = /^[a-zA-Z]:/.test(normalized);
  const activeName = segments[idx];

  if (idx === 0) {
    if (isWindows) {
      const drive = segments[0].endsWith(':') ? `${segments[0]}/` : segments[0];
      return { dirPath: drive, activeName };
    }
    return { dirPath: '/', activeName };
  }

  let dirPath = segments.slice(0, idx).join('/');
  if (isWindows && idx === 1 && /^[a-zA-Z]:$/.test(segments[0])) {
    dirPath = `${segments[0]}/`;
  }
  return { dirPath, activeName };
}

interface FileViewerProps {
  filePath: string;
  content: string;
  highlightRange?: { startLine?: number; endLine?: number };
  onSendMessage?: (content: string) => void;
  onOpenFile?: (filePath: string) => void;
}

const DEFAULT_FONT_SIZE = 13;
const MIN_FONT_SIZE = 9;
const MAX_FONT_SIZE = 26;

export const FileViewer: React.FC<FileViewerProps> = ({
  filePath,
  content,
  highlightRange,
  onSendMessage,
  onOpenFile,
}) => {
  const { resolvedTheme } = useTheme();
  const isLight = resolvedTheme === 'light';
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const [copied, setCopied] = useState(false);
  const [copiedPath, setCopiedPath] = useState(false);
  const [openComments, setOpenComments] = useState<Record<number, boolean>>({});
  const [commentTexts, setCommentTexts] = useState<Record<number, string>>({});
  const [showMenu, setShowMenu] = useState(false);
  const [wordWrap, setWordWrap] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('aidev_file_word_wrap') === 'true';
    }
    return false;
  });

  const [fontSize, setFontSize] = useState<number>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('aidev_editor_font_size');
      if (saved) {
        const val = parseFloat(saved);
        if (!isNaN(val) && val >= MIN_FONT_SIZE && val <= MAX_FONT_SIZE) {
          return val;
        }
      }
    }
    return DEFAULT_FONT_SIZE;
  });

  const lineHeight = Math.round(fontSize * 1.6);

  // Zoom indicator toast
  const [showZoomIndicator, setShowZoomIndicator] = useState(false);
  const zoomTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isInitialMount = useRef(true);

  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    setShowZoomIndicator(true);
    if (zoomTimerRef.current) clearTimeout(zoomTimerRef.current);
    zoomTimerRef.current = setTimeout(() => setShowZoomIndicator(false), 1200);
    return () => {
      if (zoomTimerRef.current) clearTimeout(zoomTimerRef.current);
    };
  }, [fontSize]);

  const updateFontSize = (newSize: number) => {
    const clamped = Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, Math.round(newSize * 2) / 2));
    setFontSize(clamped);
    if (typeof window !== 'undefined') {
      localStorage.setItem('aidev_editor_font_size', String(clamped));
      window.dispatchEvent(new CustomEvent('aidev-editor-zoom', { detail: { fontSize: clamped } }));
    }
  };

  const handleZoomIn = () => updateFontSize(fontSize + 1);
  const handleZoomOut = () => updateFontSize(fontSize - 1);
  const handleResetZoom = () => updateFontSize(DEFAULT_FONT_SIZE);

  const menuRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const lineRefs = useRef<Record<number, HTMLDivElement | null>>({});

  // Sync zoom changes across open editors/tabs
  useEffect(() => {
    const handleZoomSync = (e: Event) => {
      const custom = e as CustomEvent<{ fontSize: number }>;
      if (custom.detail?.fontSize) {
        setFontSize(custom.detail.fontSize);
      }
    };
    window.addEventListener('aidev-editor-zoom', handleZoomSync);
    return () => window.removeEventListener('aidev-editor-zoom', handleZoomSync);
  }, []);

  // Intercept Ctrl + Mouse Wheel to zoom in/out instead of native Chrome zoom
  useEffect(() => {
    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault(); // Stop native Chrome page zoom!
        if (e.deltaY < 0) {
          // Scroll up: zoom in
          setFontSize((prev) => {
            const next = Math.min(MAX_FONT_SIZE, Math.round((prev + 1) * 2) / 2);
            localStorage.setItem('aidev_editor_font_size', String(next));
            window.dispatchEvent(new CustomEvent('aidev-editor-zoom', { detail: { fontSize: next } }));
            return next;
          });
        } else if (e.deltaY > 0) {
          // Scroll down: zoom out
          setFontSize((prev) => {
            const next = Math.max(MIN_FONT_SIZE, Math.round((prev - 1) * 2) / 2);
            localStorage.setItem('aidev_editor_font_size', String(next));
            window.dispatchEvent(new CustomEvent('aidev-editor-zoom', { detail: { fontSize: next } }));
            return next;
          });
        }
      }
    };

    window.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      window.removeEventListener('wheel', handleWheel);
    };
  }, []);

  // Intercept Ctrl + '+' / '-' / '0' keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey) {
        if (e.key === '=' || e.key === '+') {
          e.preventDefault();
          setFontSize((prev) => {
            const next = Math.min(MAX_FONT_SIZE, Math.round((prev + 1) * 2) / 2);
            localStorage.setItem('aidev_editor_font_size', String(next));
            window.dispatchEvent(new CustomEvent('aidev-editor-zoom', { detail: { fontSize: next } }));
            return next;
          });
        } else if (e.key === '-' || e.key === '_') {
          e.preventDefault();
          setFontSize((prev) => {
            const next = Math.max(MIN_FONT_SIZE, Math.round((prev - 1) * 2) / 2);
            localStorage.setItem('aidev_editor_font_size', String(next));
            window.dispatchEvent(new CustomEvent('aidev-editor-zoom', { detail: { fontSize: next } }));
            return next;
          });
        } else if (e.key === '0') {
          e.preventDefault();
          setFontSize(() => {
            localStorage.setItem('aidev_editor_font_size', String(DEFAULT_FONT_SIZE));
            window.dispatchEvent(new CustomEvent('aidev-editor-zoom', { detail: { fontSize: DEFAULT_FONT_SIZE } }));
            return DEFAULT_FONT_SIZE;
          });
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleToggleWordWrap = () => {
    setWordWrap((prev) => {
      const next = !prev;
      if (typeof window !== 'undefined') {
        localStorage.setItem('aidev_file_word_wrap', String(next));
      }
      return next;
    });
  };

  useEffect(() => {
    if (!showMenu) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowMenu(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [showMenu]);

  // Detect language from file path extension
  const lang = useMemo(() => {
    const ext = filePath.split('.').pop()?.toLowerCase();
    switch (ext) {
      case 'ts':
      case 'tsx':
        return 'typescript';
      case 'js':
      case 'jsx':
      case 'mjs':
        return 'javascript';
      case 'json':
        return 'json';
      case 'py':
        return 'python';
      case 'sql':
        return 'sql';
      case 'sh':
      case 'bash':
        return 'bash';
      case 'css':
        return 'css';
      default:
        return 'javascript';
    }
  }, [filePath]);

  // Split content into lines
  // Detect if this is an image file
  const isImage = useMemo(() => {
    const clean = filePath.split('?')[0].toLowerCase();
    return (
      clean.endsWith('.png') ||
      clean.endsWith('.jpg') ||
      clean.endsWith('.jpeg') ||
      clean.endsWith('.gif') ||
      clean.endsWith('.webp') ||
      clean.endsWith('.svg') ||
      filePath.startsWith('/api/media')
    );
  }, [filePath]);

  // Detect if this is a binary file (exe, dll, bin, zip, etc.)
  const isBinary = useMemo(() => {
    if (isImage) return false;
    if (isBinaryExtension(filePath)) return true;
    if (content === '__AIDEV_BINARY_FILE__') return true;
    if (content && typeof content === 'string' && content.slice(0, 512).includes('\0')) return true;
    return false;
  }, [filePath, isImage, content]);

  const lines = useMemo(() => {
    if (isImage || isBinary) return [];
    if (!content) return [''];
    return content.split('\n');
  }, [content, isImage, isBinary]);

  // Detect if this is a Markdown file
  const isMarkdown = useMemo(() => {
    const clean = filePath.split('?')[0].toLowerCase();
    return (
      clean.endsWith('.md') ||
      clean.endsWith('.markdown') ||
      clean.endsWith('.mdx')
    );
  }, [filePath]);

  // Markdown view mode: 'preview' (default as requested by user) or 'raw'
  const [mdMode, setMdMode] = useState<'raw' | 'preview'>('preview');

  // Reset to default 'preview' whenever filePath changes
  useEffect(() => {
    setMdMode('preview');
  }, [filePath]);

  // Pre-tokenize and highlight lines for fast 60fps rendering
  const highlightedLines = useMemo(() => {
    if (isImage || isBinary) return [];
    const grammar = Prism.languages[lang] || Prism.languages.javascript;
    return lines.map((line) => {
      try {
        return Prism.highlight(line || ' ', grammar, lang);
      } catch {
        return line || ' ';
      }
    });
  }, [lines, lang, isImage, isBinary]);

  // Auto-scroll to highlightRange when mounted or changed
  useEffect(() => {
    if (highlightRange?.startLine && lineRefs.current[highlightRange.startLine]) {
      lineRefs.current[highlightRange.startLine]?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    }
  }, [highlightRange]);

  const handleCopyContent = () => {
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCopyPath = () => {
    navigator.clipboard.writeText(filePath);
    setCopiedPath(true);
    setTimeout(() => setCopiedPath(false), 2000);
  };

  const toggleComment = (lineNum: number) => {
    setOpenComments((prev) => ({
      ...prev,
      [lineNum]: !prev[lineNum],
    }));
  };

  const cancelComment = (lineNum: number) => {
    setOpenComments((prev) => {
      const copy = { ...prev };
      delete copy[lineNum];
      return copy;
    });
    setCommentTexts((prev) => {
      const copy = { ...prev };
      delete copy[lineNum];
      return copy;
    });
  };

  const handleSendComment = (lineNum: number) => {
    const text = commentTexts[lineNum]?.trim();
    if (!text) return;

    const lineContent = lines[lineNum - 1] || '';

    // Dispatches to ChatInput as a context chip without sending immediately to AI
    window.dispatchEvent(
      new CustomEvent('aidev-insert-context', {
        detail: {
          type: 'code_ref',
          filePath,
          lineNum,
          snippet: lineContent.trim(),
          comment: text,
        },
      })
    );

    cancelComment(lineNum);
  };

  // Build breadcrumb segments: "c > dev > aidev > coding-agent > src > ..."
  const breadcrumbs = useMemo(() => {
    const normalized = filePath.replace(/\\/g, '/');
    const segments = normalized.split('/').filter(Boolean);
    return segments;
  }, [filePath]);

  const breadcrumbsRef = useRef<HTMLDivElement>(null);

  // Auto-scroll breadcrumbs to the right so filename is visible while allowing scroll left
  useEffect(() => {
    if (breadcrumbsRef.current) {
      breadcrumbsRef.current.scrollLeft = breadcrumbsRef.current.scrollWidth;
    }
  }, [filePath]);

  const handleBreadcrumbsWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (breadcrumbsRef.current && e.deltaY !== 0) {
      breadcrumbsRef.current.scrollLeft += e.deltaY;
    }
  };

  const [popoverState, setPopoverState] = useState<BreadcrumbPopoverState | null>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Close popover when clicking outside or pressing Escape
  useEffect(() => {
    if (!popoverState?.isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setPopoverState(null);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setPopoverState(null);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [popoverState?.isOpen]);

  // Focus search input when popover opens or folder changes
  useEffect(() => {
    if (popoverState?.isOpen && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [popoverState?.isOpen, popoverState?.browseDir]);

  // Close popover when active file changes
  useEffect(() => {
    setPopoverState(null);
  }, [filePath]);

  const handleSegmentClick = async (
    e: React.MouseEvent<HTMLButtonElement>,
    idx: number,
    segmentName: string
  ) => {
    e.stopPropagation();

    // Toggle close if clicking the same segment again
    if (popoverState?.isOpen && popoverState.segmentIndex === idx) {
      setPopoverState(null);
      return;
    }

    const { dirPath, activeName } = getDirectoryForSegment(breadcrumbs, idx, filePath);

    const buttonRect = e.currentTarget.getBoundingClientRect();
    const popoverWidth = 300;
    let left = buttonRect.left;
    if (typeof window !== 'undefined' && left + popoverWidth > window.innerWidth - 12) {
      left = Math.max(12, window.innerWidth - popoverWidth - 12);
    }
    const top = buttonRect.bottom + 4;

    setPopoverState({
      isOpen: true,
      segmentIndex: idx,
      segmentName: activeName,
      browseDir: dirPath,
      initialDir: dirPath,
      history: [],
      anchorPos: { top, left },
      items: [],
      isLoading: true,
      searchQuery: '',
      error: null,
    });

    try {
      const res = await fetch(`/api/files/dirs?path=${encodeURIComponent(dirPath)}&includeFiles=true`);
      const data = await res.json();
      if (data.error) {
        setPopoverState((prev) => (prev ? { ...prev, isLoading: false, error: data.error } : null));
      } else {
        setPopoverState((prev) => (prev ? { ...prev, isLoading: false, items: data.files || [] } : null));
      }
    } catch (err: any) {
      setPopoverState((prev) =>
        prev ? { ...prev, isLoading: false, error: err.message || 'Failed to load directory' } : null
      );
    }
  };

  const handleDrillFolder = async (folderName: string) => {
    if (!popoverState) return;
    const currentDir = popoverState.browseDir;
    const nextDir = currentDir.replace(/[\\/]+$/, '') + '/' + folderName;

    setPopoverState((prev) =>
      prev
        ? {
            ...prev,
            browseDir: nextDir,
            history: [...prev.history, currentDir],
            isLoading: true,
            searchQuery: '',
            error: null,
          }
        : null
    );

    try {
      const res = await fetch(`/api/files/dirs?path=${encodeURIComponent(nextDir)}&includeFiles=true`);
      const data = await res.json();
      if (data.error) {
        setPopoverState((prev) => (prev ? { ...prev, isLoading: false, error: data.error } : null));
      } else {
        setPopoverState((prev) => (prev ? { ...prev, isLoading: false, items: data.files || [] } : null));
      }
    } catch (err: any) {
      setPopoverState((prev) =>
        prev ? { ...prev, isLoading: false, error: err.message || 'Failed to load directory' } : null
      );
    }
  };

  const handleBackFolder = async () => {
    if (!popoverState || popoverState.history.length === 0) return;
    const history = [...popoverState.history];
    const prevDir = history.pop()!;

    setPopoverState((prev) =>
      prev
        ? {
            ...prev,
            browseDir: prevDir,
            history,
            isLoading: true,
            searchQuery: '',
            error: null,
          }
        : null
    );

    try {
      const res = await fetch(`/api/files/dirs?path=${encodeURIComponent(prevDir)}&includeFiles=true`);
      const data = await res.json();
      if (data.error) {
        setPopoverState((p) => (p ? { ...p, isLoading: false, error: data.error } : null));
      } else {
        setPopoverState((p) => (p ? { ...p, isLoading: false, items: data.files || [] } : null));
      }
    } catch (err: any) {
      setPopoverState((p) =>
        p ? { ...p, isLoading: false, error: err.message || 'Failed to load directory' } : null
      );
    }
  };

  const handleSelectFile = (fileName: string) => {
    if (!popoverState) return;
    const fullFilePath = popoverState.browseDir.replace(/[\\/]+$/, '') + '/' + fileName;
    setPopoverState(null);
    if (onOpenFile) {
      onOpenFile(fullFilePath);
    }
  };

  return (
    <div
      className={`flex-1 flex flex-col h-full ${
        isLight ? 'bg-[#ffffff]' : 'bg-[#101010]'
      } text-xs font-sans select-text overflow-hidden relative`}
    >
      {/* 1. Breadcrumb Bar directly matching Google Antigravity screenshot */}
      <div
        className={`h-9 border-b ${
          isLight ? 'border-[#e4e4e9] bg-[#f8f8fa]' : 'border-[#191919] bg-[#151515]'
        } px-3 flex items-center justify-between shrink-0 select-none`}
      >
        {/* Breadcrumbs - Overflow scroll without ellipsis truncation */}
        <div
          ref={breadcrumbsRef}
          onWheel={handleBreadcrumbsWheel}
          className={`flex-1 min-w-0 flex items-center gap-1.5 text-[11.5px] ${
            isLight ? 'text-[#5c5c64]' : 'text-[#6e6e6e]'
          } overflow-x-auto overflow-y-hidden whitespace-nowrap py-1 mr-2 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden select-none`}
        >
          {breadcrumbs.map((seg, idx) => {
            const isLast = idx === breadcrumbs.length - 1;
            const isSegmentOpen = popoverState?.isOpen && popoverState.segmentIndex === idx;
            return (
              <React.Fragment key={idx}>
                {idx > 0 && (
                  <span
                    className={`${
                      isLight ? 'text-[#b0b0b8]' : 'text-[#444444]'
                    } shrink-0 select-none text-[11px]`}
                  >
                    &gt;
                  </span>
                )}
                {isLast && <AestheticFileIcon filePath={filePath} className="w-3.5 h-3.5 shrink-0" />}
                <button
                  type="button"
                  onClick={(e) => handleSegmentClick(e, idx, seg)}
                  className={`shrink-0 whitespace-nowrap transition cursor-pointer px-1.5 py-0.5 rounded text-left ${
                    isSegmentOpen
                      ? isLight
                        ? 'bg-[#e2e2e8] text-[#111113] font-medium'
                        : 'bg-[#25252a] text-white font-medium'
                      : isLast
                        ? isLight
                          ? 'text-[#111113] font-medium hover:bg-[#eaeaea]'
                          : 'text-[#cccccc] font-medium hover:bg-[#202022]'
                        : isLight
                          ? 'text-[#62626b] hover:text-[#111113] hover:bg-[#eaeaea]'
                          : 'text-[#8c8c8c] hover:text-[#cccccc] hover:bg-[#202022]'
                  }`}
                >
                  {seg}
                </button>
              </React.Fragment>
            );
          })}
        </div>

        {/* Right Actions */}
        <div className="flex items-center gap-1 shrink-0">
          {/* Markdown Mode Switcher: Preview (Default) | Raw */}
          {isMarkdown && (
            <div className="flex items-center bg-[#101012] border border-[#242428] rounded-lg p-0.5 mr-1 shadow-xs select-none">
              <button
                type="button"
                onClick={() => setMdMode('preview')}
                className={`flex items-center gap-1.5 px-2.5 py-0.5 rounded text-[11px] font-medium transition cursor-pointer ${
                  mdMode === 'preview'
                    ? 'bg-[#222228] text-white shadow-xs'
                    : 'text-[#8c8c92] hover:text-[#d0d0d5]'
                }`}
                title="Switch to Rendered Markdown preview"
              >
                <Eye className="w-3.5 h-3.5" />
                <span>Preview</span>
              </button>
              <button
                type="button"
                onClick={() => setMdMode('raw')}
                className={`flex items-center gap-1.5 px-2.5 py-0.5 rounded text-[11px] font-medium transition cursor-pointer ${
                  mdMode === 'raw'
                    ? 'bg-[#222228] text-white shadow-xs'
                    : 'text-[#8c8c92] hover:text-[#d0d0d5]'
                }`}
                title="Switch to Raw editor mode"
              >
                <Code2 className="w-3.5 h-3.5" />
                <span>Raw</span>
              </button>
            </div>
          )}

          <button
            type="button"
            onClick={handleCopyContent}
            className="flex items-center gap-1 px-2 py-1 rounded hover:bg-[#202020] text-[#8c8c8c] hover:text-[#cccccc] transition text-[11px]"
            title="Copy file contents"
          >
            {copied ? (
              <Check className="w-3 h-3 text-[#7ee787]" />
            ) : (
              <Copy className="w-3 h-3" />
            )}
            <span className="hidden sm:inline">{copied ? 'Copied' : 'Copy'}</span>
          </button>

          <div className="relative" ref={menuRef}>
            <button
              type="button"
              onClick={() => setShowMenu(!showMenu)}
              className="p-1 rounded hover:bg-[#202020] text-[#8c8c8c] hover:text-[#cccccc] transition cursor-pointer"
              title="More actions"
            >
              <MoreVertical className="w-3.5 h-3.5" />
            </button>

            <BottomSheet
              isOpen={showMenu}
              onClose={() => setShowMenu(false)}
              title="File Actions"
              zIndex={1000}
              className="w-full sm:w-48 bg-[#181818] border-t sm:border border-[#262626] sm:top-full sm:right-0 sm:mt-1 p-2 sm:p-1 text-sm sm:text-[11.5px]"
            >
              <div className="p-1 space-y-0.5">
                {isMarkdown && (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        setMdMode(mdMode === 'preview' ? 'raw' : 'preview');
                        setShowMenu(false);
                      }}
                      className="w-full px-3 sm:px-2.5 py-2.5 sm:py-1.5 rounded-lg text-left text-[#cccccc] hover:bg-[#222222] transition flex items-center justify-between cursor-pointer"
                    >
                      <div className="flex items-center gap-2.5 sm:gap-2">
                        {mdMode === 'preview' ? (
                          <>
                            <Code2 className="w-4 h-4 sm:w-3.5 sm:h-3.5 text-[#8c8c8c]" />
                            <span>Switch to Raw Mode</span>
                          </>
                        ) : (
                          <>
                            <Eye className="w-4 h-4 sm:w-3.5 sm:h-3.5 text-[#8c8c8c]" />
                            <span>Switch to Preview Mode</span>
                          </>
                        )}
                      </div>
                      <span className="text-[10px] text-[#6e6e6e] font-mono uppercase">
                        {mdMode}
                      </span>
                    </button>
                    <div className="my-1 border-t border-[#262626]" />
                  </>
                )}

                <button
                  type="button"
                  onClick={() => {
                    handleCopyPath();
                    setShowMenu(false);
                  }}
                  className="w-full px-3 sm:px-2.5 py-2.5 sm:py-1.5 rounded-lg text-left text-[#cccccc] hover:bg-[#222222] transition flex items-center justify-between cursor-pointer"
                >
                  <span>{copiedPath ? 'Copied Path!' : 'Copy File Path'}</span>
                  <Copy className="w-4 h-4 sm:w-3.5 sm:h-3.5 text-[#6e6e6e]" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    handleCopyContent();
                    setShowMenu(false);
                  }}
                  className="w-full px-3 sm:px-2.5 py-2.5 sm:py-1.5 rounded-lg text-left text-[#cccccc] hover:bg-[#222222] transition flex items-center justify-between cursor-pointer"
                >
                  <span>Copy Entire File</span>
                  <Copy className="w-4 h-4 sm:w-3.5 sm:h-3.5 text-[#6e6e6e]" />
                </button>

                <div className="my-1 border-t border-[#262626]" />

                <button
                  type="button"
                  onClick={() => {
                    handleToggleWordWrap();
                    setShowMenu(false);
                  }}
                  className="w-full px-3 sm:px-2.5 py-2.5 sm:py-1.5 rounded-lg text-left text-[#cccccc] hover:bg-[#222222] transition flex items-center justify-between cursor-pointer"
                >
                  <div className="flex items-center gap-2.5 sm:gap-2">
                    <WrapText className="w-4 h-4 sm:w-3.5 sm:h-3.5 text-[#8c8c8c]" />
                    <span>Word Wrap</span>
                  </div>
                  {wordWrap && <Check className="w-4 h-4 sm:w-3.5 sm:h-3.5 text-[#7ee787]" />}
                </button>

                <div className="my-1 border-t border-[#262626]" />

                {/* Zoom Section with Ctrl+Scroll hint */}
                <div className="px-3 sm:px-2.5 py-1 text-[10px] font-semibold text-[#6e6e6e] uppercase tracking-wider flex items-center justify-between">
                  <span>Zoom ({Math.round((fontSize / DEFAULT_FONT_SIZE) * 100)}%)</span>
                  <span className="font-mono text-[9px] text-[#8c8c8c] bg-[#222226] px-1 py-0.2 rounded border border-[#2b2b32]">
                    Ctrl+Scroll
                  </span>
                </div>

                <button
                  type="button"
                  onClick={handleZoomIn}
                  className="w-full px-3 sm:px-2.5 py-2.5 sm:py-1.5 rounded-lg text-left text-[#cccccc] hover:bg-[#222222] transition flex items-center justify-between cursor-pointer"
                >
                  <div className="flex items-center gap-2.5 sm:gap-2">
                    <ZoomIn className="w-4 h-4 sm:w-3.5 sm:h-3.5 text-[#8c8c8c]" />
                    <span>Zoom In</span>
                  </div>
                  <kbd className="px-1.5 py-0.2 rounded bg-[#202024] text-[#8c8c8c] font-mono text-[10px] border border-[#2b2b30]">
                    Ctrl +
                  </kbd>
                </button>

                <button
                  type="button"
                  onClick={handleZoomOut}
                  className="w-full px-3 sm:px-2.5 py-2.5 sm:py-1.5 rounded-lg text-left text-[#cccccc] hover:bg-[#222222] transition flex items-center justify-between cursor-pointer"
                >
                  <div className="flex items-center gap-2.5 sm:gap-2">
                    <ZoomOut className="w-4 h-4 sm:w-3.5 sm:h-3.5 text-[#8c8c8c]" />
                    <span>Zoom Out</span>
                  </div>
                  <kbd className="px-1.5 py-0.2 rounded bg-[#202024] text-[#8c8c8c] font-mono text-[10px] border border-[#2b2b30]">
                    Ctrl -
                  </kbd>
                </button>

                <button
                  type="button"
                  onClick={handleResetZoom}
                  className="w-full px-3 sm:px-2.5 py-2.5 sm:py-1.5 rounded-lg text-left text-[#cccccc] hover:bg-[#222222] transition flex items-center justify-between cursor-pointer"
                >
                  <div className="flex items-center gap-2.5 sm:gap-2">
                    <RotateCcw className="w-4 h-4 sm:w-3.5 sm:h-3.5 text-[#8c8c8c]" />
                    <span>Reset Zoom</span>
                  </div>
                  <kbd className="px-1.5 py-0.2 rounded bg-[#202024] text-[#8c8c8c] font-mono text-[10px] border border-[#2b2b30]">
                    Ctrl 0
                  </kbd>
                </button>
              </div>
            </BottomSheet>
          </div>
        </div>
      </div>

      {/* 2. Image Canvas, Binary Placeholder, Markdown Preview, or Read-Only Code Canvas */}
      {isImage ? (
        <div className="flex-1 overflow-auto bg-[#0f0f0f] flex flex-col items-center justify-center p-6 select-none relative">
          <div className="max-w-full max-h-[75vh] flex flex-col items-center justify-center p-2 rounded-xl bg-[#141414] border border-[#222222] shadow-2xl">
            <img
              src={
                filePath.startsWith('/api/media')
                  ? filePath
                  : filePath.includes('/') || filePath.includes('\\')
                  ? `/api/media?path=${encodeURIComponent(filePath)}`
                  : `/api/media?file=${encodeURIComponent(filePath.split('/').pop() || '')}`
              }
              alt={filePath}
              className="max-w-full max-h-[65vh] object-contain rounded-lg"
            />
            <div className="mt-2 text-[11px] text-[#6e6e6e] font-sans flex items-center gap-3">
              <span>{filePath.split('/').pop()}</span>
            </div>
          </div>
        </div>
      ) : isBinary ? (
        <BinaryFilePlaceholder filePath={filePath} />
      ) : isMarkdown && mdMode === 'preview' ? (
        <MarkdownPreview content={content} filePath={filePath} />
      ) : (
        <div
          ref={containerRef}
          className={`flex-1 bg-[#121315] ${
            wordWrap ? 'overflow-y-auto overflow-x-hidden' : 'overflow-auto'
          }`}
        >
          <div className={wordWrap ? 'w-full max-w-full py-2' : 'min-w-fit py-2'}>
          {lines.map((line, idx) => {
            const lineNum = idx + 1;
            const isHighlighted =
              highlightRange?.startLine &&
              highlightRange?.endLine &&
              lineNum >= highlightRange.startLine &&
              lineNum <= highlightRange.endLine;

            const isCommentOpen = openComments[lineNum];
            const hasFold =
              line.includes('{') ||
              line.includes('(') ||
              line.includes('[') ||
              line.trim().startsWith('interface ') ||
              line.trim().startsWith('export ') ||
              line.trim().startsWith('const ') ||
              line.trim().startsWith('function ');

            return (
              <div
                key={lineNum}
                ref={(el) => {
                  lineRefs.current[lineNum] = el;
                }}
                className={`flex flex-col group/line ${wordWrap ? 'w-full max-w-full min-w-0' : ''}`}
              >
                {/* Line Row */}
                <div
                  style={{
                    minHeight: `${lineHeight}px`,
                    lineHeight: `${lineHeight}px`,
                  }}
                  className={`flex items-stretch transition-colors duration-75 ${
                    wordWrap ? 'w-full max-w-full min-w-0' : ''
                  } ${
                    isHighlighted
                      ? 'bg-[#1a2332]/90 border-l-2 border-[#00d2ff]'
                      : 'hover:bg-[#1a1c20]'
                  }`}
                >
                  {/* Gutter Column: Line Number + Fold Chevron + Hover Blue '+' Button (Sticky Left) */}
                  <div
                    style={{ lineHeight: `${lineHeight}px` }}
                    className={`w-14 shrink-0 sticky left-0 z-10 flex items-center justify-between px-2.5 select-none text-[11px] font-mono border-r border-[#1e2024]/80 transition-colors ${
                      isHighlighted
                        ? 'bg-[#1a2332] text-sky-400'
                        : 'bg-[#121315] text-[#4d5158] group-hover/line:bg-[#1a1c20]'
                    }`}
                  >
                    {/* Line Number */}
                    <span
                      style={{ lineHeight: `${lineHeight}px` }}
                      className="text-right flex-1 pr-1.5 group-hover/line:text-[#8c8c8c] transition-colors"
                    >
                      {lineNum}
                    </span>

                    {/* Fold Indicator / Hover Blue '+' Comment Button */}
                    <div className="w-4 h-4 flex items-center justify-center relative">
                      {/* Normal: Fold chevron if block line */}
                      <span className="group-hover/line:hidden opacity-40">
                        {hasFold && <ChevronRight className="w-2.5 h-2.5 text-[#6e6e6e] rotate-90" />}
                      </span>

                      {/* Hover: Blue Rounded Circle '+' Button (1:1 with media_1789881971319.png) */}
                      <button
                        type="button"
                        onClick={() => toggleComment(lineNum)}
                        className="hidden group-hover/line:flex w-3.5 h-3.5 rounded-full bg-[#0098ea] hover:bg-[#0284c7] text-white items-center justify-center cursor-pointer shadow-sm transition-transform hover:scale-110 active:scale-95"
                        title={`Comment on line ${lineNum}`}
                      >
                        <Plus className="w-2.5 h-2.5 text-white" strokeWidth={3} />
                      </button>
                    </div>
                  </div>

                  {/* Code Line Content with Prism Highlighting */}
                  <div
                    style={{
                      fontSize: `${fontSize}px`,
                      lineHeight: `${lineHeight}px`,
                    }}
                    className={`flex-1 pl-3.5 pr-4 font-mono font-normal select-text min-w-0 antialiased ${
                      wordWrap
                        ? 'whitespace-pre-wrap break-all [overflow-wrap:anywhere]'
                        : 'whitespace-pre overflow-x-visible'
                    }`}
                  >
                    <span
                      className={wordWrap ? 'break-all [overflow-wrap:anywhere]' : ''}
                      dangerouslySetInnerHTML={{
                        __html: highlightedLines[idx],
                      }}
                    />
                  </div>
                </div>

                {/* 3. Inline Comment Widget (Appears underneath this line when '+' clicked) */}
                {isCommentOpen && (
                  <div className="my-1.5 ml-10 mr-auto max-w-[440px] w-[calc(100%-48px)] min-w-[260px] p-2.5 rounded-xl bg-[#15161a] border border-[#282a32] shadow-xl space-y-2 animate-dropdown select-none sticky left-14 z-10">
                    {/* Header */}
                    <div className="flex items-center justify-between text-xs pb-1 border-b border-[#23252d]">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-[#007acc]/20 text-[#58a6ff] font-sans text-[10px] font-medium border border-[#007acc]/30 shrink-0">
                          <MessageSquare className="w-2.5 h-2.5" />
                          Line {lineNum}
                        </span>
                        <span className="text-[#8c8c8c] text-[10.5px] font-mono truncate max-w-[200px]">
                          {line.trim() || '(empty line)'}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => cancelComment(lineNum)}
                        className="w-5 h-5 rounded flex items-center justify-center text-[#6e6e6e] hover:text-[#cccccc] hover:bg-[#222222] transition cursor-pointer shrink-0"
                        title="Cancel"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>

                    {/* Comment Textarea */}
                    <textarea
                      autoFocus
                      value={commentTexts[lineNum] || ''}
                      onChange={(e) =>
                        setCommentTexts({ ...commentTexts, [lineNum]: e.target.value })
                      }
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                          e.preventDefault();
                          handleSendComment(lineNum);
                        }
                        if (e.key === 'Escape') {
                          e.preventDefault();
                          cancelComment(lineNum);
                        }
                      }}
                      placeholder="Ask AI about this line... (Ctrl+Enter)"
                      rows={1}
                      className="w-full bg-[#101114] border border-[#23252d] rounded-lg p-2 text-[11.5px] text-[#cccccc] placeholder-[#666666] focus:outline-none focus:border-[#007acc] resize-none font-sans leading-normal select-text min-h-[32px] max-h-[80px]"
                    />

                    {/* Quick suggestion chips (compact & wrapping) */}
                    <div className="flex flex-wrap items-center gap-1 text-[10px]">
                      {['Explain', 'Refactor', 'Check bugs', 'Add test'].map(
                        (chip) => (
                          <button
                            key={chip}
                            type="button"
                            onClick={() => {
                              const cur = commentTexts[lineNum] || '';
                              setCommentTexts({
                                ...commentTexts,
                                [lineNum]: cur ? `${cur} ${chip}` : chip,
                              });
                            }}
                            className="px-1.5 py-0.5 rounded bg-[#1c1d22] hover:bg-[#25272e] text-[#9d9d9d] hover:text-[#cccccc] border border-[#2a2c35] transition cursor-pointer text-[10px]"
                          >
                            {chip}
                          </button>
                        )
                      )}
                    </div>

                    {/* Action Buttons: Cancel or Send to AI */}
                    <div className="flex items-center justify-between pt-0.5">
                      <button
                        type="button"
                        onClick={() => cancelComment(lineNum)}
                        className="px-2 py-0.5 text-[11px] text-[#8c8c8c] hover:text-[#cccccc] hover:bg-[#222222] rounded transition cursor-pointer"
                      >
                        Cancel
                      </button>

                      <button
                        type="button"
                        onClick={() => handleSendComment(lineNum)}
                        disabled={!commentTexts[lineNum]?.trim()}
                        className={`px-2.5 py-1 rounded-md text-[11px] font-medium flex items-center gap-1 transition shadow-sm ${
                          commentTexts[lineNum]?.trim()
                            ? 'bg-[#007acc] hover:bg-[#0086e6] text-white cursor-pointer active:scale-95'
                            : 'bg-[#1f2025] text-[#555555] cursor-not-allowed'
                        }`}
                        title="Add to Chat (Ctrl+Enter)"
                      >
                        <Plus className="w-3 h-3" />
                        <span>Add to Chat</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
      )}

      {/* Floating Zoom Indicator */}
      {showZoomIndicator && (
        <div className="absolute inset-0 pointer-events-none flex items-center justify-center z-50">
          <div className="bg-[#1a1a22]/90 backdrop-blur-md border border-[#2e2e38] rounded-xl px-5 py-2.5 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            <span className="text-white font-mono text-sm font-semibold tracking-wide">
              {Math.round((fontSize / DEFAULT_FONT_SIZE) * 100)}%
            </span>
          </div>
        </div>
      )}

      {/* 2. Breadcrumb Directory Popover rendered via Portal */}
      {mounted &&
        popoverState?.isOpen &&
        createPortal(
          <div
            ref={popoverRef}
            onClick={(e) => e.stopPropagation()}
            style={{
              position: 'fixed',
              top: `${popoverState.anchorPos.top}px`,
              left: `${popoverState.anchorPos.left}px`,
              zIndex: 99999,
            }}
            className={`w-72 sm:w-80 rounded-xl shadow-2xl border overflow-hidden font-sans text-xs select-none animate-in fade-in-50 zoom-in-95 duration-100 ${
              isLight
                ? 'bg-[#ffffff] border-[#dcdcde] text-[#1e1e24] shadow-[0_12px_32px_rgba(0,0,0,0.12)]'
                : 'bg-[#18181b] border-[#2c2c32] text-[#e4e4e7] shadow-[0_16px_40px_rgba(0,0,0,0.65)]'
            }`}
          >
            {/* Popover Header */}
            <div
              className={`p-2.5 border-b flex items-center justify-between gap-2 ${
                isLight ? 'bg-[#f7f7f9] border-[#e8e8ec]' : 'bg-[#141416] border-[#24242a]'
              }`}
            >
              <div className="flex items-center gap-1.5 min-w-0">
                {popoverState.history.length > 0 && (
                  <button
                    type="button"
                    onClick={handleBackFolder}
                    className={`p-1 rounded transition cursor-pointer shrink-0 ${
                      isLight
                        ? 'hover:bg-[#e6e6eb] text-[#55555c]'
                        : 'hover:bg-[#25252b] text-[#9999a2]'
                    }`}
                    title="Go back"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </button>
                )}
                <Folder className="w-3.5 h-3.5 text-[#3b82f6] shrink-0" />
                <span className="font-semibold truncate text-[11.5px]">
                  {popoverState.browseDir.split(/[\\/]/).filter(Boolean).pop() || popoverState.browseDir}
                </span>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${
                    isLight ? 'bg-[#ebebef] text-[#666670]' : 'bg-[#222228] text-[#8e8e96]'
                  }`}
                >
                  {popoverState.items.length} items
                </span>
                <button
                  type="button"
                  onClick={() => setPopoverState(null)}
                  className={`p-1 rounded transition cursor-pointer ${
                    isLight
                      ? 'hover:bg-[#e6e6eb] text-[#777780]'
                      : 'hover:bg-[#25252b] text-[#8c8c94]'
                  }`}
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Filter Search Input */}
            <div
              className={`px-2.5 py-2 border-b ${
                isLight ? 'bg-[#ffffff] border-[#e8e8ec]' : 'bg-[#18181b] border-[#24242a]'
              }`}
            >
              <div
                className={`flex items-center gap-2 px-2 py-1.5 rounded-lg border text-xs ${
                  isLight
                    ? 'bg-[#f4f4f7] border-[#dcdce2] text-[#1e1e24] focus-within:border-[#3b82f6]'
                    : 'bg-[#121214] border-[#2c2c34] text-[#e4e4e7] focus-within:border-[#3b82f6]'
                }`}
              >
                <Search className="w-3.5 h-3.5 text-[#777782] shrink-0" />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={popoverState.searchQuery}
                  onChange={(e) =>
                    setPopoverState((prev) =>
                      prev ? { ...prev, searchQuery: e.target.value } : null
                    )
                  }
                  placeholder="Filter files & folders..."
                  className="w-full bg-transparent outline-none text-[11.5px] placeholder-[#777782]"
                />
                {popoverState.searchQuery && (
                  <button
                    type="button"
                    onClick={() =>
                      setPopoverState((prev) =>
                        prev ? { ...prev, searchQuery: '' } : null
                      )
                    }
                    className="text-[#777782] hover:text-white"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>

            {/* Item List */}
            <div className="max-h-64 overflow-y-auto p-1 space-y-0.5 [scrollbar-width:thin]">
              {popoverState.isLoading ? (
                <div className="py-6 flex items-center justify-center gap-2 text-[#8c8c94] text-xs">
                  <Loader2 className="w-4 h-4 animate-spin text-[#3b82f6]" />
                  <span>Loading directory contents...</span>
                </div>
              ) : popoverState.error ? (
                <div className="py-4 px-3 text-center text-xs text-[#ef4444]">
                  {popoverState.error}
                </div>
              ) : (
                (() => {
                  const filter = popoverState.searchQuery.trim().toLowerCase();
                  const filtered = popoverState.items.filter((it) =>
                    it.name.toLowerCase().includes(filter)
                  );

                  if (filtered.length === 0) {
                    return (
                      <div className="py-5 text-center text-xs text-[#777782] italic">
                        No matching files or folders
                      </div>
                    );
                  }

                  return filtered.map((item) => {
                    const isActive =
                      item.name.toLowerCase() === popoverState.segmentName.toLowerCase();

                    return (
                      <button
                        key={item.name}
                        type="button"
                        onClick={() => {
                          if (item.isDirectory) {
                            handleDrillFolder(item.name);
                          } else {
                            handleSelectFile(item.name);
                          }
                        }}
                        className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-left text-[11.5px] transition cursor-pointer group ${
                          isActive
                            ? isLight
                              ? 'bg-[#e5e5ec] text-[#111113] font-medium'
                              : 'bg-[#27272f] text-white font-medium'
                            : isLight
                              ? 'text-[#2e2e36] hover:bg-[#efeff4] hover:text-[#111113]'
                              : 'text-[#cecee0] hover:bg-[#202025] hover:text-white'
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0 pr-2">
                          {item.isDirectory ? (
                            <Folder className="w-3.5 h-3.5 text-[#818cf8] shrink-0" />
                          ) : (
                            <AestheticFileIcon fileName={item.name} className="w-3.5 h-3.5 shrink-0" />
                          )}
                          <span className="truncate font-mono">{item.name}</span>
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          {isActive && (
                            <span className="w-1.5 h-1.5 rounded-full bg-[#3b82f6] shrink-0" />
                          )}
                          {item.isDirectory && (
                            <ChevronRight
                              className={`w-3 h-3 transition ${
                                isLight
                                  ? 'text-[#9e9ea6] group-hover:text-[#44444c]'
                                  : 'text-[#6e6e76] group-hover:text-[#b0b0b8]'
                              }`}
                            />
                          )}
                        </div>
                      </button>
                    );
                  });
                })()
              )}
            </div>

            {/* Popover Footer */}
            <div
              className={`px-3 py-1.5 border-t text-[10px] flex items-center justify-between ${
                isLight
                  ? 'bg-[#f7f7f9] border-[#e8e8ec] text-[#787884]'
                  : 'bg-[#131315] border-[#222228] text-[#71717a]'
              }`}
            >
              <span>Click folder to drill in, file to open</span>
              <span className="font-mono text-[9px]">ESC to close</span>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
};
