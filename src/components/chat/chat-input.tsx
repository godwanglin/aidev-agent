'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowRight,
  ArrowUp,
  Square,
  Plus,
  Mic,
  MicOff,
  ChevronUp,
  ChevronDown,
  Loader2,
  X,
  ImageIcon,
  Upload,
  FileText,
  Terminal,
  Sparkles,
  Lock,
  ExternalLink,
} from 'lucide-react';
import type { GatewayModel, UserUsageData } from '@/lib/gateway';
import { formatModelDisplayName } from '@/lib/model-utils';
import { UsageCard } from './usage-card';
import { BottomSheet } from '@/components/ui/bottom-sheet';

import { AestheticFileIcon } from '@/components/common/aesthetic-file-icon';
import { useTheme } from '@/context/theme-context';
import { InlineFileChip } from './inline-file-chip';
import { ImageChip } from './image-chip';
import { SlashChip } from './slash-chip';
import { CodeRefChip } from './code-ref-chip';
import { QuoteChip } from './quote-chip';
import { ImagePreviewModal } from '@/components/modals/image-preview-modal';

export interface RuntimeTaskItem {
  id: string;
  cmd: string;
  status: 'RUNNING' | 'COMPLETED' | 'STOPPED' | 'FAILED';
}

export interface AttachedImage {
  id: string;
  url: string;
  name?: string;
  mimeType?: string;
}

interface InlineChipItem {
  id: string; // DOM container span id
  type: 'file' | 'image' | 'code_ref' | 'quote' | 'slash';
  value: string; // filePath for file, imageId for image, command for slash, or snippet for quote
  filePath?: string;
  lineNum?: number;
  snippet?: string;
  comment?: string;
  source?: string;
}

export interface AvailableSkillItem {
  name: string;
  description?: string;
  scope?: 'workspace' | 'global' | 'builtin' | string;
}

export const ModelProviderIcon: React.FC<{ modelId: string; className?: string }> = ({ modelId, className = 'w-4 h-4' }) => {
  const id = (modelId || '').toLowerCase();
  if (id.includes('aidev') || id.includes('antigravity')) {
    return (
      <img
        src="/icon.png"
        alt="AIdev"
        className={`${className} object-contain grayscale opacity-80 rounded-sm`}
      />
    );
  }
  if (id.includes('gpt') || id.includes('openai') || id.includes('o1') || id.includes('o3') || id.includes('terra') || id.includes('luna') || id.includes('sol') || id.includes('astra')) {
    return (
      <svg className={className} viewBox="0 0 24 24" fill="currentColor">
        <path d="M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7475-7.0729zm-9.022 12.6081a4.4755 4.4755 0 0 1-2.8764-1.0408l.1419-.0804 4.7783-2.7582a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.02 1.1683a.071.071 0 0 1 .038.052v5.5826a4.504 4.504 0 0 1-4.4945 4.4947zm-9.66-4.7644a4.47 4.47 0 0 1-.5346-3.0137l.142.0852 4.783 2.7582a.7712.7712 0 0 0 .7806 0l5.8428-3.3685v2.3324a.0804.0804 0 0 1-.0332.0615L9.74 19.9502a4.4992 4.4992 0 0 1-6.1402-2.2854zm-1.0833-9.8413a4.47 4.47 0 0 1 2.3418-1.9729v5.682a.776.776 0 0 0 .3879.6766l5.8428 3.3732-2.02 1.1683a.0757.0757 0 0 1-.071 0l-4.8303-2.7913a4.4944 4.4944 0 0 1-1.6512-6.1359zm16.597 3.8558-5.8428-3.3685 2.02-1.1682a.0757.0757 0 0 1 .071 0l4.8303 2.7913a4.4944 4.4944 0 0 1-.6765 8.1042v-5.6772a.79.79 0 0 0-.402-.6816zm2.0107-3.0231l-.142-.0852-4.7735-2.7818a.7759.7759 0 0 0-.7854 0L9.409 9.2297V6.8974a.0662.0662 0 0 1 .0284-.0615l4.8303-2.7866a4.4992 4.4992 0 0 1 6.6802 4.6644zm-12.641 4.1354l-2.02-1.1635a.0804.0804 0 0 1-.038-.052V6.0965a4.5 4.5 0 0 1 7.371-3.4537l-.142.0805-4.783 2.7582a.7948.7948 0 0 0-.3927.6813v6.7369zm1.088 1.0786l2.92-1.6843 2.92 1.6843v3.3686l-2.92 1.6843-2.92-1.6843z" />
      </svg>
    );
  }
  if (id.includes('claude') || id.includes('anthropic') || id.includes('sonnet') || id.includes('opus') || id.includes('haiku')) {
    return (
      <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
        <line x1="12" y1="2" x2="12" y2="22" />
        <line x1="2" y1="12" x2="22" y2="12" />
        <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
        <line x1="19.07" y1="4.93" x2="4.93" y2="19.07" />
      </svg>
    );
  }
  if (id.includes('gemini') || id.includes('google')) {
    return (
      <svg className={className} viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 0C12 6.627 6.627 12 0 12c6.627 0 12 5.373 12 12 0-6.627 5.373-12 12-12-6.627 0-12-5.373-12-12z" />
      </svg>
    );
  }
  if (id.includes('deepseek')) {
    return (
      <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4.5 16.5c-1.5 1.26-2 3.5-2 3.5s2.24-.5 3.5-2c2-2.5 7-7.5 10.5-11 1.5-1.5 4-2 5.5-.5s1 4-.5 5.5c-3.5 3.5-8.5 8.5-11 10.5z" />
        <path d="m15 9 3 3" />
      </svg>
    );
  }
  return <Sparkles className={className} />;
};

interface ChatInputProps {
  onSendMessage: (content: string, images?: AttachedImage[]) => void;
  onStop?: () => void;
  isStreaming: boolean;
  workspaceFiles?: string[];
  availableSkills?: AvailableSkillItem[];
  workdir?: string;
  selectedModel?: string;
  models?: GatewayModel[];
  onModelChange?: (model: string) => void;
  runtimeTasks?: RuntimeTaskItem[];
  onAbortTask?: (taskId: string) => void;
  onOpenTask?: (task: RuntimeTaskItem) => void;
  isCentered?: boolean;
  onOpenBrowser?: (url: string) => void;
  onRefreshModels?: () => void;
  queuedMessagesMode?: 'queue' | 'immediately';
}

export const ChatInput: React.FC<ChatInputProps> = ({
  onSendMessage,
  onStop,
  isStreaming,
  workspaceFiles = [],
  availableSkills,
  workdir,
  selectedModel = 'gemini-3.8-flash-high',
  models = [],
  queuedMessagesMode = 'queue',
  onModelChange,
  runtimeTasks = [],
  onAbortTask,
  onOpenTask,
  isCentered = false,
  onOpenBrowser,
  onRefreshModels,
}) => {
  const [isTaskBarExpanded, setIsTaskBarExpanded] = useState(true);
  const [showMentions, setShowMentions] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionIndex, setMentionIndex] = useState(0);

  const [showSlashCommands, setShowSlashCommands] = useState(false);
  const [slashQuery, setSlashQuery] = useState('');
  const [slashIndex, setSlashIndex] = useState(0);
  const slashListRef = useRef<HTMLDivElement>(null);
  const mentionListRef = useRef<HTMLDivElement>(null);

  // Auto-scroll highlighted command item into view
  useEffect(() => {
    if (showSlashCommands && slashListRef.current) {
      const activeEl = slashListRef.current.children[slashIndex] as HTMLElement;
      if (activeEl) {
        activeEl.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [slashIndex, showSlashCommands]);

  // Auto-scroll highlighted file mention item into view
  useEffect(() => {
    if (showMentions && mentionListRef.current) {
      const activeEl = mentionListRef.current.children[mentionIndex] as HTMLElement;
      if (activeEl) {
        activeEl.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [mentionIndex, showMentions]);

  const [showModelPicker, setShowModelPicker] = useState(false);
  const modelPickerRef = useRef<HTMLDivElement>(null);
  const [hoveredLockedModel, setHoveredLockedModel] = useState<{ model: GatewayModel; rect: DOMRect } | null>(null);
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const handleOpenBilling = useCallback(() => {
    const billingUrl = 'https://aidev.weebinhub.biz.id/billing';
    if (typeof window !== 'undefined') {
      const api = (window as any).electronAPI;
      if (api?.openExternal) {
        api.openExternal(billingUrl);
      } else {
        window.open(billingUrl, '_blank', 'noopener,noreferrer');
      }
    }
  }, []);

  const calculatePopoverStyle = useCallback((rect: DOMRect): React.CSSProperties => {
    if (typeof window === 'undefined') return { display: 'none' };
    const popoverWidth = 285;
    const padding = 12;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let left = rect.right + 10;
    if (left + popoverWidth > viewportWidth - padding) {
      left = rect.left - popoverWidth - 10;
    }
    if (left < padding) {
      left = Math.max(padding, viewportWidth - popoverWidth - padding);
    }

    let top = rect.top - 8;
    const approxHeight = 150;
    if (top + approxHeight > viewportHeight - padding) {
      top = Math.max(padding, viewportHeight - approxHeight - padding);
    }

    return {
      position: 'fixed',
      top: `${Math.max(padding, top)}px`,
      left: `${left}px`,
      zIndex: 99999,
    };
  }, []);

  useEffect(() => {
    if (!showModelPicker) {
      setHoveredLockedModel(null);
    }
  }, [showModelPicker]);

  const [attachedImages, setAttachedImages] = useState<AttachedImage[]>([]);
  const [chips, setChips] = useState<InlineChipItem[]>([]);
  const [selectedPreviewImage, setSelectedPreviewImage] = useState<AttachedImage | null>(null);
  const [isFocused, setIsFocused] = useState(false);
  const { chatWidthClass } = useTheme();
  const [isEmpty, setIsEmpty] = useState(true);
  const imageCounterRef = useRef(0);

  const editorRef = useRef<HTMLDivElement>(null);

  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const attachMenuRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Usage card state (/usage command)
  const [showUsageCard, setShowUsageCard] = useState(false);
  const [usageData, setUsageData] = useState<UserUsageData | null>(null);
  const [isLoadingUsage, setIsLoadingUsage] = useState(false);

  const handleFetchUsage = useCallback(async () => {
    setIsLoadingUsage(true);
    try {
      const res = await fetch('/api/usage');
      const data = await res.json();
      if (data && !data.error) {
        setUsageData(data);
        setShowUsageCard(true);
      }
    } catch (err) {
      console.error('Failed to fetch usage:', err);
    } finally {
      setIsLoadingUsage(false);
    }
  }, []);

  // User interaction tracking: as requested, on fresh page load it doesn't have to be focused,
  // but once the user clicks / interacts with the prompt, it MUST ALWAYS STAY FOCUSED with blinking indicator!
  const hasEverInteractedRef = useRef(false);

  // Always-Focus Prompt System (Auto-focus after user interaction, streaming end, session switch, and typing)
  const focusEditorSafely = useCallback(() => {
    if (typeof window !== 'undefined' && window.innerWidth < 640) return;

    const editor = editorRef.current;
    if (!editor) return;

    const active = document.activeElement;
    if (
      active &&
      active !== editor &&
      (active.tagName === 'INPUT' ||
        active.tagName === 'TEXTAREA' ||
        active.getAttribute('contenteditable') === 'true' ||
        active.closest('[role="dialog"]') ||
        active.closest('.xterm') ||
        active.closest('.monaco-editor'))
    ) {
      return;
    }

    editor.focus();
    setIsFocused(true);

    const sel = window.getSelection();
    if (!sel) return;

    // If selection is already inside editor and collapsed, keep existing caret position
    if (sel.rangeCount > 0 && editor.contains(sel.anchorNode)) {
      return;
    }

    try {
      const range = document.createRange();
      range.selectNodeContents(editor);
      range.collapse(false);
      sel.removeAllRanges();
      sel.addRange(range);
    } catch {}
  }, []);

  // 1. Initial mount: do not force autofocus before user has ever interacted
  // ("kecuali halaman baru di buka itu gk fokus gpp tapi kalau pernah klik input form itu wajib selalu fokus disitu lekk")

  // 2. Re-focus when streaming finishes if user has interacted
  const prevStreamingRef = useRef(isStreaming);
  useEffect(() => {
    if (prevStreamingRef.current && !isStreaming && hasEverInteractedRef.current) {
      setTimeout(focusEditorSafely, 50);
    }
    prevStreamingRef.current = isStreaming;
  }, [isStreaming, focusEditorSafely]);

  // 3. Listen for global explicit focus event (e.g. "+ New Conversation" or session switch)
  useEffect(() => {
    const handleFocusEvent = () => {
      hasEverInteractedRef.current = true;
      setTimeout(() => {
        focusEditorSafely();
      }, 50);
    };
    window.addEventListener('aidev:focus-prompt', handleFocusEvent);
    return () => window.removeEventListener('aidev:focus-prompt', handleFocusEvent);
  }, [focusEditorSafely]);

  // 4. Global pointerup listener: whenever user clicks outside on neutral elements, messages, background, etc.
  // keep / return focus so the typing indicator NEVER stops blinking
  useEffect(() => {
    const handleGlobalPointerUp = (e: PointerEvent) => {
      if (!hasEverInteractedRef.current) return;
      if (typeof window !== 'undefined' && window.innerWidth < 640) return;

      const target = e.target as HTMLElement | null;
      if (!target) return;

      // Don't interfere if user clicked inside another input, modal dialog, terminal, or code editor
      if (
        target.closest('input') ||
        target.closest('textarea') ||
        target.closest('[contenteditable="true"]') ||
        target.closest('[role="dialog"]') ||
        target.closest('.xterm') ||
        target.closest('.monaco-editor')
      ) {
        return;
      }

      // Don't interfere if user selected text to copy
      const sel = window.getSelection();
      if (sel && sel.toString().trim().length > 0) {
        return;
      }

      // Re-focus and restore caret so typing cursor is always active and blinking
      setTimeout(() => {
        const active = document.activeElement;
        if (
          !active ||
          active === document.body ||
          active === document.documentElement ||
          (!['INPUT', 'TEXTAREA'].includes(active.tagName) &&
            !active.closest('[role="dialog"]') &&
            !active.closest('.xterm') &&
            !active.closest('.monaco-editor'))
        ) {
          focusEditorSafely();
        }
      }, 15);
    };

    window.addEventListener('pointerup', handleGlobalPointerUp);
    return () => window.removeEventListener('pointerup', handleGlobalPointerUp);
  }, [focusEditorSafely]);

  // 5. Global keystroke auto-focus: if user starts typing while focused on neutral background, redirect focus into prompt
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.altKey || e.metaKey) return;
      if (e.key.length !== 1) return;

      const active = document.activeElement;
      if (
        active &&
        (active.tagName === 'INPUT' ||
          active.tagName === 'TEXTAREA' ||
          active.getAttribute('contenteditable') === 'true' ||
          active.closest('[role="dialog"]') ||
          active.closest('.xterm') ||
          active.closest('.monaco-editor'))
      ) {
        return;
      }

      hasEverInteractedRef.current = true;
      if (editorRef.current && active !== editorRef.current) {
        focusEditorSafely();
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [focusEditorSafely]);

  // Voice recording & live audio level state
  const [isListening, setIsListening] = useState(false);
  const [voiceLevels, setVoiceLevels] = useState<[number, number, number]>([0, 0, 0]);
  const isManuallyListeningRef = useRef(false);
  const isSpeakingRef = useRef(false);
  const recognitionRef = useRef<any>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const animFrameRef = useRef<number | null>(null);

  // Close model picker and attach menu on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node | null;
      if (target instanceof Element && target.closest('[data-floating-popover="true"]')) {
        return;
      }
      if (modelPickerRef.current && !modelPickerRef.current.contains(target as Node)) {
        setShowModelPicker(false);
        setHoveredLockedModel(null);
      }
      if (attachMenuRef.current && !attachMenuRef.current.contains(target as Node)) {
        setShowAttachMenu(false);
      }
    };
    if (showModelPicker || showAttachMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showModelPicker, showAttachMenu]);

  // Clean up speech recognition & audio stream on unmount
  useEffect(() => {
    return () => {
      isManuallyListeningRef.current = false;
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
      if (mediaStreamRef.current) {
        try {
          mediaStreamRef.current.getTracks().forEach((track) => track.stop());
        } catch {}
      }
      if (audioContextRef.current) {
        try {
          audioContextRef.current.close();
        } catch {}
      }
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch {}
      }
    };
  }, []);

  const processImageFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (loadEvent) => {
      const dataUrl = loadEvent.target?.result as string;
      if (!dataUrl) return;

      imageCounterRef.current += 1;
      const imgId = `${imageCounterRef.current}`;

      const newImage: AttachedImage = {
        id: imgId,
        url: dataUrl,
        name: file.name || `image_${imgId}.png`,
        mimeType: file.type || 'image/png',
      };

      setAttachedImages((prev) => [...prev, newImage]);
      insertChip('image', imgId);
    };
    reader.readAsDataURL(file);
  };

  const stopVoiceInput = () => {
    isManuallyListeningRef.current = false;
    isSpeakingRef.current = false;
    setIsListening(false);
    setVoiceLevels([0, 0, 0]);

    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }

    if (mediaStreamRef.current) {
      try {
        mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      } catch {}
      mediaStreamRef.current = null;
    }

    if (audioContextRef.current) {
      try {
        audioContextRef.current.close();
      } catch {}
      audioContextRef.current = null;
    }

    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {}
      recognitionRef.current = null;
    }
  };

  const startVoiceInput = () => {
    if (typeof window === 'undefined') return;
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      console.warn('Speech recognition not supported in this environment.');
      return;
    }

    isManuallyListeningRef.current = true;
    setIsListening(true);
    setVoiceLevels([0, 0, 0]);

    try {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = navigator.language || 'id-ID';

      recognition.onstart = () => {
        setIsListening(true);
      };

      recognition.onspeechstart = () => {
        isSpeakingRef.current = true;
      };

      recognition.onspeechend = () => {
        isSpeakingRef.current = false;
        setVoiceLevels([0, 0, 0]);
      };

      recognition.onresult = (event: any) => {
        let finalChunk = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const res = event.results[i];
          if (res.isFinal) {
            finalChunk += res[0].transcript + ' ';
          }
        }

        if (finalChunk) {
          const editor = editorRef.current;
          if (editor) {
            editor.focus();
            const currentText = editor.innerText || editor.textContent || '';
            const needsSpace = currentText.length > 0 && !currentText.endsWith(' ');
            document.execCommand('insertText', false, (needsSpace ? ' ' : '') + finalChunk);
            handleInput();
          }
        }
      };

      recognition.onerror = (event: any) => {
        if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
          stopVoiceInput();
        }
      };

      recognition.onend = () => {
        // Continuous listening: only restart if user hasn't explicitly clicked stop
        if (isManuallyListeningRef.current) {
          try {
            recognition.start();
          } catch {
            // SpeechRecognition may already be starting or active
          }
        } else {
          setIsListening(false);
        }
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch (err) {
      console.error('Failed to start speech recognition:', err);
    }

    // Audio Visualizer: measure microphone volume to animate sound waves
    try {
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        navigator.mediaDevices
          .getUserMedia({ audio: true })
          .then((stream) => {
            if (!isManuallyListeningRef.current) {
              stream.getTracks().forEach((t) => t.stop());
              return;
            }
            mediaStreamRef.current = stream;
            const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
            if (AudioContextClass) {
              const audioCtx = new AudioContextClass();
              audioContextRef.current = audioCtx;
              const analyser = audioCtx.createAnalyser();
              analyser.fftSize = 64;
              analyserRef.current = analyser;

              const source = audioCtx.createMediaStreamSource(stream);
              source.connect(analyser);

              const dataArray = new Uint8Array(analyser.frequencyBinCount);

              const updateAudioLevel = () => {
                if (!isManuallyListeningRef.current) return;
                analyser.getByteFrequencyData(dataArray);

                // Low band (bass / vowels): bins 1..4
                let sumLow = 0;
                for (let i = 1; i <= 4; i++) sumLow += dataArray[i];
                const avgLow = sumLow / 4;

                // Mid band (core human voice 300Hz-1500Hz): bins 5..12
                let sumMid = 0;
                for (let i = 5; i <= 12; i++) sumMid += dataArray[i];
                const avgMid = sumMid / 8;

                // High band (consonants/sibilance): bins 13..20
                let sumHigh = 0;
                for (let i = 13; i <= 20; i++) sumHigh += dataArray[i];
                const avgHigh = sumHigh / 8;

                // Noise gate: ignore ambient silence/room noise below threshold 22
                const NOISE_GATE = 22;
                const hasVoiceSignal =
                  isSpeakingRef.current || avgMid > NOISE_GATE || avgLow > (NOISE_GATE + 5);

                if (!hasVoiceSignal) {
                  // Silent: completely still
                  setVoiceLevels([0, 0, 0]);
                } else {
                  // Voice detected: bars dynamically fluctuate with voice frequency
                  const l1 =
                    avgLow > NOISE_GATE
                      ? Math.min(Math.max((avgLow - NOISE_GATE) / 45, 0), 1)
                      : isSpeakingRef.current
                      ? 0.2
                      : 0;
                  const l2 =
                    avgMid > NOISE_GATE
                      ? Math.min(Math.max((avgMid - NOISE_GATE) / 38, 0), 1)
                      : isSpeakingRef.current
                      ? 0.5
                      : 0;
                  const l3 =
                    avgHigh > NOISE_GATE
                      ? Math.min(Math.max((avgHigh - NOISE_GATE) / 45, 0), 1)
                      : isSpeakingRef.current
                      ? 0.2
                      : 0;
                  setVoiceLevels([l1, l2, l3]);
                }

                animFrameRef.current = requestAnimationFrame(updateAudioLevel);
              };
              updateAudioLevel();
            }
          })
          .catch((err) => {
            console.warn('Audio analyzer mic access error:', err);
          });
      }
    } catch (err) {
      console.warn('AudioContext not available:', err);
    }
  };

  const toggleVoiceInput = () => {
    if (isListening || isManuallyListeningRef.current) {
      stopVoiceInput();
    } else {
      startVoiceInput();
    }
  };

  const [loadedSkills, setLoadedSkills] = useState<AvailableSkillItem[]>([]);

  useEffect(() => {
    if (availableSkills && availableSkills.length > 0) {
      setLoadedSkills(availableSkills);
      return;
    }
    let isCancelled = false;
    const fetchSkills = async () => {
      try {
        const url = workdir ? `/api/skills?workdir=${encodeURIComponent(workdir)}` : '/api/skills';
        const res = await fetch(url);
        const data = await res.json();
        if (!isCancelled && data.skills) {
          setLoadedSkills(data.skills);
        }
      } catch (err) {
        console.error('Failed fetching skills in ChatInput:', err);
      }
    };
    fetchSkills();
    return () => {
      isCancelled = true;
    };
  }, [availableSkills, workdir]);

  const allSlashCommands = React.useMemo(() => {
    const base: Array<{
      cmd: string;
      chipValue: string;
      desc: string;
      isSkill?: boolean;
      scope?: string;
    }> = [
      { cmd: '/usage', chipValue: '/usage', desc: 'View tier plan quota and credit usage' },
      { cmd: '/plan', chipValue: '/plan', desc: 'Create structured implementation plan before modifying files' },
      { cmd: '/test', chipValue: '/test', desc: 'Run automated project test suites' },
      { cmd: '/review', chipValue: '/review', desc: 'Inspect diffs and audit changes' },
      { cmd: '/browser', chipValue: '/browser', desc: 'Use Chrome DevTools MCP for page inspection, navigation, or screenshots' },
      { cmd: '/compact', chipValue: '/compact', desc: 'Compact conversation history context to save tokens and memory' },
    ];

    const skills = loadedSkills.map((s) => ({
      cmd: `/${s.name}`,
      chipValue: `/skill:${s.name}`,
      desc: s.description || `Specialized skill: ${s.name}`,
      isSkill: true,
      scope: s.scope,
    }));

    return [...base, ...skills];
  }, [loadedSkills]);

  // Two-way synchronization: MutationObserver watches editor DOM to detect removed chips (e.g. keyboard Backspace / Delete) and track empty state
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;

    const updateEmptyState = () => {
      const hasChips = !!editor.querySelector('[data-chip-id]');
      const content = (editor.textContent || '').replace(/[\u00A0\r\n\t]/g, '');
      setIsEmpty(!hasChips && content.length === 0);
    };

    updateEmptyState();

    const observer = new MutationObserver(() => {
      updateEmptyState();
      setChips((prevChips) => {
        const remainingChips = prevChips.filter((c) => document.getElementById(c.id));
        if (remainingChips.length !== prevChips.length) {
          // If any image chip was removed via Backspace / Delete, also remove from attachedImages
          const remainingImageIds = new Set(
            remainingChips.filter((c) => c.type === 'image').map((c) => c.value)
          );
          setAttachedImages((prevImgs) =>
            prevImgs.filter((img) => remainingImageIds.has(img.id))
          );
          setSelectedPreviewImage((prev) => (prev && !remainingImageIds.has(prev.id) ? null : prev));
          return remainingChips;
        }
        return prevChips;
      });
    });

    observer.observe(editor, { childList: true, subtree: true, characterData: true });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const handleRestorePrompt = (e: Event) => {
      const customEvent = e as CustomEvent<{ text?: string }>;
      const text = customEvent.detail?.text;
      const editor = editorRef.current;
      if (!editor || typeof text !== 'string') return;
      editor.textContent = text;
      setIsEmpty(text.trim().length === 0);
      hasEverInteractedRef.current = true;
      setTimeout(() => {
        if (!editorRef.current) return;
        editorRef.current.focus();
        const sel = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(editorRef.current);
        range.collapse(false);
        sel?.removeAllRanges();
        sel?.addRange(range);
      }, 25);
    };

    window.addEventListener('aidev-restore-prompt', handleRestorePrompt);
    return () => window.removeEventListener('aidev-restore-prompt', handleRestorePrompt);
  }, []);

  const filteredFiles = workspaceFiles
    .filter((f) => f.toLowerCase().includes(mentionQuery.toLowerCase()))
    .slice(0, 8);

  const filteredSlashCommands = allSlashCommands.filter((sc) => {
    const q = slashQuery.toLowerCase().replace(/^\//, '');
    const cmdName = sc.cmd.toLowerCase().replace(/^\//, '');
    const chipVal = sc.chipValue.toLowerCase();
    return cmdName.includes(q) || chipVal.includes(q) || sc.desc.toLowerCase().includes(q);
  });

  // Helper to insert an atomic inline chip at current caret position
  const insertChip = useCallback(
    (
      type: 'file' | 'image' | 'code_ref' | 'quote' | 'slash',
      value: string,
      extra?: {
        filePath?: string;
        lineNum?: number;
        snippet?: string;
        comment?: string;
        source?: string;
      }
    ) => {
      const editor = editorRef.current;
      if (!editor) return;

      const chipId = `chip_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const sel = window.getSelection();

      // If selection is outside editor, focus editor and place at end
      if (!sel || !sel.rangeCount || !editor.contains(sel.anchorNode)) {
        editor.focus();
        const range = document.createRange();
        range.selectNodeContents(editor);
        range.collapse(false);
        sel?.removeAllRanges();
        sel?.addRange(range);
      }

      const currentSel = window.getSelection();
      if (!currentSel || !currentSel.rangeCount) return;

      const range = currentSel.getRangeAt(0);
      range.deleteContents();

      // Create container span for portal
      const span = document.createElement('span');
      span.id = chipId;
      span.contentEditable = 'false';
      span.className = 'inline-chip-wrapper relative inline-flex items-center align-baseline my-0 mx-0.5';
      if (type === 'image' || type === 'slash') {
        span.style.verticalAlign = '-2.5px';
      }
      span.setAttribute('data-chip-id', chipId);
      span.setAttribute('data-chip-type', type);
      span.setAttribute('data-chip-value', value);
      if (extra?.filePath) span.setAttribute('data-file-path', extra.filePath);
      if (extra?.lineNum) span.setAttribute('data-line-num', String(extra.lineNum));
      if (extra?.snippet) span.setAttribute('data-snippet', extra.snippet);
      if (extra?.comment) span.setAttribute('data-comment', extra.comment);

      range.insertNode(span);

      // Add trailing non-breaking space text node so caret can continue typing smoothly
      const space = document.createTextNode('\u00A0');
      span.after(space);

      let lastNode: Node = space;
      if (extra?.comment) {
        const commentNode = document.createTextNode(extra.comment + ' ');
        space.after(commentNode);
        lastNode = commentNode;
      }

      // Place caret immediately after lastNode
      range.setStartAfter(lastNode);
      range.setEndAfter(lastNode);
      currentSel.removeAllRanges();
      currentSel.addRange(range);

      setIsEmpty(false);
      setChips((prev) => [
        ...prev,
        {
          id: chipId,
          type,
          value,
          filePath: extra?.filePath,
          lineNum: extra?.lineNum,
          snippet: extra?.snippet,
          comment: extra?.comment,
          source: extra?.source,
        },
      ]);
    },
    []
  );

  // Listen to global aidev-insert-context events (from FileViewer comments or text selection Quote)
  useEffect(() => {
    const handleInsertContext = (e: Event) => {
      const customEvent = e as CustomEvent<{
        type: 'code_ref' | 'quote';
        filePath?: string;
        lineNum?: number;
        snippet?: string;
        comment?: string;
        source?: string;
      }>;
      const detail = customEvent.detail;
      if (!detail) return;

      const editor = editorRef.current;
      if (editor) {
        editor.focus();
      }

      if (detail.type === 'code_ref' && detail.filePath && detail.lineNum) {
        insertChip('code_ref', `${detail.filePath}:${detail.lineNum}`, {
          filePath: detail.filePath,
          lineNum: detail.lineNum,
          snippet: detail.snippet,
          comment: detail.comment,
        });
      } else if (detail.type === 'quote' && detail.snippet) {
        insertChip('quote', detail.snippet, {
          snippet: detail.snippet,
          source: detail.source,
        });
      }
    };

    window.addEventListener('aidev-insert-context', handleInsertContext);
    return () => window.removeEventListener('aidev-insert-context', handleInsertContext);
  }, [insertChip]);

  // Remove a chip by chipId (called when clicking ✕ on an inline chip)
  const removeChip = useCallback((chipId: string) => {
    const span = document.getElementById(chipId);
    if (span) {
      const chipType = span.getAttribute('data-chip-type');
      const chipValue = span.getAttribute('data-chip-value');
      span.remove();
      if (chipType === 'image' && chipValue) {
        setAttachedImages((prev) => prev.filter((img) => img.id !== chipValue));
        setSelectedPreviewImage((prev) => (prev?.id === chipValue ? null : prev));
      }
    }
    setChips((prev) => prev.filter((c) => c.id !== chipId));
  }, []);

  // Remove an attached image (called when clicking ✕ on the top thumbnail preview bar)
  const removeAttachedImage = useCallback((imageId: string) => {
    // 1. Remove from attachedImages state
    setAttachedImages((prev) => prev.filter((img) => img.id !== imageId));
    setSelectedPreviewImage((prev) => (prev?.id === imageId ? null : prev));
    // 2. Remove matching chip from editor DOM and state
    const editor = editorRef.current;
    if (editor) {
      const matchingSpan = editor.querySelector(`[data-chip-type="image"][data-chip-value="${imageId}"]`);
      if (matchingSpan) {
        const chipId = matchingSpan.getAttribute('data-chip-id');
        matchingSpan.remove();
        if (chipId) {
          setChips((prev) => prev.filter((c) => c.id !== chipId));
        }
      }
    }
  }, []);

  const insertMention = (filePath: string) => {
    const sel = window.getSelection();
    if (sel && sel.rangeCount) {
      const range = sel.getRangeAt(0);
      // Clean up the "@query" text typed before caret
      if (range.startContainer.nodeType === Node.TEXT_NODE) {
        const textNode = range.startContainer as Text;
        const textVal = textNode.nodeValue || '';
        const atIdx = textVal.lastIndexOf('@');
        if (atIdx !== -1) {
          textNode.nodeValue = textVal.substring(0, atIdx);
          range.setStart(textNode, atIdx);
          range.setEnd(textNode, atIdx);
        }
      }
    }
    setShowMentions(false);
    insertChip('file', filePath);
  };

  const insertSlash = (command: string) => {
    // If command is /usage, trigger usage fetching and display usage card without creating a chip
    if (command === '/usage') {
      setShowSlashCommands(false);
      setSlashQuery('');
      if (editorRef.current) {
        editorRef.current.innerHTML = '';
      }
      setIsEmpty(true);
      setChips([]);
      handleFetchUsage();
      return;
    }

    // If command is /compact, trigger compaction directly without creating a chip
    if (command === '/compact') {
      setShowSlashCommands(false);
      setSlashQuery('');
      if (editorRef.current) {
        editorRef.current.innerHTML = '';
      }
      setIsEmpty(true);
      setChips([]);
      onSendMessage('/compact');
      return;
    }

    const sel = window.getSelection();
    if (sel && sel.rangeCount) {
      const range = sel.getRangeAt(0);
      if (range.startContainer.nodeType === Node.TEXT_NODE) {
        const textNode = range.startContainer as Text;
        const textVal = textNode.nodeValue || '';
        const slashIdx = textVal.lastIndexOf('/');
        if (slashIdx !== -1) {
          textNode.nodeValue = textVal.substring(0, slashIdx);
          range.setStart(textNode, slashIdx);
          range.setEnd(textNode, slashIdx);
        }
      }
    }

    setShowSlashCommands(false);
    setSlashQuery('');
    insertChip('slash', command);
  };

  // Inspect typing for @ mentions and / commands
  const handleInput = () => {
    const editor = editorRef.current;
    if (!editor) return;

    // Check empty state immediately
    const hasChips = !!editor.querySelector('[data-chip-id]');
    const content = (editor.textContent || '').replace(/[\u00A0\r\n\t]/g, '');
    setIsEmpty(!hasChips && content.length === 0);

    let textBeforeCaret = '';
    const sel = window.getSelection();
    if (sel && sel.isCollapsed && sel.rangeCount > 0 && editor.contains(sel.anchorNode)) {
      try {
        const range = sel.getRangeAt(0);
        const preCaretRange = document.createRange();
        preCaretRange.setStart(editor, 0);
        preCaretRange.setEnd(range.endContainer, range.endOffset);
        textBeforeCaret = preCaretRange.toString();
      } catch {
        if (sel.anchorNode?.nodeType === Node.TEXT_NODE) {
          textBeforeCaret = (sel.anchorNode.nodeValue || '').substring(0, sel.anchorOffset);
        } else {
          textBeforeCaret = editor.innerText || editor.textContent || '';
        }
      }
    } else {
      textBeforeCaret = editor.innerText || editor.textContent || '';
    }

    // Clean non-breaking spaces and zero-width spaces
    const cleanTextBeforeCaret = (textBeforeCaret || '').replace(/[\u00A0\u200B]/g, ' ');

    // Check slash commands (at start of text, after space, or on newline)
    const slashMatch = /(?:^|[\s\n])\/([a-zA-Z0-9_-]*)$/.exec(cleanTextBeforeCaret);
    if (slashMatch) {
      setShowSlashCommands(true);
      setSlashQuery(slashMatch[1]);
      setSlashIndex(0);
      setShowMentions(false);
    } else {
      setShowSlashCommands(false);
      setSlashQuery('');
    }

    // Check @ mention (at start of text or after a space or newline)
    const atMatch = /(?:^|[\s\n])@([a-zA-Z0-9_\-\.\/]*)$/.exec(textBeforeCaret);
    if (atMatch) {
      setShowMentions(true);
      setMentionQuery(atMatch[1]);
      setMentionIndex(0);
      setShowSlashCommands(false);
    } else {
      setShowMentions(false);
    }
  };

  // Extract plain text string with @filename and [gambar:id] for submission
  const getEditorContent = (): string => {
    const editor = editorRef.current;
    if (!editor) return '';

    let result = '';
    const walk = (node: Node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        result += node.nodeValue;
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        const el = node as HTMLElement;
        const chipType = el.getAttribute('data-chip-type');
        const chipValue = el.getAttribute('data-chip-value');

        if (chipType === 'file' && chipValue) {
          result += `@${chipValue} `;
        } else if (chipType === 'slash' && chipValue) {
          result += `${chipValue} `;
        } else if (chipType === 'image' && chipValue) {
          result += `[gambar:${chipValue}] `;
        } else if (chipType === 'code_ref') {
          const filePath = el.getAttribute('data-file-path') || chipValue;
          const lineNum = el.getAttribute('data-line-num') || '1';
          const snippet = el.getAttribute('data-snippet') || '';
          result += `Regarding file \`${filePath}\` at line ${lineNum}:\n\`\`\`\n${snippet}\n\`\`\`\n\n`;
        } else if (chipType === 'quote') {
          const snippet = el.getAttribute('data-snippet') || chipValue || '';
          result += `> Quoted text:\n> ${snippet.replace(/\n/g, '\n> ')}\n\n`;
        } else if (el.tagName === 'BR') {
          result += '\n';
        } else {
          const isBlock = ['DIV', 'P'].includes(el.tagName);
          if (isBlock && result.length > 0 && !result.endsWith('\n')) {
            result += '\n';
          }
          for (let i = 0; i < el.childNodes.length; i++) {
            walk(el.childNodes[i]);
          }
        }
      }
    };

    walk(editor);
    return result.replace(/\u00A0/g, ' ').trim();
  };

  const handleSubmit = () => {
    const prompt = getEditorContent();
    if (!prompt && attachedImages.length === 0) return;

    // Direct /usage prompt submission
    if (prompt.trim() === '/usage') {
      if (editorRef.current) {
        editorRef.current.innerHTML = '';
      }
      setChips([]);
      setAttachedImages([]);
      setShowMentions(false);
      setShowSlashCommands(false);
      setIsEmpty(true);
      handleFetchUsage();
      return;
    }

    onSendMessage(prompt, attachedImages);

    // On mobile, blur to dismiss virtual keyboard after sending
    if (typeof window !== 'undefined' && window.innerWidth < 640) {
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
    } else {
      // On desktop, keep input prompt focused so user can type immediately
      hasEverInteractedRef.current = true;
      setTimeout(() => {
        focusEditorSafely();
      }, 15);
    }

    // Clear editor
    if (editorRef.current) {
      editorRef.current.innerHTML = '';
    }
    setChips([]);
    setAttachedImages([]);
    setShowMentions(false);
    setShowSlashCommands(false);
    setIsEmpty(true);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    // Slash commands navigation
    if (showSlashCommands && filteredSlashCommands.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSlashIndex((prev) => (prev + 1) % filteredSlashCommands.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSlashIndex((prev) => (prev - 1 + filteredSlashCommands.length) % filteredSlashCommands.length);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        if (filteredSlashCommands[slashIndex]) {
          const selected = filteredSlashCommands[slashIndex];
          insertSlash(selected.chipValue || selected.cmd);
        }
        return;
      }
      if (e.key === 'Escape') {
        setShowSlashCommands(false);
        return;
      }
    }

    // Mention popover navigation
    if (showMentions && filteredFiles.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setMentionIndex((prev) => (prev + 1) % filteredFiles.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setMentionIndex((prev) => (prev - 1 + filteredFiles.length) % filteredFiles.length);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        if (filteredFiles[mentionIndex]) {
          insertMention(filteredFiles[mentionIndex]);
        }
        return;
      }
      if (e.key === 'Escape') {
        setShowMentions(false);
        return;
      }
    }

    // Atomic Backspace handling: if caret is right after a chip, delete the whole chip atom
    if (e.key === 'Backspace') {
      const sel = window.getSelection();
      if (sel && sel.isCollapsed && sel.rangeCount > 0 && editorRef.current) {
        const range = sel.getRangeAt(0);
        // Check if previous sibling is a chip container
        let targetChipNode: HTMLElement | null = null;
        if (range.startOffset === 0) {
          const prev = range.startContainer.previousSibling as HTMLElement;
          if (prev && prev.nodeType === 1 && prev.classList?.contains('inline-chip-wrapper')) {
            targetChipNode = prev;
          }
        } else if (range.startContainer === editorRef.current && range.startOffset > 0) {
          const prev = editorRef.current.childNodes[range.startOffset - 1] as HTMLElement;
          if (prev && prev.nodeType === 1 && prev.classList?.contains('inline-chip-wrapper')) {
            targetChipNode = prev;
          }
        }

        if (targetChipNode) {
          e.preventDefault();
          const chipId = targetChipNode.getAttribute('data-chip-id');
          if (chipId) {
            removeChip(chipId);
          } else {
            targetChipNode.remove();
          }
          return;
        }
      }
    }

    // Enter to submit (without Shift)
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
      return;
    }
  };

  // Paste handler: handles both image paste (Ctrl+V screenshot) and plain text paste
  const handlePaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    const clipboardData = e.clipboardData;
    if (!clipboardData) return;

    const items = Array.from(clipboardData.items);
    const imageItem = items.find((item) => item.type.startsWith('image/'));

    if (imageItem) {
      e.preventDefault();
      const file = imageItem.getAsFile();
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (loadEvent) => {
        const dataUrl = loadEvent.target?.result as string;
        if (!dataUrl) return;

        imageCounterRef.current += 1;
        const imgId = `${imageCounterRef.current}`;

        const newImage: AttachedImage = {
          id: imgId,
          url: dataUrl,
          name: file.name || `image_${imgId}.png`,
          mimeType: file.type || 'image/png',
        };

        setAttachedImages((prev) => [...prev, newImage]);
        insertChip('image', imgId);
      };
      reader.readAsDataURL(file);
      return;
    }

    // Plain text paste: prevent pasting raw outside HTML styles into contentEditable
    e.preventDefault();
    const plainText = clipboardData.getData('text/plain');
    if (plainText) {
      document.execCommand('insertText', false, plainText);
    }
  };

  return (
    <div
      className={`relative z-30 select-none shrink-0 ${
        isCentered
          ? 'w-full'
          : 'px-2.5 sm:px-4 pb-3 sm:pb-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-1 bg-gradient-to-t from-[var(--background)] via-[var(--background)]/95 to-transparent'
      }`}
    >
      {/* Outer Dock Wrapper */}
      <div className={`relative ${chatWidthClass} mx-auto w-full`}>
        {/* Usage Card (renders right above input dock when triggered via /usage) */}
        {showUsageCard && usageData && (
          <UsageCard
            usage={usageData}
            onClose={() => setShowUsageCard(false)}
            onRefresh={handleFetchUsage}
            isLoading={isLoadingUsage}
          />
        )}

        {/* Unified Antigravity Dock Container (Google Stitch / Gemini Style) */}
        <div className="relative group/dock">
          {/* Ambient Soft Glow (Active when AI is working) */}
          {isStreaming && <div className="ambient-border-glow pointer-events-none" />}

          {/* Soft Glass Glow (Always active & rotating around dock, using the focus glow version) */}
          {!isStreaming && (
            <div className="glass-border-glow pointer-events-none opacity-100" />
          )}

        <div
          onClick={(e) => {
            hasEverInteractedRef.current = true;
            const target = e.target as HTMLElement;
            // Never focus editor if clicked on buttons, toolbars, popovers, bottom sheets, or interactive elements
            if (
              target.closest('button') ||
              target.closest('[data-toolbar]') ||
              target.closest('.select-none') ||
              target.closest('[role="button"]') ||
              target.closest('input') ||
              target.closest('a')
            ) {
              return;
            }
            focusEditorSafely();
          }}
          className={`relative z-10 w-full rounded-[20px] sm:rounded-[24px] shadow-2xl transition-[border-color,box-shadow] duration-300 cursor-text ${
            isStreaming
              ? 'ambient-border-active'
              : 'glass-border-active'
          }`}
        >
        {/* 1. Slash Commands Popover (Anchored right above input card) */}
        {showSlashCommands && filteredSlashCommands.length > 0 && (
          <div className="absolute bottom-full left-0 right-0 mb-2 w-full rounded-2xl bg-[#181818] border border-[#262626] shadow-2xl overflow-hidden z-50 animate-dropdown select-none">
            <div className="px-3.5 sm:px-4 py-2 text-[10px] font-semibold text-[#8c8c8c] border-b border-[#262626] uppercase tracking-wider flex items-center justify-between bg-[#1a1a1a]">
              <span>Commands</span>
              <span className="text-[10px] font-mono text-[#8c8c8c]">{filteredSlashCommands.length} matches</span>
            </div>
            <div ref={slashListRef} className="max-h-60 sm:max-h-72 overflow-y-auto py-1 overscroll-contain">
              {filteredSlashCommands.map((sc, idx) => (
                <button
                  key={sc.cmd}
                  type="button"
                  onClick={() => insertSlash(sc.chipValue || sc.cmd)}
                  className={`w-full px-3.5 sm:px-4 py-2 text-left text-xs flex items-center justify-between gap-2.5 transition-colors duration-100 cursor-pointer ${
                    idx === slashIndex
                      ? 'bg-[#222222] text-[#ffffff]'
                      : 'text-[#9d9d9d] hover:bg-[#202020]'
                  }`}
                >
                  <div className="flex items-center gap-1.5 min-w-0 flex-1">
                    <span className="font-mono font-medium text-[#cccccc] truncate">{sc.cmd}</span>
                    {sc.isSkill && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-white/[0.05] text-[#8c8c8c] border border-white/[0.08] font-mono tracking-wide shrink-0 hidden sm:inline-block">
                        {sc.scope || 'skill'}
                      </span>
                    )}
                  </div>
                  <span className="text-[11px] text-[#8c8c8c] truncate max-w-[130px] sm:max-w-[280px] shrink-0 text-right">
                    {sc.desc}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* 2. File Mentions Popover (Anchored right above input card) */}
        {showMentions && (
          <div className="absolute bottom-full left-0 right-0 mb-2 w-full rounded-2xl bg-[#181818] border border-[#262626] shadow-2xl overflow-hidden z-50 animate-dropdown select-none">
            <div className="px-4 py-2 text-[10px] font-semibold text-[#8c8c8c] border-b border-[#262626] uppercase tracking-wider flex items-center justify-between bg-[#1a1a1a]">
              <span>Context files</span>
              <span className="text-[10px] font-mono text-[#8c8c8c]">
                {filteredFiles.length} {filteredFiles.length === 1 ? 'match' : 'matches'}
              </span>
            </div>
            {workspaceFiles.length === 0 ? (
              <div className="px-4 py-3 text-xs text-[#8c8c8c] flex items-center gap-2.5 bg-[#161616]">
                <AestheticFileIcon filePath="empty" className="w-4 h-4 opacity-40 shrink-0" />
                <div className="flex flex-col">
                  <span className="text-slate-300 font-medium">No files in workspace</span>
                  <span className="text-[11px] text-[#6e6e6e]">This project workspace is currently empty.</span>
                </div>
              </div>
            ) : filteredFiles.length === 0 ? (
              <div className="px-4 py-3 text-xs text-[#8c8c8c] flex items-center gap-2 bg-[#161616]">
                <span>
                  No files matching &quot;<span className="text-white font-mono">@{mentionQuery}</span>&quot;
                </span>
              </div>
            ) : (
              <div ref={mentionListRef} className="max-h-60 overflow-y-auto py-1">
                {filteredFiles.map((file, idx) => {
                  const normalizedFile = file.replace(/\\/g, '/');
                  const parts = normalizedFile.split('/');
                  const fileName = parts.pop() || normalizedFile;
                  const dirPath = parts.length > 0 ? parts.join('/') : null;
                  return (
                    <button
                      key={file}
                      type="button"
                      onClick={() => insertMention(file)}
                      className={`w-full px-4 py-2 text-left text-xs font-mono flex items-center justify-between gap-3 transition-colors duration-100 cursor-pointer ${
                        idx === mentionIndex
                          ? 'bg-[#222222] text-[#ffffff]'
                          : 'text-[#9d9d9d] hover:bg-[#202020]'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <AestheticFileIcon filePath={file} className="w-4 h-4 shrink-0" />
                        <span className="truncate text-[12px] text-[#cccccc] font-medium">{fileName}</span>
                      </div>
                      {dirPath && (
                        <span className="text-[11px] text-[#6e6e6e] truncate font-normal shrink-0 ml-2">{dirPath}</span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* 3. Top Attached Task Bar (matching screenshot: only shows for runtime command tasks) */}
        {runtimeTasks && runtimeTasks.length > 0 && (
          <div className="flex flex-col bg-[#1c1c1c] border-b border-[#262626] text-xs text-[#cccccc] rounded-t-[23px] overflow-hidden animate-slide-down">
            <div
              onClick={() => setIsTaskBarExpanded(!isTaskBarExpanded)}
              className="flex items-center justify-between px-3.5 py-2 cursor-pointer hover:bg-[#202020] transition select-none"
            >
              <div className="flex items-center gap-2">
                <Loader2 className="w-3.5 h-3.5 text-[#007acc] animate-spin shrink-0" />
                <span className="font-normal text-[12px]">
                  {runtimeTasks.length} task{runtimeTasks.length > 1 ? 's' : ''} running
                </span>
              </div>
              <button
                type="button"
                className="text-[#8c8c8c] hover:text-[#cccccc] transition cursor-pointer"
                title={isTaskBarExpanded ? 'Collapse' : 'Expand'}
              >
                {isTaskBarExpanded ? (
                  <ChevronDown className="w-3.5 h-3.5" />
                ) : (
                  <ChevronUp className="w-3.5 h-3.5" />
                )}
              </button>
            </div>

            {isTaskBarExpanded && (
              <div className="px-3 pb-2 pt-0.5 space-y-1 bg-[#181818]/60">
                {runtimeTasks.map((t) => (
                  <div
                    key={t.id}
                    onClick={() => onOpenTask?.(t)}
                    className="group flex items-center justify-between px-2 py-1.5 rounded-lg hover:bg-[#222222] transition text-[#cccccc] font-mono text-[12px] cursor-pointer"
                    title={`Click to view realtime logs for ${t.cmd}`}
                  >
                    <div className="flex items-center gap-2.5 truncate min-w-0 pr-2">
                      <Loader2 className="w-3.5 h-3.5 text-[#007acc] animate-spin shrink-0" />
                      <span className="truncate">{t.cmd}</span>
                    </div>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onAbortTask?.(t.id);
                      }}
                      className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded text-[#8c8c8c] hover:text-[#e06c75] cursor-pointer shrink-0"
                      title={`Abort ${t.cmd}`}
                    >
                      <div className="w-4 h-4 rounded-full border border-current flex items-center justify-center">
                        <div className="w-1.5 h-1.5 bg-current rounded-[1px]" />
                      </div>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 4. Top Thumbnail Preview Bar for Attached Images */}
        {attachedImages.length > 0 && (
          <div className="px-3.5 pt-2.5 pb-1 flex flex-wrap items-center gap-2 border-b border-[#222222]/80 animate-fade-in select-none">
            {attachedImages.map((img) => (
              <div
                key={img.id}
                onClick={() => setSelectedPreviewImage(img)}
                className="group/thumb relative rounded-xl border border-[#2b2b33] bg-[#161619] hover:bg-[#1e1e24] hover:border-blue-500/40 p-1 flex items-center gap-2 pr-2.5 shadow-sm transition-all select-none cursor-pointer"
              >
                <div className="w-9 h-9 rounded-lg overflow-hidden bg-black/50 border border-[#26262d] shrink-0">
                  <img
                    src={img.url}
                    alt={`gambar:${img.id}`}
                    className="w-full h-full object-cover pointer-events-none"
                  />
                </div>
                <div className="flex flex-col min-w-0">
                  <span className="text-[11px] font-mono font-semibold text-blue-400">
                    [gambar:{img.id}]
                  </span>
                  <span className="text-[10px] text-[#737373] truncate max-w-[100px]">
                    {img.name || 'screenshot'}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    removeAttachedImage(img.id);
                  }}
                  className="ml-1 p-1 rounded-md text-[#737373] hover:text-red-400 hover:bg-white/10 transition cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* 5. Rich ContentEditable Text Input Area */}
        <div className="px-3.5 pt-3 pb-2.5">
          <div className="relative">
            {isEmpty && chips.length === 0 && (
              <div className="pointer-events-none absolute left-1.5 right-1.5 top-2 text-[13px] sm:text-[13.5px] leading-relaxed font-sans text-[#666666] select-none truncate">
                {isStreaming ? (
                  'Type a message to queue after agent finishes...'
                ) : (
                  <>
                    <span className="sm:hidden">Ask anything... (@ file, / action)</span>
                    <span className="hidden sm:inline">Ask anything, @ to mention, / for actions, Ctrl+V to paste image</span>
                  </>
                )}
              </div>
            )}
            <div
              ref={editorRef}
              contentEditable={true}
              onFocus={() => {
                hasEverInteractedRef.current = true;
                setIsFocused(true);
              }}
              onBlur={(e) => {
                const relatedTarget = e.relatedTarget as HTMLElement | null;
                // If focus moved to another input, textarea, modal dialog, terminal, or code editor: allow blur!
                if (
                  relatedTarget &&
                  (relatedTarget.tagName === 'INPUT' ||
                    relatedTarget.tagName === 'TEXTAREA' ||
                    relatedTarget.getAttribute('contenteditable') === 'true' ||
                    relatedTarget.closest('[role="dialog"]') ||
                    relatedTarget.closest('.xterm') ||
                    relatedTarget.closest('.monaco-editor'))
                ) {
                  setIsFocused(false);
                  return;
                }

                // If user has already interacted with input and is on desktop, keep focus and blinking cursor!
                if (
                  hasEverInteractedRef.current &&
                  typeof window !== 'undefined' &&
                  window.innerWidth >= 640
                ) {
                  const sel = window.getSelection();
                  if (sel && sel.toString().trim().length > 0) {
                    setIsFocused(false);
                    return;
                  }

                  requestAnimationFrame(() => {
                    const active = document.activeElement;
                    if (
                      !active ||
                      active === document.body ||
                      active === document.documentElement ||
                      (!['INPUT', 'TEXTAREA'].includes(active.tagName) &&
                        !active.closest('[role="dialog"]') &&
                        !active.closest('.xterm') &&
                        !active.closest('.monaco-editor'))
                    ) {
                      focusEditorSafely();
                    }
                  });
                  return;
                }

                setIsFocused(false);
                const editor = editorRef.current;
                if (editor) {
                  const hasChips = !!editor.querySelector('[data-chip-id]');
                  const content = (editor.textContent || '').replace(/[\u00A0\r\n\t]/g, '');
                  if (!hasChips && content.length === 0) {
                    editor.innerHTML = '';
                    setIsEmpty(true);
                  }
                }
              }}
              onInput={handleInput}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              className="w-full bg-transparent px-1.5 pt-2 pb-1 text-[13.5px] text-[#cccccc] focus:outline-none min-h-[36px] max-h-40 overflow-y-auto leading-relaxed font-sans select-text cursor-text"
            />
          </div>

          {/* Render Portals for Active Chips into their matching span containers in the editor */}
          {chips.map((chip) => {
            const domNode = typeof document !== 'undefined' ? document.getElementById(chip.id) : null;
            if (!domNode) return null;

            if (chip.type === 'file') {
              return createPortal(
                <InlineFileChip
                  filePath={chip.value}
                  onDelete={() => removeChip(chip.id)}
                />,
                domNode
              );
            }

            if (chip.type === 'slash') {
              return createPortal(
                <SlashChip
                  command={chip.value}
                  onDelete={() => removeChip(chip.id)}
                />,
                domNode
              );
            }

            if (chip.type === 'image') {
              const matchedImg = attachedImages.find((img) => img.id === chip.value);
              return createPortal(
                <ImageChip
                  imageId={chip.value}
                  onClick={() => {
                    if (matchedImg) {
                      setSelectedPreviewImage(matchedImg);
                    }
                  }}
                  onDelete={() => removeChip(chip.id)}
                />,
                domNode
              );
            }

            if (chip.type === 'code_ref') {
              return createPortal(
                <CodeRefChip
                  filePath={chip.filePath || chip.value.split(':')[0]}
                  lineNum={chip.lineNum || parseInt(chip.value.split(':')[1], 10) || 1}
                  snippet={chip.snippet}
                  comment={chip.comment}
                  onDelete={() => removeChip(chip.id)}
                />,
                domNode
              );
            }

            if (chip.type === 'quote') {
              return createPortal(
                <QuoteChip
                  snippet={chip.snippet || chip.value}
                  source={chip.source}
                  onDelete={() => removeChip(chip.id)}
                />,
                domNode
              );
            }

            return null;
          })}

          {/* Toolbar Footer */}
          <div
            data-toolbar="true"
            onClick={(e) => e.stopPropagation()}
            className="pt-2 flex items-center justify-between text-xs select-none"
          >
            {/* Hidden image file input */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  processImageFile(file);
                }
                e.target.value = '';
              }}
            />

            {/* Left: Plus button (Attachment Popover) + Model Selector Button */}
            <div className="flex items-center gap-2">
              <div className="relative" ref={attachMenuRef}>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (document.activeElement instanceof HTMLElement) {
                      document.activeElement.blur();
                    }
                    setShowAttachMenu((prev) => !prev);
                  }}
                  className={`w-7 h-7 rounded-lg text-[#8c8c8c] hover:text-white hover:bg-white/[0.06] flex items-center justify-center transition-colors cursor-pointer ${
                    showAttachMenu ? 'bg-white/[0.08] text-white' : ''
                  }`}
                  title="Add attachment or context"
                >
                  <Plus
                    className={`w-4 h-4 transition-transform duration-150 ${
                      showAttachMenu ? 'rotate-45 text-white' : ''
                    }`}
                  />
                </button>

                {/* Anchored Attachment Popover / Mobile Bottom Sheet with Drag to Close */}
                <BottomSheet
                  isOpen={showAttachMenu}
                  onClose={() => setShowAttachMenu(false)}
                  title="Add Context"
                  className="w-full sm:w-52 sm:bottom-full sm:left-0 sm:right-auto sm:mb-2 bg-[#181818] border-t sm:border border-[#2a2a2a] p-2 sm:p-1"
                >
                  <div className="p-1 space-y-0.5">
                    <button
                      type="button"
                      onClick={() => {
                        setShowAttachMenu(false);
                        fileInputRef.current?.click();
                      }}
                      className="w-full px-3 sm:px-2.5 py-2.5 sm:py-1.5 rounded-lg text-left text-[13px] sm:text-xs text-[#cccccc] hover:bg-[#222222] hover:text-white transition-colors flex items-center gap-3 sm:gap-2.5 cursor-pointer"
                    >
                      <Upload className="w-4 h-4 sm:w-3.5 sm:h-3.5 text-[#38bdf8]" />
                      <span>Upload Image / Screenshot</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setShowAttachMenu(false);
                        if (editorRef.current) {
                          editorRef.current.focus();
                          document.execCommand('insertText', false, '@');
                          handleInput();
                        }
                      }}
                      className="w-full px-3 sm:px-2.5 py-2.5 sm:py-1.5 rounded-lg text-left text-[13px] sm:text-xs text-[#cccccc] hover:bg-[#222222] hover:text-white transition-colors flex items-center gap-3 sm:gap-2.5 cursor-pointer"
                    >
                      <FileText className="w-4 h-4 sm:w-3.5 sm:h-3.5 text-[#7ee787]" />
                      <span>Mention File (@)</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setShowAttachMenu(false);
                        if (editorRef.current) {
                          editorRef.current.focus();
                          document.execCommand('insertText', false, '/');
                          handleInput();
                        }
                      }}
                      className="w-full px-3 sm:px-2.5 py-2.5 sm:py-1.5 rounded-lg text-left text-[13px] sm:text-xs text-[#cccccc] hover:bg-[#222222] hover:text-white transition-colors flex items-center gap-3 sm:gap-2.5 cursor-pointer"
                    >
                      <Terminal className="w-4 h-4 sm:w-3.5 sm:h-3.5 text-[#d2a8ff]" />
                      <span>Use Command (/)</span>
                    </button>
                  </div>
                </BottomSheet>
              </div>

              {/* Model Selector Pill Button + Anchored Popover / Mobile Sheet */}
              <div className="relative" ref={modelPickerRef}>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (document.activeElement instanceof HTMLElement) {
                      document.activeElement.blur();
                    }
                    const nextOpen = !showModelPicker;
                    setShowModelPicker(nextOpen);
                    if (nextOpen) {
                      onRefreshModels?.();
                    }
                  }}
                  className={`h-7 px-2 sm:px-2.5 rounded-full flex items-center gap-1.5 text-xs text-[#8c8c8c] hover:text-[#e0e0e0] hover:bg-white/[0.06] transition-colors cursor-pointer select-none max-w-[140px] sm:max-w-[220px] ${
                    showModelPicker ? 'bg-white/[0.08] text-white' : ''
                  }`}
                  title="Select Model"
                >
                  <ModelProviderIcon modelId={selectedModel} className="w-3.5 h-3.5 shrink-0 text-[#a3a3a3]" />
                  <span className="text-[12px] sm:text-[12.5px] font-normal tracking-wide truncate">
                    {formatModelDisplayName(selectedModel)}
                  </span>
                  <ChevronDown
                    className={`w-3 h-3 sm:w-3.5 sm:h-3.5 text-[#737373] transition-transform duration-150 shrink-0 ${
                      showModelPicker ? 'rotate-180 text-white' : ''
                    }`}
                  />
                </button>

                {/* Anchored Popover Dropdown / Mobile Bottom Sheet with Drag to Close */}
                <BottomSheet
                  isOpen={showModelPicker && models.length > 0}
                  onClose={() => {
                    setShowModelPicker(false);
                    setHoveredLockedModel(null);
                  }}
                  title="Select Model"
                  badge={<span className="text-[10px] sm:text-[9px] font-mono text-[#666666]">{models.length} available</span>}
                  className="w-full sm:w-72 max-h-[75vh] sm:max-h-80 overflow-y-auto sm:bottom-full sm:left-0 sm:right-auto sm:mb-2 bg-[#181818] border-t sm:border border-[#2a2a2a] p-2 sm:p-1"
                >
                  <div className="p-1 space-y-0.5">
                    {models.map((m) => {
                      const isLocked = m.eligible === false;
                      const hasTierBadge = Boolean(m.minTierName && m.minTier && m.minTier !== 'FREE');
                      const isSelected = m.id === selectedModel;

                      return (
                        <button
                          key={m.id}
                          type="button"
                          onMouseEnter={(e) => {
                            if (isLocked || hasTierBadge) {
                              if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
                              const rect = e.currentTarget.getBoundingClientRect();
                              setHoveredLockedModel({ model: m, rect });
                            } else {
                              setHoveredLockedModel(null);
                            }
                          }}
                          onMouseLeave={() => {
                            if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
                            hoverTimeoutRef.current = setTimeout(() => {
                              setHoveredLockedModel(null);
                            }, 150);
                          }}
                          onClick={() => {
                            if (isLocked) {
                              handleOpenBilling();
                              setShowModelPicker(false);
                              setHoveredLockedModel(null);
                              return;
                            }
                            onModelChange?.(m.id);
                            setShowModelPicker(false);
                            setHoveredLockedModel(null);
                          }}
                          className={`w-full px-3 sm:px-2.5 py-2.5 sm:py-2 rounded-lg text-left text-[13px] sm:text-xs transition-colors flex items-center justify-between cursor-pointer ${
                            isSelected
                              ? 'bg-[#282828] text-white font-medium'
                              : isLocked
                              ? 'text-[#9ca3af] hover:bg-[#202022] hover:text-white'
                              : 'text-[#cccccc] hover:bg-[#222222] hover:text-white'
                          }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0 flex-1">
                            <ModelProviderIcon
                              modelId={m.id}
                              className={`w-4 h-4 shrink-0 ${
                                isSelected ? 'text-white' : isLocked ? 'text-[#888888]' : 'text-[#a1a1aa]'
                              }`}
                            />
                            <div className="flex items-center gap-1.5 min-w-0 flex-1">
                              <span className="truncate">{m.name || formatModelDisplayName(m.id)}</span>
                              {m.minTierName && m.minTier !== 'FREE' && (
                                <span
                                  className="px-1.5 py-0.5 rounded text-[9.5px] font-semibold leading-none shrink-0"
                                  style={{
                                    backgroundColor:
                                      m.minTier === 'ULTRA'
                                        ? 'rgba(245, 158, 11, 0.15)'
                                        : m.minTier === 'PRO'
                                        ? 'rgba(139, 92, 246, 0.15)'
                                        : m.minTier === 'PLUS'
                                        ? 'rgba(156, 163, 175, 0.15)'
                                        : 'rgba(52, 211, 153, 0.15)',
                                    color:
                                      m.minTier === 'ULTRA'
                                        ? '#fbbf24'
                                        : m.minTier === 'PRO'
                                        ? '#c084fc'
                                        : m.minTier === 'PLUS'
                                        ? '#9ca3af'
                                        : '#34d399',
                                    border: `1px solid ${
                                      m.minTier === 'ULTRA'
                                        ? 'rgba(245, 158, 11, 0.3)'
                                        : m.minTier === 'PRO'
                                        ? 'rgba(139, 92, 246, 0.3)'
                                        : m.minTier === 'PLUS'
                                        ? 'rgba(156, 163, 175, 0.3)'
                                        : 'rgba(52, 211, 153, 0.3)'
                                    }`,
                                  }}
                                >
                                  {m.minTierName}
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0 ml-2">
                            {isLocked ? (
                              <Lock className="w-3.5 h-3.5 text-[#71717a]" />
                            ) : isSelected ? (
                              <span className="w-2 h-2 sm:w-1.5 sm:h-1.5 rounded-full bg-[#3b82f6]" />
                            ) : null}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </BottomSheet>

                {/* Upgrade flyout popover matching Screenshot 1 & 2 */}
                {hoveredLockedModel && typeof document !== 'undefined' && createPortal(
                  <div
                    data-floating-popover="true"
                    style={calculatePopoverStyle(hoveredLockedModel.rect)}
                    onMouseDown={(e) => e.stopPropagation()}
                    onPointerDown={(e) => e.stopPropagation()}
                    onMouseEnter={() => {
                      if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
                    }}
                    onMouseLeave={() => {
                      setHoveredLockedModel(null);
                    }}
                    className="bg-[#1c1c1e] border border-[#2f2f35] shadow-[0_12px_40px_rgba(0,0,0,0.6)] rounded-2xl p-4 w-[285px] animate-in fade-in zoom-in-95 duration-150 select-none z-[99999]"
                  >
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <span className="text-[13px] font-semibold text-white tracking-tight">
                        Akses model AI terbaik
                      </span>
                      <span
                        className="px-2 py-0.5 rounded-full text-[10px] font-semibold tracking-wide"
                        style={{
                          backgroundColor:
                            hoveredLockedModel.model.minTier === 'ULTRA'
                              ? 'rgba(245, 158, 11, 0.18)'
                              : hoveredLockedModel.model.minTier === 'PRO'
                              ? 'rgba(139, 92, 246, 0.18)'
                              : 'rgba(156, 163, 175, 0.18)',
                          color:
                            hoveredLockedModel.model.minTier === 'ULTRA'
                              ? '#fbbf24'
                              : hoveredLockedModel.model.minTier === 'PRO'
                              ? '#c084fc'
                              : '#9ca3af',
                          border: `1px solid ${
                            hoveredLockedModel.model.minTier === 'ULTRA'
                              ? 'rgba(245, 158, 11, 0.35)'
                              : hoveredLockedModel.model.minTier === 'PRO'
                              ? 'rgba(139, 92, 246, 0.35)'
                              : 'rgba(156, 163, 175, 0.35)'
                          }`,
                        }}
                      >
                        {hoveredLockedModel.model.minTierName || 'Pro'}
                      </span>
                    </div>

                    <p className="text-[11.5px] text-[#9ca3af] leading-relaxed mb-3.5">
                      Tingkatkan untuk mengakses model AI terbaru dari OpenAI, Anthropic (Claude), dan lainnya
                    </p>

                    <button
                      type="button"
                      onClick={() => {
                        setHoveredLockedModel(null);
                        setShowModelPicker(false);
                        handleOpenBilling();
                      }}
                      className="w-full py-2 px-3 rounded-xl bg-white/[0.08] hover:bg-white/[0.14] text-white text-[12px] font-medium transition-colors flex items-center justify-center gap-1.5 cursor-pointer border border-white/10 shadow-sm"
                    >
                      <span>Tingkatkan paket</span>
                      <ExternalLink className="w-3.5 h-3.5 text-[#9ca3af]" />
                    </button>
                  </div>,
                  document.body
                )}
              </div>
            </div>

            {/* Right: Mic & Submit/Stop Button */}
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  toggleVoiceInput();
                }}
                className={`w-7 h-7 rounded-full flex items-center justify-center transition-all cursor-pointer ${
                  isListening
                    ? 'bg-[#eb5757] hover:bg-[#e04a4a] text-white shadow-[0_0_12px_rgba(235,87,87,0.45)] ring-2 ring-[#eb5757]/30 scale-105'
                    : 'text-[#8c8c8c] hover:text-white hover:bg-white/[0.06]'
                }`}
                title={isListening ? 'Recording voice... Click to stop' : 'Voice input (Click to speak)'}
              >
                {isListening ? (
                  <div className="flex items-center justify-center gap-[3px] h-3.5" title="Recording voice (click to stop)">
                    <span
                      className="w-[3px] bg-white rounded-full transition-all duration-100 ease-out"
                      style={{
                        height: `${Math.max(3, 3 + Math.round(voiceLevels[0] * 9))}px`,
                      }}
                    />
                    <span
                      className="w-[3px] bg-white rounded-full transition-all duration-100 ease-out"
                      style={{
                        height: `${Math.max(3, 3 + Math.round(voiceLevels[1] * 11))}px`,
                      }}
                    />
                    <span
                      className="w-[3px] bg-white rounded-full transition-all duration-100 ease-out"
                      style={{
                        height: `${Math.max(3, 3 + Math.round(voiceLevels[2] * 9))}px`,
                      }}
                    />
                  </div>
                ) : (
                  <Mic className="w-3.5 h-3.5" />
                )}
              </button>

              {isStreaming ? (
                <div className="flex items-center gap-1.5">
                  {(!isEmpty || attachedImages.length > 0) && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSubmit();
                      }}
                      className={`px-2.5 py-1 rounded-lg text-white flex items-center gap-1 text-[11px] font-medium shadow-sm transition active:scale-95 cursor-pointer animate-fade-in ${
                        queuedMessagesMode === 'immediately'
                          ? 'bg-[#d97706] hover:bg-[#b45309]'
                          : 'bg-[#007acc] hover:bg-[#008be5]'
                      }`}
                      title={
                        queuedMessagesMode === 'immediately'
                          ? 'Send immediately and interrupt current turn (Enter)'
                          : 'Queue message to send after agent finishes (Enter)'
                      }
                    >
                      <ArrowUp className="w-3 h-3 stroke-[2.5]" />
                      <span>{queuedMessagesMode === 'immediately' ? 'Send Now' : 'Queue'}</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onStop?.();
                    }}
                    className="w-7 h-7 rounded-full bg-[#2e2e2e] hover:bg-[#ef4444] text-[#ef4444] hover:text-white flex items-center justify-center transition-colors cursor-pointer"
                    title="Stop generation"
                  >
                    <Square className="w-3 h-3 fill-current" />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleSubmit();
                  }}
                  className="w-7 h-7 rounded-full bg-[#2a2a2e] hover:bg-[#007acc] text-[#cccccc] hover:text-white flex items-center justify-center transition-colors cursor-pointer"
                  title="Send message (Enter)"
                >
                  <ArrowUp className="w-3.5 h-3.5 stroke-[2.5]" />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
      </div>
      </div>

      {/* High-Resolution Modal Lightbox for Image Preview */}
      {selectedPreviewImage && (
        <ImagePreviewModal
          isOpen={Boolean(selectedPreviewImage)}
          imageUrl={selectedPreviewImage.url}
          title={`[gambar:${selectedPreviewImage.id}]`}
          subtitle={selectedPreviewImage.name || 'screenshot'}
          onClose={() => setSelectedPreviewImage(null)}
        />
      )}
    </div>
  );
};
