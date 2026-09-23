'use client';

import React, { useState, useEffect } from 'react';
import {
  X,
  Info,
  Check,
  Save,
  Eye,
  EyeOff,
  Pencil,
  Folder,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Plus,
  Volume2,
  Monitor,
  Sun,
  Moon,
  Trash2,
  FileText,
  Copy,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import type { AidevSettings } from '@/lib/storage';
import type { ProjectRecord } from '@/lib/db';
import type { GatewayModel } from '@/lib/gateway';
import { playNotificationChime } from '@/lib/audio';
import { useTheme, LIGHT_PRESETS, DARK_PRESETS } from '@/context/theme-context';
import { PermissionsRulesModal, LocalPermissionsState, PermissionRuleCategory } from './permissions-rules-modal';
import { DirectoryPickerModal } from './directory-picker-modal';
import { BottomSheet } from '@/components/ui/bottom-sheet';
import { McpSettingsTab } from './mcp-settings-tab';
import { useConfirm } from '@/context/confirm-context';

// Sleek iOS/Antigravity-styled compact toggle switch
const ToggleSwitch: React.FC<{
  checked: boolean;
  onChange: (val: boolean) => void;
  ariaLabel?: string;
}> = ({ checked, onChange, ariaLabel }) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    aria-label={ariaLabel}
    onClick={() => onChange(!checked)}
    className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full p-0.5 transition-colors duration-200 ease-in-out focus:outline-none ${
      checked ? 'bg-blue-600' : 'bg-[#28282d] border border-[#38383e]'
    }`}
  >
    <span
      className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform duration-200 ease-in-out ${
        checked ? 'translate-x-4' : 'translate-x-0'
      }`}
    />
  </button>
);

// Permission preset options
const PERMISSION_PRESETS = [
  {
    id: 'auto' as const,
    label: 'Auto (Recommended)',
    desc: 'Automatically approve safe actions, request permission for critical actions.',
  },
  {
    id: 'ask' as const,
    label: 'Ask Every Time',
    desc: 'Always request permission before reading/modifying files or executing shell commands.',
  },
  {
    id: 'full' as const,
    label: 'Full Access',
    desc: 'Read/modify files and execute shell commands freely without confirmation.',
  },
];

// Language options
const LANGUAGE_OPTIONS = [
  {
    id: 'auto' as const,
    label: 'Auto-Detect',
    desc: 'Automatically detect and match user prompt language dynamically.',
  },
  {
    id: 'id' as const,
    label: 'Bahasa Indonesia',
    desc: 'AI explanations will always default to Indonesian (Bahasa Indonesia).',
  },
  {
    id: 'en' as const,
    label: 'English (US)',
    desc: 'AI explanations will always default to English (US).',
  },
];

// Browser Javascript Execution Policy options
const BROWSER_JS_POLICIES = [
  {
    id: 'Request Review' as const,
    label: 'Request Review',
    desc: 'Controls whether the agent can run custom JavaScript to automate complex browser actions.',
  },
  {
    id: 'Always Proceed' as const,
    label: 'Always Proceed',
    desc: 'The AI is authorized to run JavaScript automatically without asking for confirmation.',
  },
  {
    id: 'Disable' as const,
    label: 'Disable',
    desc: 'The AI cannot execute custom JavaScript, limiting it to basic navigation.',
  },
];

// Application Shell options
const SHELL_OPTIONS = [
  {
    id: 'powershell',
    label: 'Windows PowerShell',
    desc: 'Default Windows command execution shell (powershell.exe).',
  },
  {
    id: 'cmd',
    label: 'Command Prompt',
    desc: 'Legacy Windows batch and command interpreter (cmd.exe).',
  },
  {
    id: 'bash',
    label: 'Git Bash / WSL',
    desc: 'Unix-compatible bash shell emulation (bash.exe).',
  },
];

// Models & Reasoning Effort options
const MODEL_OPTIONS = [
  {
    id: 'gemini-3.8-flash-high',
    label: 'Gemini 3.8 Flash',
    badge: 'High Speed',
    desc: 'Ultra fast response time with strong coding reasoning.',
  },
  {
    id: 'gemini-3.8-pro-preview',
    label: 'Gemini 3.8 Pro Preview',
    badge: 'Deep Planning',
    desc: 'Best for complex architecture, planning, and multi-file refactoring.',
  },
  {
    id: 'claude-3-7-sonnet',
    label: 'Claude 3.7 Sonnet',
    badge: 'Hybrid Reasoning',
    desc: 'Anthropic flagship with dynamic chain-of-thought capabilities.',
  },
  {
    id: 'gpt-4o',
    label: 'GPT-4o',
    badge: 'Omni Reasoning',
    desc: 'OpenAI multi-modal high performance reasoning model.',
  },
];

const REASONING_EFFORT_OPTIONS = [
  {
    id: 'high',
    label: 'High',
    desc: 'Deep multi-turn chain of thought and step-by-step verification.',
  },
  {
    id: 'medium',
    label: 'Medium',
    desc: 'Balanced reasoning speed and cognitive depth for general coding.',
  },
  {
    id: 'low',
    label: 'Low',
    desc: 'Fast and concise output with minimal thinking overhead.',
  },
];

const REVIEW_POLICIES: Array<{ id: 'Always Proceed' | 'Ask on Edit' | 'Never Ask'; label: string; desc: string }> = [
  {
    id: 'Always Proceed',
    label: 'Always Proceed',
    desc: 'Automatically proceed with artifacts and updates without stopping for review.',
  },
  {
    id: 'Ask on Edit',
    label: 'Ask on Edit',
    desc: 'Prompt for confirmation whenever an existing artifact or document is updated.',
  },
  {
    id: 'Never Ask',
    label: 'Never Ask',
    desc: 'Silently generate and modify artifacts without review prompts.',
  },
];

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings?: AidevSettings | null;
  projects?: ProjectRecord[];
  currentProject?: ProjectRecord | null;
  initialTab?: string;
  models?: GatewayModel[];
  onModelsRefreshed?: (models: GatewayModel[]) => void;
  onUpdateProject?: (project: ProjectRecord) => void;
  onDeleteProject?: (projectId: string) => void;
  onSave?: (updated: Partial<AidevSettings>) => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  settings,
  projects = [],
  currentProject,
  initialTab,
  models,
  onModelsRefreshed,
  onUpdateProject,
  onDeleteProject,
  onSave,
}) => {
  // Active Tab: can be core settings tabs or a selected project
  type TabKey =
    | 'general'
    | 'application'
    | 'appearance'
    | 'models'
    | 'mcp'
    | 'customizations'
    | 'browser'
    | `project_${string}`;

  const [activeTab, setActiveTab] = useState<TabKey>(() => {
    if (initialTab) return initialTab as TabKey;
    return 'general';
  });
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false);

  // Derive active project if viewing a project tab
  const activeProjectId = activeTab.startsWith('project_') ? activeTab.replace('project_', '') : null;
  const activeProject = activeProjectId
    ? projects.find(
        (p) =>
          `project_${p.id}` === activeTab ||
          p.id === activeProjectId ||
          `project_${p.name}` === activeTab ||
          p.name === activeProjectId
      ) ||
      (currentProject && (currentProject.id === activeProjectId || currentProject.name === activeProjectId)
        ? currentProject
        : currentProject)
    : null;

  // Reset mobile view or jump to initialTab when modal opens
  useEffect(() => {
    if (isOpen) {
      if (initialTab) {
        setActiveTab(initialTab as TabKey);
        setMobileDetailOpen(true);
      } else {
        setMobileDetailOpen(false);
      }
    }
  }, [isOpen, initialTab]);

  // Live user profile from gateway API (/api/usage)
  const [profileUser, setProfileUser] = useState<{
    name: string;
    email: string;
    image?: string | null;
    isByok?: boolean;
  } | null>(null);

  useEffect(() => {
    fetch('/api/usage')
      .then((res) => res.json())
      .then((data) => {
        if (data && data.user) {
          setProfileUser({
            name: data.user.name || '',
            email: data.user.email || '',
            image: data.user.image || null,
            isByok: data.mode === 'byok',
          });
        }
      })
      .catch(() => {});
  }, []);

  const {
    setTheme: setGlobalTheme,
    setChatWidth: setGlobalChatWidth,
    setLightPreset: setGlobalLightPreset,
    setDarkPreset: setGlobalDarkPreset,
    setContrast: setGlobalContrast,
    setCustomColor: setGlobalCustomColor,
  } = useTheme();
  const { alert: customAlert, confirm: customConfirm } = useConfirm();
  const [isDeletingProject, setIsDeletingProject] = useState(false);

  // General execution settings
  const [queuedMode, setQueuedMode] = useState<'queue' | 'immediately'>('queue');
  const [showShortcutsModal, setShowShortcutsModal] = useState(false);

  // General - User-specified additions
  const [autoScrollStreaming, setAutoScrollStreaming] = useState(true);
  const [soundNotifications, setSoundNotifications] = useState(true);
  const [permissionPreset, setPermissionPreset] = useState<'auto' | 'ask' | 'full'>('auto');
  const [workspaceConfinement, setWorkspaceConfinement] = useState(true);
  const [responseLanguage, setResponseLanguage] = useState<'auto' | 'id' | 'en'>('auto');
  const [openDropdown, setOpenDropdown] = useState<
    | 'none'
    | 'permission'
    | 'language'
    | 'lightPreset'
    | 'darkPreset'
    | 'browserJsPolicy'
    | 'defaultShell'
    | 'defaultModel'
    | 'reasoningEffort'
    | 'securityPreset'
    | 'reviewPolicy'
  >('none');

  // Project settings (interactive per project view)
  const [showAllProjects, setShowAllProjects] = useState(false);
  const [isEditingProjectName, setIsEditingProjectName] = useState(false);
  const [editingProjectNameVal, setEditingProjectNameVal] = useState('');
  const [isSavingProjectName, setIsSavingProjectName] = useState(false);
  const [projectFolders, setProjectFolders] = useState<string[]>([]);
  const [showAddFolderModal, setShowAddFolderModal] = useState(false);
  const [securityPreset, setSecurityPreset] = useState<'auto' | 'ask' | 'full'>('auto');
  const [reviewPolicy, setReviewPolicy] = useState<'Always Proceed' | 'Ask on Edit' | 'Never Ask'>('Always Proceed');

  // Appearance states (Images 1 & 2)
  const [theme, setTheme] = useState<'dark' | 'light' | 'system'>('system');
  const [contrast, setContrast] = useState<'default' | 'strong'>('default');
  const [lightPreset, setLightPreset] = useState('Default Light');
  const [lightBg, setLightBg] = useState('#F9F9F9');
  const [lightFg, setLightFg] = useState('#101010');
  const [lightAccent, setLightAccent] = useState('#007ACC');
  const [darkPreset, setDarkPreset] = useState('Default Dark');
  const [darkBg, setDarkBg] = useState('#101010');
  const [darkFg, setDarkFg] = useState('#CCCCCC');
  const [darkAccent, setDarkAccent] = useState('#007ACC');
  const [verboseChat, setVerboseChat] = useState(true);
  const [chatWidth, setChatWidth] = useState<'narrow' | 'default' | 'wide'>('default');

  // Browser settings (media_1789930071924.png)
  const [browserJsPolicy, setBrowserJsPolicy] = useState<'Request Review' | 'Always Proceed' | 'Disable'>('Request Review');
  const [showActuationRulesModal, setShowActuationRulesModal] = useState(false);
  const [actuationRules, setActuationRules] = useState<string[]>([
    'https://github.com/*',
    'https://*.google.com/*',
    'https://stackoverflow.com/*',
  ]);
  const [newActuationRule, setNewActuationRule] = useState('');

  // Legacy / other form states
  const [soundEffects, setSoundEffects] = useState(true);
  const [autoScroll, setAutoScroll] = useState(true);
  const [language, setLanguage] = useState('en-US');

  // AI & Models
  const [gatewayUrl, setGatewayUrl] = useState('http://localhost:3000/v1');
  const [apiKey, setApiKey] = useState('sk-aidev-default-gateway-key');
  const [showApiKey, setShowApiKey] = useState(false);
  const [defaultModel, setDefaultModel] = useState('gemini-3.8-flash-high');
  const [reasoningEffort, setReasoningEffort] = useState<'low' | 'medium' | 'high'>('high');
  const [dynamicModels, setDynamicModels] = useState<GatewayModel[]>(() => models || []);
  const [isRefreshingModels, setIsRefreshingModels] = useState(false);

  // Application
  const [defaultShell, setDefaultShell] = useState('powershell');
  const [terminalTimeout, setTerminalTimeout] = useState(120);
  const [autoUpdate, setAutoUpdate] = useState(true);
  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false);
  const [updateStatus, setUpdateStatus] = useState<'latest' | 'checking' | null>(null);

  // Local Permissions Modal states (Phase 4)
  const [showPermissionsModal, setShowPermissionsModal] = useState(false);
  const [permissionsCategory, setPermissionsCategory] = useState<PermissionRuleCategory>('files');
  const [localPermissions, setLocalPermissions] = useState<LocalPermissionsState>({
    fileRules: ['src/**', 'package.json', 'public/**', 'tsconfig.json'],
    networkRules: ['https://github.com/*', 'https://*.google.com/*', 'https://registry.npmjs.org/*'],
    terminalRules: ['npm run *', 'git status', 'git diff', 'ls', 'dir', 'pnpm *'],
  });

  // Appearance - legacy fallback
  const [fontSize, setFontSize] = useState<'sm' | 'base' | 'lg'>('base');
  const [compactMode, setCompactMode] = useState(false);

  // Customizations
  const [autoDiscoverSkills, setAutoDiscoverSkills] = useState(true);
  const [customSkillsDir, setCustomSkillsDir] = useState('~/.aidev/skills');

  // Customizations - Skills Management (media_1789930464132.png)
  interface SkillItem {
    name: string;
    path: string;
    description: string;
    scope: 'workspace' | 'global' | 'builtin' | 'installed';
    used?: boolean;
  }
  const [skillsList, setSkillsList] = useState<SkillItem[]>([]);
  const [loadingSkills, setLoadingSkills] = useState(false);
  const [skillsAccordionOpen, setSkillsAccordionOpen] = useState(true);
  const [copiedSkillPath, setCopiedSkillPath] = useState<string | null>(null);

  // Add Skill Modal states
  const [showAddSkillModal, setShowAddSkillModal] = useState(false);
  const [addSkillTab, setAddSkillTab] = useState<'create' | 'import' | 'paste'>('create');
  const [newSkillName, setNewSkillName] = useState('');
  const [newSkillDescription, setNewSkillDescription] = useState('');
  const [newSkillContent, setNewSkillContent] = useState('');
  const [importSkillUrl, setImportSkillUrl] = useState('');
  const [rawSkillMarkdown, setRawSkillMarkdown] = useState('');
  const [isSubmittingSkill, setIsSubmittingSkill] = useState(false);
  const [skillFormError, setSkillFormError] = useState<string | null>(null);

  // Preview Skill Modal states
  const [selectedSkillPreview, setSelectedSkillPreview] = useState<SkillItem | null>(null);
  const [previewContent, setPreviewContent] = useState<string>('');
  const [loadingPreview, setLoadingPreview] = useState(false);

  // Delete Skill confirm state
  const [skillToDelete, setSkillToDelete] = useState<SkillItem | null>(null);
  const [isDeletingSkill, setIsDeletingSkill] = useState(false);

  // Browser - legacy
  const [browserMode, setBrowserMode] = useState<'internal' | 'system'>('internal');
  const [searchProvider, setSearchProvider] = useState('duckduckgo');

  // Toast / Save feedback
  const [isSaved, setIsSaved] = useState(false);

  // Close dropdown on outside click
  useEffect(() => {
    if (openDropdown === 'none') return;
    const handleClickOutside = () => setOpenDropdown('none');
    window.addEventListener('click', handleClickOutside);
    return () => window.removeEventListener('click', handleClickOutside);
  }, [openDropdown]);

  // Load General & Appearance settings from localStorage on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('aidev_queued_messages') as 'queue' | 'immediately';
      if (saved === 'queue' || saved === 'immediately') {
        setQueuedMode(saved);
      }
      const savedAutoScroll = localStorage.getItem('aidev_auto_scroll_streaming');
      if (savedAutoScroll !== null) {
        setAutoScrollStreaming(savedAutoScroll === 'true');
        setAutoScroll(savedAutoScroll === 'true');
      }
      const savedSound = localStorage.getItem('aidev_sound_notifications');
      if (savedSound !== null) {
        setSoundNotifications(savedSound === 'true');
        setSoundEffects(savedSound === 'true');
      }
      const savedPreset = localStorage.getItem('aidev_permission_preset') as 'auto' | 'ask' | 'full';
      if (savedPreset === 'auto' || savedPreset === 'ask' || savedPreset === 'full') {
        setPermissionPreset(savedPreset);
      }
      const savedConfinement = localStorage.getItem('aidev_workspace_confinement');
      if (savedConfinement !== null) {
        setWorkspaceConfinement(savedConfinement === 'true');
      }
      const savedLang = localStorage.getItem('aidev_response_language') as 'auto' | 'id' | 'en';
      if (savedLang === 'auto' || savedLang === 'id' || savedLang === 'en') {
        setResponseLanguage(savedLang);
      }

      // Appearance preferences
      const savedTheme = localStorage.getItem('aidev_theme') as 'system' | 'light' | 'dark';
      if (savedTheme === 'system' || savedTheme === 'light' || savedTheme === 'dark') {
        setTheme(savedTheme);
      }
      const savedContrast = localStorage.getItem('aidev_contrast') as 'default' | 'strong';
      if (savedContrast === 'default' || savedContrast === 'strong') {
        setContrast(savedContrast);
      }
      const savedVerbose = localStorage.getItem('aidev_verbose_chat');
      if (savedVerbose !== null) {
        setVerboseChat(savedVerbose === 'true');
      } else if (settings?.verboseChat !== undefined) {
        setVerboseChat(settings.verboseChat);
      }
      const savedAutoDiscover = localStorage.getItem('aidev_auto_discover_skills');
      if (savedAutoDiscover !== null) {
        setAutoDiscoverSkills(savedAutoDiscover === 'true');
      } else if (settings?.autoDiscoverSkills !== undefined) {
        setAutoDiscoverSkills(settings.autoDiscoverSkills);
      }
      const savedWidth = localStorage.getItem('aidev_chat_width') as 'narrow' | 'default' | 'wide';
      if (savedWidth === 'narrow' || savedWidth === 'default' || savedWidth === 'wide') {
        setChatWidth(savedWidth);
      }
      const savedLightPreset = localStorage.getItem('aidev_light_preset');
      if (savedLightPreset) {
        setLightPreset(savedLightPreset);
        const p = LIGHT_PRESETS.find((x) => x.id === savedLightPreset);
        if (p) {
          setLightBg(p.bg);
          setLightFg(p.fg);
          setLightAccent(p.accent);
        }
      }
      const savedDarkPreset = localStorage.getItem('aidev_dark_preset');
      if (savedDarkPreset) {
        setDarkPreset(savedDarkPreset);
        const p = DARK_PRESETS.find((x) => x.id === savedDarkPreset);
        if (p) {
          setDarkBg(p.bg);
          setDarkFg(p.fg);
          setDarkAccent(p.accent);
        }
      }

      // Browser settings (media_1789930071924.png)
      const savedJsPolicy = localStorage.getItem('aidev_browser_js_policy') as
        | 'Request Review'
        | 'Always Proceed'
        | 'Disable';
      if (savedJsPolicy === 'Request Review' || savedJsPolicy === 'Always Proceed' || savedJsPolicy === 'Disable') {
        setBrowserJsPolicy(savedJsPolicy);
      }
      const savedRules = localStorage.getItem('aidev_browser_actuation_rules');
      if (savedRules) {
        try {
          const parsed = JSON.parse(savedRules);
          if (Array.isArray(parsed)) setActuationRules(parsed);
        } catch {}
      }

      // Application & Models preferences
      const savedTimeout = localStorage.getItem('aidev_terminal_timeout');
      if (savedTimeout) {
        setTerminalTimeout(Number(savedTimeout));
      } else if (settings?.commandTimeout) {
        setTerminalTimeout(settings.commandTimeout);
      }
      const savedAutoUpdate = localStorage.getItem('aidev_auto_update');
      if (savedAutoUpdate !== null) {
        setAutoUpdate(savedAutoUpdate === 'true');
      }
      const savedShell = localStorage.getItem('aidev_default_shell');
      if (savedShell) setDefaultShell(savedShell);
      const savedReasoning = localStorage.getItem('aidev_reasoning_effort') as 'low' | 'medium' | 'high';
      if (savedReasoning === 'low' || savedReasoning === 'medium' || savedReasoning === 'high') {
        setReasoningEffort(savedReasoning);
      }

      // Local permissions hydration
      const savedPerms = localStorage.getItem('aidev_local_permissions');
      if (savedPerms) {
        try {
          const parsed = JSON.parse(savedPerms);
          if (parsed && typeof parsed === 'object') {
            setLocalPermissions((prev) => ({ ...prev, ...parsed }));
          }
        } catch {}
      } else if (settings?.projectLocalPermissions) {
        setLocalPermissions(settings.projectLocalPermissions);
      }
    }
  }, [settings]);

  const syncSettingToBackend = (patch: Partial<AidevSettings>) => {
    onSave?.(patch);
    if (typeof window !== 'undefined') {
      fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      }).catch(() => {});
    }
  };

  const handleSetDefaultShell = (val: string) => {
    setDefaultShell(val);
    if (typeof window !== 'undefined') {
      localStorage.setItem('aidev_default_shell', val);
    }
    syncSettingToBackend({ defaultShell: val });
  };

  const handleSetReasoningEffort = (val: 'low' | 'medium' | 'high') => {
    setReasoningEffort(val);
    if (typeof window !== 'undefined') {
      localStorage.setItem('aidev_reasoning_effort', val);
    }
    syncSettingToBackend({ reasoningEffort: val });
  };

  const handleSaveLocalPermissions = (updated: LocalPermissionsState) => {
    setLocalPermissions(updated);
    if (typeof window !== 'undefined') {
      localStorage.setItem('aidev_local_permissions', JSON.stringify(updated));
      if (activeProject) {
        localStorage.setItem(`aidev_project_permissions_${activeProject.id}`, JSON.stringify(updated));
      }
    }
    syncSettingToBackend({ projectLocalPermissions: updated });
  };

  // Load project-scoped configurations when activeProject changes
  useEffect(() => {
    if (activeProject && typeof window !== 'undefined') {
      const pid = activeProject.id;
      const savedPerms = localStorage.getItem(`aidev_project_permissions_${pid}`);
      if (savedPerms) {
        try {
          setLocalPermissions(JSON.parse(savedPerms));
        } catch {}
      } else {
        setLocalPermissions({
          fileRules: ['src/**', 'package.json', 'public/**', 'tsconfig.json'],
          networkRules: ['https://github.com/*', 'https://*.google.com/*', 'https://registry.npmjs.org/*'],
          terminalRules: ['npm run *', 'git status', 'git diff', 'ls', 'dir', 'pnpm *'],
        });
      }

      const savedSecurity = localStorage.getItem(`aidev_project_security_${pid}`);
      if (savedSecurity && (savedSecurity === 'auto' || savedSecurity === 'ask' || savedSecurity === 'full')) {
        setSecurityPreset(savedSecurity as any);
      } else {
        setSecurityPreset('auto');
      }

      const savedReview = localStorage.getItem(`aidev_project_review_policy_${pid}`);
      if (savedReview && (savedReview === 'Always Proceed' || savedReview === 'Ask on Edit' || savedReview === 'Never Ask')) {
        setReviewPolicy(savedReview as any);
      } else {
        setReviewPolicy('Always Proceed');
      }

      const savedFolders = localStorage.getItem(`aidev_project_folders_${pid}`);
      if (savedFolders) {
        try {
          const parsed = JSON.parse(savedFolders);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setProjectFolders(parsed);
          } else {
            setProjectFolders([activeProject.workdir_path]);
          }
        } catch {
          setProjectFolders([activeProject.workdir_path]);
        }
      } else {
        setProjectFolders([activeProject.workdir_path]);
        if (typeof window !== 'undefined') {
          fetch(`/api/projects/folders?projectId=${pid}`)
            .then((r) => r.json())
            .then((data) => {
              if (Array.isArray(data?.folders) && data.folders.length > 0) {
                setProjectFolders(data.folders);
                localStorage.setItem(`aidev_project_folders_${pid}`, JSON.stringify(data.folders));
              }
            })
            .catch(() => {});
        }
      }
    }
  }, [activeProject?.id, activeProject?.workdir_path]);

  const handleSetSecurityPreset = (preset: 'auto' | 'ask' | 'full') => {
    setSecurityPreset(preset);
    if (activeProject && typeof window !== 'undefined') {
      localStorage.setItem(`aidev_project_security_${activeProject.id}`, preset);
    }
  };

  const handleSetReviewPolicy = (policy: 'Always Proceed' | 'Ask on Edit' | 'Never Ask') => {
    setReviewPolicy(policy);
    if (activeProject && typeof window !== 'undefined') {
      localStorage.setItem(`aidev_project_review_policy_${activeProject.id}`, policy);
    }
  };

  const handleSaveProjectName = async () => {
    if (!activeProject || !editingProjectNameVal.trim() || editingProjectNameVal.trim() === activeProject.name) {
      setIsEditingProjectName(false);
      return;
    }
    setIsSavingProjectName(true);
    try {
      const res = await fetch('/api/projects', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: activeProject.id, name: editingProjectNameVal.trim() }),
      });
      const data = await res.json();
      if (data.project) {
        onUpdateProject?.(data.project);
      }
    } catch (e) {
      console.error('Failed to rename project:', e);
    } finally {
      setIsSavingProjectName(false);
      setIsEditingProjectName(false);
    }
  };

  const handleAddFolder = (newPath: string) => {
    if (!activeProject || !newPath) return;
    const normalized = newPath.replace(/\\/g, '/').toLowerCase();
    if (!projectFolders.some((f) => f.replace(/\\/g, '/').toLowerCase() === normalized)) {
      const updated = [...projectFolders, newPath];
      setProjectFolders(updated);
      if (typeof window !== 'undefined') {
        localStorage.setItem(`aidev_project_folders_${activeProject.id}`, JSON.stringify(updated));
        fetch('/api/projects/folders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ projectId: activeProject.id, folders: updated }),
        }).catch(() => {});
      }
    }
    setShowAddFolderModal(false);
  };

  const handleRemoveFolder = (folderPath: string) => {
    if (!activeProject) return;
    if (projectFolders.length <= 1) {
      customAlert({
        title: 'Workspace Folder',
        message: 'Cannot remove the primary workspace folder.',
        variant: 'warning',
      });
      return;
    }
    const updated = projectFolders.filter((f) => f !== folderPath);
    setProjectFolders(updated);
    if (typeof window !== 'undefined') {
      localStorage.setItem(`aidev_project_folders_${activeProject.id}`, JSON.stringify(updated));
      fetch('/api/projects/folders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: activeProject.id, folders: updated }),
      }).catch(() => {});
    }
  };

  const handleDeleteProject = async () => {
    if (!activeProject) return;
    const confirmed = await customConfirm({
      title: 'Delete Project',
      message: `Are you sure you want to delete "${activeProject.name}" from AI Dev?\n\nThis will remove all runtime sessions, chat history, snapshots, and index entries for this project.\n\nYour actual files and workspace directory on disk will NOT be deleted.`,
      confirmText: 'Delete Project',
      cancelText: 'Cancel',
      variant: 'danger',
    });
    if (!confirmed) return;

    setIsDeletingProject(true);
    try {
      const res = await fetch(`/api/projects?id=${encodeURIComponent(activeProject.id)}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        await customAlert({
          title: 'Delete Project Failed',
          message: data.error || 'Failed to delete project from system.',
          variant: 'danger',
        });
        return;
      }

      // Remove local storage keys for this project
      if (typeof window !== 'undefined') {
        localStorage.removeItem(`aidev_project_folders_${activeProject.id}`);
        localStorage.removeItem(`project_security_preset_${activeProject.id}`);
        localStorage.removeItem(`project_review_policy_${activeProject.id}`);
        localStorage.removeItem(`local_permissions_${activeProject.id}`);
      }

      if (onDeleteProject) {
        onDeleteProject(activeProject.id);
      }

      await customAlert({
        title: 'Project Deleted',
        message: `Project "${activeProject.name}" and its runtime data have been removed from the system.`,
        variant: 'info',
      });

      setActiveTab('general');
    } catch (err: any) {
      await customAlert({
        title: 'Delete Project Error',
        message: err.message || 'Failed to delete project.',
        variant: 'danger',
      });
    } finally {
      setIsDeletingProject(false);
    }
  };

  interface SystemVersionData {
    name: string;
    version: string;
    git?: { commit: string; branch: string; clean: boolean };
    runtime?: { node: string; platform: string; arch: string; uptimeSeconds: number; memoryMb: number };
    status: 'latest' | 'checking';
    checkedAt: number;
  }
  const [versionData, setVersionData] = useState<SystemVersionData | null>(null);

  const handleCheckForUpdates = async () => {
    setIsCheckingUpdate(true);
    setUpdateStatus('checking');
    try {
      const res = await fetch('/api/system/version');
      if (res.ok) {
        const data = await res.json();
        setVersionData(data);
        setUpdateStatus('latest');
      } else {
        setUpdateStatus('latest');
      }
    } catch {
      setUpdateStatus('latest');
    } finally {
      setIsCheckingUpdate(false);
    }
  };

  const handleSetAutoUpdate = (val: boolean) => {
    setAutoUpdate(val);
    if (typeof window !== 'undefined') {
      localStorage.setItem('aidev_auto_update', String(val));
    }
  };

  useEffect(() => {
    if (isOpen && activeTab === 'application' && autoUpdate && !versionData) {
      handleCheckForUpdates();
    }
  }, [isOpen, activeTab, autoUpdate, versionData]);

  const handleSetTerminalTimeout = (val: number) => {
    setTerminalTimeout(val);
    if (typeof window !== 'undefined') {
      localStorage.setItem('aidev_terminal_timeout', String(val));
    }
    syncSettingToBackend({ commandTimeout: val });
  };

  const handleSetQueuedMode = (mode: 'queue' | 'immediately') => {
    setQueuedMode(mode);
    if (typeof window !== 'undefined') {
      localStorage.setItem('aidev_queued_messages', mode);
    }
    syncSettingToBackend({ queuedMessagesMode: mode });
  };

  const handleSetAutoScrollStreaming = (val: boolean) => {
    setAutoScrollStreaming(val);
    setAutoScroll(val);
    if (typeof window !== 'undefined') {
      localStorage.setItem('aidev_auto_scroll_streaming', String(val));
    }
    syncSettingToBackend({ autoScrollStreaming: val });
  };

  const handleSetSoundNotifications = (val: boolean) => {
    setSoundNotifications(val);
    setSoundEffects(val);
    if (typeof window !== 'undefined') {
      localStorage.setItem('aidev_sound_notifications', String(val));
    }
    syncSettingToBackend({ soundNotifications: val });
    if (val) {
      playNotificationChime();
    }
  };

  const handleSetPermissionPreset = (val: 'auto' | 'ask' | 'full') => {
    setPermissionPreset(val);
    if (typeof window !== 'undefined') {
      localStorage.setItem('aidev_permission_preset', val);
    }
    syncSettingToBackend({ permissionPreset: val });
  };

  const handleSetWorkspaceConfinement = (val: boolean) => {
    setWorkspaceConfinement(val);
    if (typeof window !== 'undefined') {
      localStorage.setItem('aidev_workspace_confinement', String(val));
    }
    syncSettingToBackend({ workspaceConfinement: val });
  };

  const handleSetResponseLanguage = (val: 'auto' | 'id' | 'en') => {
    setResponseLanguage(val);
    if (typeof window !== 'undefined') {
      localStorage.setItem('aidev_response_language', val);
    }
    syncSettingToBackend({ responseLanguage: val });
  };

  // Appearance tab handlers
  const handleSetTheme = (t: 'system' | 'light' | 'dark') => {
    setTheme(t);
    setGlobalTheme(t);
    if (typeof window !== 'undefined') {
      localStorage.setItem('aidev_theme', t);
    }
    syncSettingToBackend({ theme: t });
  };

  const handleSetContrast = (c: 'default' | 'strong') => {
    setContrast(c);
    setGlobalContrast(c);
    if (typeof window !== 'undefined') {
      localStorage.setItem('aidev_contrast', c);
    }
  };

  const handleSetLightPreset = (presetName: string) => {
    setLightPreset(presetName);
    setGlobalLightPreset(presetName);
    const p = LIGHT_PRESETS.find((x) => x.id === presetName);
    if (p) {
      setLightBg(p.bg);
      setLightFg(p.fg);
      setLightAccent(p.accent);
    }
    if (typeof window !== 'undefined') {
      localStorage.setItem('aidev_light_preset', presetName);
    }
  };

  const handleSetDarkPreset = (presetName: string) => {
    setDarkPreset(presetName);
    setGlobalDarkPreset(presetName);
    const p = DARK_PRESETS.find((x) => x.id === presetName);
    if (p) {
      setDarkBg(p.bg);
      setDarkFg(p.fg);
      setDarkAccent(p.accent);
    }
    if (typeof window !== 'undefined') {
      localStorage.setItem('aidev_dark_preset', presetName);
    }
  };

  const handleSetVerboseChat = (val: boolean) => {
    setVerboseChat(val);
    if (typeof window !== 'undefined') {
      localStorage.setItem('aidev_verbose_chat', String(val));
      window.dispatchEvent(new CustomEvent('aidev-verbose-chat-change', { detail: val }));
    }
    syncSettingToBackend({ verboseChat: val });
  };

  const handleSetAutoDiscoverSkills = (val: boolean) => {
    setAutoDiscoverSkills(val);
    if (typeof window !== 'undefined') {
      localStorage.setItem('aidev_auto_discover_skills', String(val));
      window.dispatchEvent(new CustomEvent('aidev-auto-discover-skills-change', { detail: val }));
    }
    syncSettingToBackend({ autoDiscoverSkills: val });
  };

  const handleSetChatWidth = (w: 'narrow' | 'default' | 'wide') => {
    setChatWidth(w);
    setGlobalChatWidth(w);
    if (typeof window !== 'undefined') {
      localStorage.setItem('aidev_chat_width', w);
    }
  };

  // Browser tab handlers (media_1789930071924.png)
  const handleSetBrowserJsPolicy = (val: 'Request Review' | 'Always Proceed' | 'Disable') => {
    setBrowserJsPolicy(val);
    if (typeof window !== 'undefined') {
      localStorage.setItem('aidev_browser_js_policy', val);
    }
    syncSettingToBackend({ browserJsPolicy: val });
  };

  const handleAddActuationRule = () => {
    if (!newActuationRule.trim()) return;
    const updated = [...actuationRules, newActuationRule.trim()];
    setActuationRules(updated);
    setNewActuationRule('');
    if (typeof window !== 'undefined') {
      localStorage.setItem('aidev_browser_actuation_rules', JSON.stringify(updated));
    }
    syncSettingToBackend({ browserActuationRules: updated });
  };

  const handleRemoveActuationRule = (idx: number) => {
    const updated = actuationRules.filter((_, i) => i !== idx);
    setActuationRules(updated);
    if (typeof window !== 'undefined') {
      localStorage.setItem('aidev_browser_actuation_rules', JSON.stringify(updated));
    }
    syncSettingToBackend({ browserActuationRules: updated });
  };

  // Skills Management Handlers
  const fetchSkills = async () => {
    setLoadingSkills(true);
    try {
      const workdirParam = currentProject?.workdir_path
        ? `?workdir=${encodeURIComponent(currentProject.workdir_path)}`
        : '';
      const res = await fetch(`/api/skills${workdirParam}`);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.skills)) {
          setSkillsList(data.skills);
        }
      }
    } catch (err) {
      console.error('Failed fetching skills:', err);
    } finally {
      setLoadingSkills(false);
    }
  };

  useEffect(() => {
    if (isOpen && activeTab === 'customizations') {
      fetchSkills();
    }
  }, [isOpen, activeTab, currentProject?.workdir_path]);

  const handleSaveSkill = async () => {
    setSkillFormError(null);
    setIsSubmittingSkill(true);

    try {
      let payload: any = {
        workdir: currentProject?.workdir_path || '',
      };

      if (addSkillTab === 'create') {
        if (!newSkillName.trim()) {
          setSkillFormError('Skill name is required.');
          setIsSubmittingSkill(false);
          return;
        }
        payload.name = newSkillName.trim();
        payload.description = newSkillDescription.trim() || `Custom skill for ${newSkillName.trim()}`;
        payload.content = newSkillContent.trim() || `# ${newSkillName.trim()}\n\nProvide agent instructions here.`;
      } else if (addSkillTab === 'import') {
        if (!importSkillUrl.trim()) {
          setSkillFormError('Repository URL or SKILL.md file is required.');
          setIsSubmittingSkill(false);
          return;
        }
        payload.importUrl = importSkillUrl.trim();
        if (newSkillName.trim()) payload.name = newSkillName.trim();
        if (newSkillDescription.trim()) payload.description = newSkillDescription.trim();
      } else if (addSkillTab === 'paste') {
        if (!rawSkillMarkdown.trim()) {
          setSkillFormError('SKILL.md markdown content is required.');
          setIsSubmittingSkill(false);
          return;
        }
        payload.content = rawSkillMarkdown.trim();
        const nameMatch = /^name:\s*([^\r\n]+)/m.exec(rawSkillMarkdown);
        payload.name = nameMatch && nameMatch[1] ? nameMatch[1].trim() : (newSkillName.trim() || 'custom-skill');
        const descMatch = /^description:\s*([^\r\n]+)/m.exec(rawSkillMarkdown);
        payload.description = descMatch && descMatch[1] ? descMatch[1].trim() : (newSkillDescription.trim() || `Skill ${payload.name}`);
      }

      const res = await fetch('/api/skills', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok || data.error) {
        setSkillFormError(data.error || 'Failed to save skill');
        setIsSubmittingSkill(false);
        return;
      }

      setShowAddSkillModal(false);
      setNewSkillName('');
      setNewSkillDescription('');
      setNewSkillContent('');
      setImportSkillUrl('');
      setRawSkillMarkdown('');
      setSkillFormError(null);

      await fetchSkills();
    } catch (err: any) {
      setSkillFormError(err.message || 'An error occurred while saving skill.');
    } finally {
      setIsSubmittingSkill(false);
    }
  };

  const handleDeleteSkill = async () => {
    if (!skillToDelete) return;
    setIsDeletingSkill(true);
    try {
      const res = await fetch(`/api/skills?path=${encodeURIComponent(skillToDelete.path)}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        customAlert({
          title: 'Delete Skill',
          message: data.error || 'Failed to delete skill',
          variant: 'danger',
        });
      } else {
        setSkillToDelete(null);
        await fetchSkills();
      }
    } catch (err: any) {
      customAlert({
        title: 'Delete Skill Error',
        message: err.message || 'Failed to delete skill',
        variant: 'danger',
      });
    } finally {
      setIsDeletingSkill(false);
    }
  };

  const handlePreviewSkill = async (skill: SkillItem) => {
    setSelectedSkillPreview(skill);
    setLoadingPreview(true);
    setPreviewContent('');
    try {
      const res = await fetch(`/api/skills?path=${encodeURIComponent(skill.path)}`);
      if (res.ok) {
        const data = await res.json();
        setPreviewContent(data.content || '');
      } else {
        setPreviewContent('Failed to load SKILL.md file content.');
      }
    } catch {
      setPreviewContent('An error occurred while loading skill content.');
    } finally {
      setLoadingPreview(false);
    }
  };

  const handleCopySkillPath = (skill: SkillItem, e: React.MouseEvent) => {
    e.stopPropagation();
    if (typeof window !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(skill.path);
      setCopiedSkillPath(skill.name);
      setTimeout(() => setCopiedSkillPath(null), 2000);
    }
  };

  // Sync settings when props change
  useEffect(() => {
    if (settings) {
      if (settings.gatewayUrl) setGatewayUrl(settings.gatewayUrl);
      if (settings.apiKey) setApiKey(settings.apiKey);
      if (settings.defaultModel) setDefaultModel(settings.defaultModel);
      if (settings.theme) {
        setTheme(settings.theme);
        setGlobalTheme(settings.theme);
      }
    }
  }, [settings, setGlobalTheme]);

  // Fetch /api/config on mount
  useEffect(() => {
    fetch('/api/config')
      .then((r) => r.json())
      .then((d) => {
        if (d.settings) {
          if (d.settings.gatewayUrl) setGatewayUrl(d.settings.gatewayUrl);
          if (d.settings.apiKey) setApiKey(d.settings.apiKey);
          if (d.settings.defaultModel) setDefaultModel(d.settings.defaultModel);
          if (d.settings.theme) {
            setTheme(d.settings.theme);
            setGlobalTheme(d.settings.theme);
          }
          if (d.settings.responseLanguage) setResponseLanguage(d.settings.responseLanguage);
          if (d.settings.defaultShell) setDefaultShell(d.settings.defaultShell);
          if (d.settings.reasoningEffort) setReasoningEffort(d.settings.reasoningEffort);
          if (typeof d.settings.soundNotifications === 'boolean') setSoundNotifications(d.settings.soundNotifications);
          if (typeof d.settings.autoScrollStreaming === 'boolean') setAutoScrollStreaming(d.settings.autoScrollStreaming);
          if (typeof d.settings.workspaceConfinement === 'boolean') setWorkspaceConfinement(d.settings.workspaceConfinement);
          if (d.settings.permissionPreset) setPermissionPreset(d.settings.permissionPreset);
        }
      })
      .catch(() => {});
  }, [setGlobalTheme]);

  // Sync dynamic models if passed via props or fetch from /api/models
  useEffect(() => {
    if (models && models.length > 0) {
      setDynamicModels(models);
    } else if (isOpen) {
      fetch('/api/models')
        .then((r) => r.json())
        .then((d) => {
          if (d.models && Array.isArray(d.models) && d.models.length > 0) {
            setDynamicModels(d.models);
          }
        })
        .catch(() => {});
    }
  }, [models, isOpen]);

  const handleRefreshModels = async () => {
    setIsRefreshingModels(true);
    try {
      const res = await fetch('/api/models?refresh=true');
      const data = await res.json();
      if (data.models && Array.isArray(data.models) && data.models.length > 0) {
        setDynamicModels(data.models);
        onModelsRefreshed?.(data.models);
      }
    } catch (err) {
      console.error('Failed to refresh models cache:', err);
    } finally {
      setIsRefreshingModels(false);
    }
  };

  // Keyboard shortcut: ESC to close
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showShortcutsModal) {
          setShowShortcutsModal(false);
          return;
        }
        if (showActuationRulesModal) {
          setShowActuationRulesModal(false);
          return;
        }
        if (showAddSkillModal) {
          setShowAddSkillModal(false);
          return;
        }
        if (selectedSkillPreview) {
          setSelectedSkillPreview(null);
          return;
        }
        if (skillToDelete) {
          setSkillToDelete(null);
          return;
        }
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, showShortcutsModal, onClose]);

  if (!isOpen) return null;

  const handleSave = async () => {
    const updatedPayload = {
      gatewayUrl,
      apiKey,
      defaultModel,
      theme,
      responseLanguage,
      defaultShell,
      reasoningEffort,
      soundNotifications,
      autoScrollStreaming,
      workspaceConfinement,
      permissionPreset,
    };

    try {
      // 1. Save settings to /api/config
      await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedPayload),
      });

      // 2. Automatically sync models with new provider / gateway
      setIsRefreshingModels(true);
      try {
        const modelsRes = await fetch('/api/models?refresh=true');
        const modelsData = await modelsRes.json();
        if (modelsData.models && Array.isArray(modelsData.models) && modelsData.models.length > 0) {
          const freshModels = modelsData.models;
          setDynamicModels(freshModels);
          onModelsRefreshed?.(freshModels);

          // Check if current defaultModel exists in new provider's models
          const modelExists = freshModels.some((m: any) => m.id === defaultModel);
          if (!modelExists) {
            // Find a sensible default model (e.g. gpt-4o, gpt-4o-mini, or first available)
            const fallbackModel =
              freshModels.find((m: any) =>
                m.id === 'gpt-4o' ||
                m.id === 'gpt-4o-mini' ||
                m.id.includes('deepseek-chat') ||
                m.id.includes('claude-3-5-sonnet') ||
                m.id.includes('chat')
              ) || freshModels[0];

            if (fallbackModel) {
              setDefaultModel(fallbackModel.id);
              updatedPayload.defaultModel = fallbackModel.id;
              await fetch('/api/config', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ defaultModel: fallbackModel.id }),
              });
            }
          }
        }
      } catch (err) {
        console.warn('Failed to auto-sync models on save:', err);
      } finally {
        setIsRefreshingModels(false);
      }

      if (onSave) {
        onSave(updatedPayload);
      }
      setIsSaved(true);
      setTimeout(() => setIsSaved(false), 3000);
    } catch {
      setIsSaved(true);
      setTimeout(() => setIsSaved(false), 3000);
    }
  };

  // Main settings items
  const settingsNavItems: Array<{ key: TabKey; label: string }> = [
    { key: 'general', label: 'General' },
    { key: 'application', label: 'Application' },
    { key: 'appearance', label: 'Appearance' },
    { key: 'models', label: 'Models' },
    { key: 'mcp', label: 'MCP Servers' },
    { key: 'customizations', label: 'Customizations' },
    { key: 'browser', label: 'Browser' },
  ];

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-[100000] bg-black/60 flex items-center justify-center p-0 sm:p-6 md:p-8 select-none"
    >
      {/* Responsive Modal Container */}
      <div className="w-full h-full sm:h-[85vh] sm:max-h-[850px] max-w-5xl bg-[#101010] border-0 sm:border border-[#242426] rounded-none sm:rounded-2xl shadow-2xl flex flex-col md:flex-row overflow-hidden relative">
        {/* Left Navigation Sidebar (SIDE: #161616, border-r: #202022) */}
        <aside
          className={`w-full md:w-56 shrink-0 md:border-r border-[#202022] flex flex-col justify-between bg-[#161616] ${
            mobileDetailOpen ? 'hidden md:flex' : 'flex'
          }`}
        >
          {/* Mobile Pinned Header for Sidebar */}
          <div className="flex items-center justify-between px-4 py-3.5 border-b border-[#202022] md:hidden shrink-0 bg-[#161616] select-none">
            <span className="text-[15px] font-semibold text-white">Settings</span>
            <button
              type="button"
              onClick={onClose}
              title="Close (Esc)"
              className="p-1.5 rounded-lg text-[#868686] hover:text-white hover:bg-[#202022] transition cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto py-3.5 px-3 md:px-2.5 flex flex-col justify-between">
            <div className="space-y-3.5">
              {/* 1. SETTINGS SECTION */}
              <div className="space-y-0.5">
                <div className="px-2.5 pb-1 text-[11px] font-normal text-[#737373] select-none">
                  Settings
                </div>
                {settingsNavItems.map((item) => {
                  const isActive = activeTab === item.key;
                  return (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => {
                        setActiveTab(item.key);
                        setMobileDetailOpen(true);
                      }}
                      className={`w-full flex items-center justify-between px-3 md:px-2.5 py-2.5 md:py-1 rounded-xl md:rounded-lg text-[13.5px] md:text-[12.5px] transition text-left cursor-pointer select-none ${
                        isActive
                          ? 'bg-[#242424] text-white font-medium'
                          : 'text-[#949494] hover:text-white hover:bg-[#1f1f1f]'
                      }`}
                    >
                      <span>{item.label}</span>
                      <ChevronRight className="w-4 h-4 text-[#555] md:hidden shrink-0" />
                    </button>
                  );
                })}
              </div>

              {/* 2. PROJECTS SECTION */}
              <div className="space-y-0.5 pt-0.5">
                <div className="px-2.5 pb-1 text-[11px] font-normal text-[#737373] select-none">
                  Projects
                </div>
                {(() => {
                  const displayProjects =
                    projects.length > 0
                      ? showAllProjects
                        ? projects
                        : projects.slice(0, 4)
                      : currentProject
                      ? [currentProject]
                      : [];
                  return displayProjects.map((proj) => {
                    const tabKey: TabKey = `project_${proj.id}`;
                    const isActive = activeTab === tabKey;
                    return (
                      <button
                        key={proj.id}
                        type="button"
                        onClick={() => {
                          setActiveTab(tabKey);
                          setMobileDetailOpen(true);
                        }}
                        className={`w-full flex items-center justify-between px-3 md:px-2.5 py-2.5 md:py-1 rounded-xl md:rounded-lg text-[13.5px] md:text-[12.5px] transition text-left cursor-pointer select-none truncate ${
                          isActive
                            ? 'bg-[#242424] text-white font-medium'
                            : 'text-[#949494] hover:text-white hover:bg-[#1f1f1f]'
                        }`}
                      >
                        <span className="truncate">{proj.name}</span>
                        <ChevronRight className="w-4 h-4 text-[#555] md:hidden shrink-0" />
                      </button>
                    );
                  });
                })()}
                {projects.length > 4 && (
                  <button
                    type="button"
                    onClick={() => setShowAllProjects(!showAllProjects)}
                    className="w-full flex items-center justify-between px-2.5 py-1.5 md:py-1 rounded-lg text-[12px] md:text-[11px] text-[#737373] hover:text-white hover:bg-[#1f1f1f] transition text-left cursor-pointer select-none"
                  >
                    <span>{showAllProjects ? 'Show Less' : 'Show All'}</span>
                    <span className="text-[10px] text-[#555]">{projects.length}</span>
                  </button>
                )}
              </div>
            </div>

            {/* 3. BOTTOM FOOTER SECTION (Shortcuts, Provide Feedback, User Profile) */}
            <div className="pt-3 border-t border-[#202022] space-y-0.5">
              <button
                type="button"
                onClick={() => setShowShortcutsModal(true)}
                className="w-full flex items-center px-2.5 py-2 md:py-1 rounded-lg text-[13px] md:text-[11.5px] text-[#949494] hover:text-white hover:bg-[#1f1f1f] transition text-left cursor-pointer"
              >
                <span>Shortcuts</span>
              </button>
              <button
                type="button"
                className="w-full flex items-center px-2.5 py-2 md:py-1 rounded-lg text-[13px] md:text-[11.5px] text-[#949494] hover:text-white hover:bg-[#1f1f1f] transition text-left cursor-pointer"
              >
                <span>Provide Feedback</span>
              </button>

              {/* User Profile Row */}
              <div className="pt-2 px-1 flex items-center gap-2">
                <div className="w-7 h-7 rounded-full bg-[#242424] border border-[#333333] flex items-center justify-center text-[11px] font-semibold text-white shrink-0 overflow-hidden">
                  {profileUser?.image ? (
                    <img
                      src={profileUser.image}
                      alt={profileUser.name || 'User'}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span className="text-zinc-100 uppercase">
                      {(profileUser?.name || profileUser?.email || 'U')[0]}
                    </span>
                  )}
                </div>
                <div className="truncate min-w-0">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="text-[11.5px] font-medium text-[#f0f0f2] truncate">
                      {profileUser?.name || (profileUser?.email ? profileUser.email.split('@')[0] : 'User')}
                    </span>
                    {profileUser?.isByok && (
                      <span className="text-[9px] px-1 py-0.5 rounded bg-white/[0.08] text-[#a1a1aa] font-medium shrink-0">
                        BYOK
                      </span>
                    )}
                  </div>
                  {profileUser?.email && (
                    <div className="text-[10px] text-[#737373] truncate" title={profileUser.email}>
                      {profileUser.email}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </aside>

        {/* Right Content Area (CONTENT: #101010, Smooth Native Scrolling) */}
        <main
          className={`flex-1 min-h-0 bg-[#101010] relative flex flex-col overflow-hidden ${
            !mobileDetailOpen ? 'hidden md:flex' : 'flex'
          }`}
        >
          {/* Mobile Static / Pinned Header (Does not scroll) */}
          <div className="md:hidden shrink-0 bg-[#101010] border-b border-[#202022] px-4 pt-3.5 pb-2.5 z-20 select-none">
            {/* Row 1: Back button, Title, Close button */}
            <div className="flex items-center justify-between pb-2.5">
              <button
                type="button"
                onClick={() => setMobileDetailOpen(false)}
                className="flex items-center gap-1 text-[13px] font-medium text-blue-400 hover:text-blue-300 py-1 px-1 -ml-1 cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
                <span>Settings</span>
              </button>
              <span className="text-[13.5px] font-semibold text-white truncate max-w-[170px]">
                {activeTab.startsWith('project_')
                  ? activeProject?.name || 'Project'
                  : settingsNavItems.find((n) => n.key === activeTab)?.label || 'Settings'}
              </span>
              <button
                type="button"
                onClick={onClose}
                title="Close (Esc)"
                className="p-1.5 rounded-lg text-[#868686] hover:text-white hover:bg-[#202022] transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Row 2: Horizontal Quick-switch Pills */}
            <div className="flex items-center gap-1 overflow-x-auto p-1 bg-[#141416] border border-[#222226] rounded-xl scrollbar-none">
              {settingsNavItems.map((item) => {
                const isActive = activeTab === item.key;
                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => setActiveTab(item.key)}
                    className={`px-3 py-1 rounded-lg text-[12px] font-medium whitespace-nowrap transition cursor-pointer shrink-0 ${
                      isActive
                        ? 'bg-[#2d2d2d] text-white shadow-sm'
                        : 'text-[#868686] hover:text-[#dededf] hover:bg-[#1a1a1d]'
                    }`}
                  >
                    {item.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Desktop Close button in top-right corner */}
          <button
            type="button"
            onClick={onClose}
            title="Close (Esc)"
            className="hidden md:block absolute top-5 right-5 p-1 rounded-lg text-[#737373] hover:text-white hover:bg-[#1f1f1f] transition cursor-pointer z-10"
          >
            <X className="w-4 h-4" />
          </button>

          {/* Scrollable Tab Content Container */}
          <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-6 md:p-7 overscroll-contain">

          {/* TAB 1: GENERAL */}
          {activeTab === 'general' && (
            <div className="space-y-5 animate-fade-in pr-0 sm:pr-6 pb-6">
              <div>
                <h2 className="text-lg font-semibold text-[#f5f5f7] tracking-tight">General</h2>
                <p className="text-[12px] text-[#868686] mt-0.5">
                  Configure agent execution, queued message delivery, and permissions.
                </p>
              </div>

              {/* 1. EXECUTION SECTION */}
              <div className="space-y-2.5">
                <div className="text-[12px] font-medium text-[#d4d4d8]">
                  Execution
                </div>

                {/* Queued Messages Card */}
                <div className="p-3.5 sm:p-4 rounded-xl bg-[#101010] border border-[#222226] flex items-center justify-between gap-4">
                  <div className="space-y-0.5 min-w-0 flex-1 pr-3">
                    <div className="text-[13px] font-medium text-[#f0f0f2]">
                      Queued Messages
                    </div>
                    <div className="text-[11.5px] text-[#868686]">
                      Configure when follow-up messages are sent.
                    </div>
                    <div className="pt-0.5">
                      <button
                        type="button"
                        onClick={() => setShowShortcutsModal(true)}
                        className="inline-flex items-center gap-1.5 text-[11px] text-[#868686] hover:text-[#d4d4d8] transition cursor-pointer group"
                      >
                        <span>Keyboard shortcuts</span>
                        <Info className="w-3 h-3 text-[#868686] group-hover:text-[#d4d4d8]" />
                      </button>
                    </div>
                  </div>

                  {/* Switch Tab Button: [[Queue] [Send Immediately]] */}
                  <div className="flex items-center p-0.5 bg-[#161616] border border-[#26262a] rounded-lg shrink-0">
                    <button
                      type="button"
                      onClick={() => handleSetQueuedMode('queue')}
                      className={`px-3 py-1 rounded-md text-[11.5px] font-medium transition cursor-pointer whitespace-nowrap ${
                        queuedMode === 'queue'
                          ? 'bg-[#2d2d2d] text-white shadow-sm'
                          : 'text-[#868686] hover:text-[#dededf]'
                      }`}
                    >
                      Queue
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSetQueuedMode('immediately')}
                      className={`px-3 py-1 rounded-md text-[11.5px] font-medium transition cursor-pointer whitespace-nowrap ${
                        queuedMode === 'immediately'
                          ? 'bg-[#2d2d2d] text-white shadow-sm'
                          : 'text-[#868686] hover:text-[#dededf]'
                      }`}
                    >
                      Send Immediately
                    </button>
                  </div>
                </div>

                {/* Auto-Scroll Streaming Card */}
                <div className="p-3.5 sm:p-4 rounded-xl bg-[#101010] border border-[#222226] flex items-center justify-between gap-4">
                  <div className="space-y-0.5 min-w-0 flex-1 pr-3">
                    <div className="text-[13px] font-medium text-[#f0f0f2]">
                      Auto-Scroll Streaming
                    </div>
                    <div className="text-[11.5px] text-[#868686] leading-relaxed">
                      Automatically scrolls the window downward as AI streaming responses and code blocks are generated.
                    </div>
                  </div>
                  <div className="shrink-0">
                    <ToggleSwitch
                      checked={autoScrollStreaming}
                      onChange={handleSetAutoScrollStreaming}
                      ariaLabel="Toggle auto-scroll streaming"
                    />
                  </div>
                </div>

                {/* Notifications Card */}
                <div className="p-3.5 sm:p-4 rounded-xl bg-[#101010] border border-[#222226] flex items-center justify-between gap-4">
                  <div className="space-y-0.5 min-w-0 flex-1 pr-3">
                    <div className="text-[13px] font-medium text-[#f0f0f2]">
                      Notifications
                    </div>
                    <div className="text-[11.5px] text-[#868686] leading-relaxed">
                      Subtle chime when the agent finishes long-running tasks or asks questions.
                    </div>
                    <div className="pt-0.5">
                      <button
                        type="button"
                        onClick={playNotificationChime}
                        className="inline-flex items-center gap-1 text-[11px] text-[#868686] hover:text-[#dededf] transition cursor-pointer group"
                      >
                        <Volume2 className="w-3 h-3 text-[#868686] group-hover:text-[#dededf]" />
                        <span>Test notification chime</span>
                      </button>
                    </div>
                  </div>
                  <div className="shrink-0">
                    <ToggleSwitch
                      checked={soundNotifications}
                      onChange={handleSetSoundNotifications}
                      ariaLabel="Toggle notifications"
                    />
                  </div>
                </div>
              </div>

              {/* 2. GLOBAL PERMISSIONS & SECURITY SECTION */}
              <div className="space-y-2.5">
                <div className="text-[12px] font-medium text-[#d4d4d8]">
                  Global Permissions &amp; Security
                </div>

                {/* Default Permission Preset Card */}
                <div className="p-3.5 sm:p-4 rounded-xl bg-[#101010] border border-[#222226] flex items-center justify-between gap-4 relative">
                  <div className="space-y-0.5 min-w-0 flex-1 pr-3">
                    <div className="text-[13px] font-medium text-[#f0f0f2]">
                      Default Permission Preset
                    </div>
                    <div className="text-[11.5px] text-[#868686] leading-relaxed">
                      Confirmation policy when the AI needs to read/modify files or execute shell commands.
                    </div>
                  </div>

                  {/* Dropdown Menu (ANTI-WRAPPING with whitespace-nowrap & shrink-0) */}
                  <div className="relative shrink-0" onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      onClick={() => setOpenDropdown(openDropdown === 'permission' ? 'none' : 'permission')}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#202022] hover:bg-[#28282c] border border-[#2e2e34] text-[11.5px] font-medium text-[#dededf] transition cursor-pointer whitespace-nowrap shrink-0"
                    >
                      <span>
                        {PERMISSION_PRESETS.find((p) => p.id === permissionPreset)?.label || 'Auto (Recommended)'}
                      </span>
                      <ChevronDown className="w-3.5 h-3.5 text-[#868686]" />
                    </button>

                    <BottomSheet
                      isOpen={openDropdown === 'permission'}
                      onClose={() => setOpenDropdown('none')}
                      title="Execution Permission"
                      zIndex={100020}
                      className="w-full sm:w-64 max-h-[80vh] sm:max-h-[380px] overflow-y-auto sm:top-full sm:right-0 sm:mt-1 bg-[#161616] border-t sm:border border-[#28282e] py-2 sm:py-1 divide-y divide-[#202024]"
                    >
                      {PERMISSION_PRESETS.map((opt) => {
                        const isSelected = permissionPreset === opt.id;
                        return (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() => {
                              handleSetPermissionPreset(opt.id);
                              setOpenDropdown('none');
                            }}
                            className="w-full flex items-start justify-between px-4 sm:px-3 py-3 sm:py-1.5 text-left hover:bg-[#202024] transition cursor-pointer group"
                          >
                            <div className="pr-2">
                              <div className={`text-[13px] sm:text-[11.5px] font-medium ${isSelected ? 'text-white' : 'text-[#dededf]'}`}>
                                {opt.label}
                              </div>
                              <div className="text-[11px] sm:text-[10.5px] text-[#868686] mt-0.5 leading-snug">
                                {opt.desc}
                              </div>
                            </div>
                            {isSelected && <Check className="w-4 h-4 sm:w-3.5 sm:h-3.5 text-white shrink-0 mt-0.5" />}
                          </button>
                        );
                      })}
                    </BottomSheet>
                  </div>
                </div>

                {/* Workspace Confinement Card */}
                <div className="p-3.5 sm:p-4 rounded-xl bg-[#101010] border border-[#222226] flex items-center justify-between gap-4">
                  <div className="space-y-0.5 min-w-0 flex-1 pr-3">
                    <div className="text-[13px] font-medium text-[#f0f0f2]">
                      Workspace Confinement
                    </div>
                    <div className="text-[11.5px] text-[#868686] leading-relaxed">
                      Confines the agent to only read/modify files and run commands within the opened project directory.
                    </div>
                  </div>
                  <div className="shrink-0">
                    <ToggleSwitch
                      checked={workspaceConfinement}
                      onChange={handleSetWorkspaceConfinement}
                      ariaLabel="Toggle workspace confinement"
                    />
                  </div>
                </div>
              </div>

              {/* 3. LOCALIZATION SECTION */}
              <div className="space-y-2.5">
                <div className="text-[12px] font-medium text-[#d4d4d8]">
                  Localization
                </div>

                {/* Assistant Response Language Card */}
                <div className="p-3.5 sm:p-4 rounded-xl bg-[#101010] border border-[#222226] flex items-center justify-between gap-4 relative">
                  <div className="space-y-0.5 min-w-0 flex-1 pr-3">
                    <div className="text-[13px] font-medium text-[#f0f0f2]">
                      Assistant Response Language
                    </div>
                    <div className="text-[11.5px] text-[#868686] leading-relaxed">
                      Default language for AI responses when user prompt language is ambiguous or mixed.
                    </div>
                  </div>

                  {/* Dropdown Menu (ANTI-WRAPPING with whitespace-nowrap & shrink-0) */}
                  <div className="relative shrink-0" onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      onClick={() => setOpenDropdown(openDropdown === 'language' ? 'none' : 'language')}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#202022] hover:bg-[#28282c] border border-[#2e2e34] text-[11.5px] font-medium text-[#dededf] transition cursor-pointer whitespace-nowrap shrink-0"
                    >
                      <span>
                        {LANGUAGE_OPTIONS.find((l) => l.id === responseLanguage)?.label || 'Auto-Detect'}
                      </span>
                      <ChevronDown className="w-3.5 h-3.5 text-[#868686]" />
                    </button>

                    <BottomSheet
                      isOpen={openDropdown === 'language'}
                      onClose={() => setOpenDropdown('none')}
                      title="Response Language"
                      zIndex={100020}
                      className="w-full sm:w-60 max-h-[80vh] sm:max-h-[380px] overflow-y-auto sm:top-full sm:right-0 sm:mt-1 bg-[#161616] border-t sm:border border-[#28282e] py-2 sm:py-1 divide-y divide-[#202024]"
                    >
                      {LANGUAGE_OPTIONS.map((opt) => {
                        const isSelected = responseLanguage === opt.id;
                        return (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() => {
                              handleSetResponseLanguage(opt.id);
                              setOpenDropdown('none');
                            }}
                            className="w-full flex items-start justify-between px-4 sm:px-3 py-3 sm:py-1.5 text-left hover:bg-[#202024] transition cursor-pointer group"
                          >
                            <div className="pr-2">
                              <div className={`text-[13px] sm:text-[11.5px] font-medium ${isSelected ? 'text-white' : 'text-[#dededf]'}`}>
                                {opt.label}
                              </div>
                              <div className="text-[11px] sm:text-[10.5px] text-[#868686] mt-0.5 leading-snug">
                                {opt.desc}
                              </div>
                            </div>
                            {isSelected && <Check className="w-4 h-4 sm:w-3.5 sm:h-3.5 text-white shrink-0 mt-0.5" />}
                          </button>
                        );
                      })}
                    </BottomSheet>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* PROJECT SETTINGS TAB */}
          {activeTab.startsWith('project_') && (
            <div className="space-y-5 animate-fade-in pr-0 sm:pr-6 pb-6">
              {/* Project Header with edit pencil */}
              <div>
                <div className="flex items-center gap-2">
                  {isEditingProjectName ? (
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={editingProjectNameVal}
                        onChange={(e) => setEditingProjectNameVal(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleSaveProjectName();
                          if (e.key === 'Escape') setIsEditingProjectName(false);
                        }}
                        autoFocus
                        disabled={isSavingProjectName}
                        placeholder="Project name"
                        className="px-2.5 py-1 text-sm bg-[#161618] border border-blue-500 rounded-lg text-white font-medium focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                      <button
                        type="button"
                        disabled={isSavingProjectName}
                        onClick={handleSaveProjectName}
                        className="p-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white transition cursor-pointer"
                        title="Save Name"
                      >
                        {isSavingProjectName ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Check className="w-3.5 h-3.5" />
                        )}
                      </button>
                      <button
                        type="button"
                        disabled={isSavingProjectName}
                        onClick={() => setIsEditingProjectName(false)}
                        className="p-1.5 rounded-lg bg-[#202022] hover:bg-[#28282c] text-[#868686] hover:text-white transition cursor-pointer"
                        title="Cancel"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : (
                    <>
                      <h2 className="text-lg font-semibold text-[#f5f5f7] tracking-tight">
                        {activeProject?.name || 'Project Settings'}
                      </h2>
                      <button
                        type="button"
                        onClick={() => {
                          if (activeProject) {
                            setEditingProjectNameVal(activeProject.name);
                            setIsEditingProjectName(true);
                          }
                        }}
                        title="Rename project"
                        className="p-1 text-[#737373] hover:text-white transition cursor-pointer"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                    </>
                  )}
                </div>
                <p className="text-[12px] text-[#868686] mt-0.5">
                  Manage project folders, agent settings, and permissions.
                </p>
              </div>

              {/* 1. Folders Section */}
              <div className="space-y-2">
                <div className="text-[12px] font-medium text-[#d4d4d8]">Folders</div>
                <div className="p-3 rounded-xl bg-[#101010] border border-[#222226] space-y-2.5">
                  {(projectFolders.length > 0
                    ? projectFolders
                    : [activeProject?.workdir_path || activeProject?.name || 'default']
                  ).map((fPath, idx) => {
                    const isPrimary = idx === 0;
                    const folderName = fPath.split(/[\/\\]/).filter(Boolean).pop() || fPath;
                    return (
                      <div
                        key={`${fPath}-${idx}`}
                        className="flex items-center justify-between px-3 py-1.5 rounded-lg bg-[#161616] border border-[#222226] text-[11.5px] text-[#dededf]"
                      >
                        <div className="flex items-center gap-2 font-mono truncate min-w-0 pr-2">
                          <Folder className="w-3.5 h-3.5 text-[#868686] shrink-0" />
                          <span className="truncate" title={fPath}>
                            {folderName}/
                          </span>
                          {isPrimary && (
                            <span className="text-[10px] text-[#737373] bg-[#202022] px-1.5 py-0.5 rounded font-sans shrink-0">
                              Primary
                            </span>
                          )}
                        </div>
                        {!isPrimary ? (
                          <button
                            type="button"
                            onClick={() => handleRemoveFolder(fPath)}
                            title="Remove folder"
                            className="text-[#737373] hover:text-white transition cursor-pointer shrink-0"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        ) : (
                          <div className="w-3.5 h-3.5" />
                        )}
                      </div>
                    );
                  })}
                  <button
                    type="button"
                    onClick={() => setShowAddFolderModal(true)}
                    className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg bg-[#202022] hover:bg-[#28282c] border border-[#2e2e34] text-[11.5px] font-medium text-[#dededf] transition cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Folder</span>
                  </button>
                </div>
              </div>

              {/* 2. Agent Settings Section */}
              <div className="space-y-2 pt-0.5">
                <div className="text-[12px] font-medium text-[#d4d4d8]">Agent Settings</div>
                <div className="p-3.5 sm:p-4 rounded-xl bg-[#101010] border border-[#222226] flex items-center justify-between gap-4 relative">
                  <div className="space-y-0.5 min-w-0 flex-1 pr-3">
                    <div className="text-[13px] font-medium text-[#f0f0f2]">
                      Security Preset
                    </div>
                    <div className="text-[11.5px] text-[#868686] leading-relaxed">
                      Confirmation policy when the AI needs to read/modify files or execute shell commands.
                    </div>
                  </div>

                  {/* Dropdown Button */}
                  <div className="relative shrink-0" onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      onClick={() =>
                        setOpenDropdown(openDropdown === 'securityPreset' ? 'none' : 'securityPreset')
                      }
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#202022] hover:bg-[#28282c] border border-[#2e2e34] text-[11.5px] font-medium text-[#dededf] transition cursor-pointer whitespace-nowrap shrink-0"
                    >
                      <span>
                        {PERMISSION_PRESETS.find((p) => p.id === securityPreset)?.label || 'Auto (Recommended)'}
                      </span>
                      <ChevronDown className="w-3.5 h-3.5 text-[#868686]" />
                    </button>

                    <BottomSheet
                      isOpen={openDropdown === 'securityPreset'}
                      onClose={() => setOpenDropdown('none')}
                      title="Execution Permission"
                      zIndex={100020}
                      className="w-full sm:w-64 max-h-[80vh] sm:max-h-[380px] overflow-y-auto sm:top-full sm:right-0 sm:mt-1 bg-[#161616] border-t sm:border border-[#28282e] py-2 sm:py-1 divide-y divide-[#202024]"
                    >
                      {PERMISSION_PRESETS.map((opt) => {
                        const isSelected = securityPreset === opt.id;
                        return (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() => {
                              handleSetSecurityPreset(opt.id);
                              setOpenDropdown('none');
                            }}
                            className="w-full flex items-start justify-between px-4 sm:px-3 py-3 sm:py-1.5 text-left hover:bg-[#202024] transition cursor-pointer group"
                          >
                            <div className="pr-2">
                              <div
                                className={`text-[13px] sm:text-[11.5px] font-medium ${
                                  isSelected ? 'text-white' : 'text-[#dededf]'
                                }`}
                              >
                                {opt.label}
                              </div>
                              <div className="text-[11px] sm:text-[10.5px] text-[#868686] mt-0.5 leading-snug">
                                {opt.desc}
                              </div>
                            </div>
                            {isSelected && (
                              <Check className="w-4 h-4 sm:w-3.5 sm:h-3.5 text-white shrink-0 mt-0.5" />
                            )}
                          </button>
                        );
                      })}
                    </BottomSheet>
                  </div>
                </div>
              </div>

              {/* 3. Agent Behavior Section */}
              <div className="space-y-2 pt-0.5">
                <div className="text-[12px] font-medium text-[#d4d4d8]">Agent Behavior</div>
                <div className="p-3.5 sm:p-4 rounded-xl bg-[#101010] border border-[#222226] flex items-center justify-between gap-4 relative">
                  <div className="space-y-0.5 min-w-0 flex-1 pr-3">
                    <div className="text-[13px] font-medium text-[#f0f0f2]">
                      Artifact Review Policy
                    </div>
                    <div className="text-[11.5px] text-[#868686] leading-relaxed">
                      Whether the agent asks you to review its documents.
                    </div>
                  </div>

                  {/* Dropdown Button */}
                  <div className="relative shrink-0" onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      onClick={() =>
                        setOpenDropdown(openDropdown === 'reviewPolicy' ? 'none' : 'reviewPolicy')
                      }
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#202022] hover:bg-[#28282c] border border-[#2e2e34] text-[11.5px] font-medium text-[#dededf] transition cursor-pointer whitespace-nowrap shrink-0"
                    >
                      <span>{reviewPolicy}</span>
                      <ChevronDown className="w-3.5 h-3.5 text-[#868686]" />
                    </button>

                    <BottomSheet
                      isOpen={openDropdown === 'reviewPolicy'}
                      onClose={() => setOpenDropdown('none')}
                      title="Artifact Review Policy"
                      zIndex={100020}
                      className="w-full sm:w-64 max-h-[80vh] sm:max-h-[380px] overflow-y-auto sm:top-full sm:right-0 sm:mt-1 bg-[#161616] border-t sm:border border-[#28282e] py-2 sm:py-1 divide-y divide-[#202024]"
                    >
                      {REVIEW_POLICIES.map((opt) => {
                        const isSelected = reviewPolicy === opt.id;
                        return (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() => {
                              handleSetReviewPolicy(opt.id);
                              setOpenDropdown('none');
                            }}
                            className="w-full flex items-start justify-between px-4 sm:px-3 py-3 sm:py-1.5 text-left hover:bg-[#202024] transition cursor-pointer group"
                          >
                            <div className="pr-2">
                              <div
                                className={`text-[13px] sm:text-[11.5px] font-medium ${
                                  isSelected ? 'text-white' : 'text-[#dededf]'
                                }`}
                              >
                                {opt.label}
                              </div>
                              <div className="text-[11px] sm:text-[10.5px] text-[#868686] mt-0.5 leading-snug">
                                {opt.desc}
                              </div>
                            </div>
                            {isSelected && (
                              <Check className="w-4 h-4 sm:w-3.5 sm:h-3.5 text-white shrink-0 mt-0.5" />
                            )}
                          </button>
                        );
                      })}
                    </BottomSheet>
                  </div>
                </div>
              </div>

              {/* 4. Local Permissions Section */}
              <div className="space-y-2 pt-0.5">
                <div>
                  <div className="text-[12px] font-medium text-[#d4d4d8]">Local Permissions</div>
                  <div className="text-[11px] text-[#868686] mt-0.5">
                    Also includes{' '}
                    <span
                      onClick={() => setActiveTab('general')}
                      className="text-[#3b82f6] hover:underline cursor-pointer"
                    >
                      Global Permissions
                    </span>{' '}
                    when working in this project.{' '}
                    <span
                      onClick={() =>
                        customAlert({
                          title: 'Local Permissions',
                          message:
                            'Local Permissions allow you to configure path-based read/write rules, allowed web network requests, and terminal command restrictions for this specific project.',
                          variant: 'info',
                        })
                      }
                      className="text-[#3b82f6] hover:underline cursor-pointer"
                    >
                      Learn more.
                    </span>
                  </div>
                </div>

                {/* Multi-item grouped card */}
                <div className="rounded-xl bg-[#101010] border border-[#222226] divide-y divide-[#1e1e20] overflow-hidden">
                  <div className="p-3.5 sm:p-4 flex items-center justify-between gap-4">
                    <div className="space-y-0.5 min-w-0 flex-1 pr-3">
                      <div className="text-[13px] font-medium text-[#f0f0f2] flex items-center gap-2">
                        <span>File Access Rules</span>
                        <span className="px-1.5 py-0.2 rounded-md text-[10.5px] bg-[#222226] text-[#a0a0a0] font-mono">
                          {localPermissions.fileRules.length}
                        </span>
                      </div>
                      <div className="text-[11.5px] text-[#868686] leading-relaxed">
                        Configure allowed and denied paths for file reads and writes.
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setPermissionsCategory('files');
                        setShowPermissionsModal(true);
                      }}
                      className="px-3.5 py-1.5 rounded-lg bg-[#202022] hover:bg-[#28282c] border border-[#2e2e34] text-[11.5px] font-medium text-[#dededf] transition cursor-pointer whitespace-nowrap shrink-0"
                    >
                      Open
                    </button>
                  </div>

                  <div className="p-3.5 sm:p-4 flex items-center justify-between gap-4">
                    <div className="space-y-0.5 min-w-0 flex-1 pr-3">
                      <div className="text-[13px] font-medium text-[#f0f0f2] flex items-center gap-2">
                        <span>Network Access Rules</span>
                        <span className="px-1.5 py-0.2 rounded-md text-[10.5px] bg-[#222226] text-[#a0a0a0] font-mono">
                          {localPermissions.networkRules.length}
                        </span>
                      </div>
                      <div className="text-[11.5px] text-[#868686] leading-relaxed">
                        Configure allowed and denied URLs for reading.
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setPermissionsCategory('network');
                        setShowPermissionsModal(true);
                      }}
                      className="px-3.5 py-1.5 rounded-lg bg-[#202022] hover:bg-[#28282c] border border-[#2e2e34] text-[11.5px] font-medium text-[#dededf] transition cursor-pointer whitespace-nowrap shrink-0"
                    >
                      Open
                    </button>
                  </div>

                  <div className="p-3.5 sm:p-4 flex items-center justify-between gap-4">
                    <div className="space-y-0.5 min-w-0 flex-1 pr-3">
                      <div className="text-[13px] font-medium text-[#f0f0f2] flex items-center gap-2">
                        <span>Terminal Commands</span>
                        <span className="px-1.5 py-0.2 rounded-md text-[10.5px] bg-[#222226] text-[#a0a0a0] font-mono">
                          {localPermissions.terminalRules.length}
                        </span>
                      </div>
                      <div className="text-[11.5px] text-[#868686] leading-relaxed">
                        Configure allowed terminal commands.
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setPermissionsCategory('terminal');
                        setShowPermissionsModal(true);
                      }}
                      className="px-3.5 py-1.5 rounded-lg bg-[#202022] hover:bg-[#28282c] border border-[#2e2e34] text-[11.5px] font-medium text-[#dededf] transition cursor-pointer whitespace-nowrap shrink-0"
                    >
                      Open
                    </button>
                  </div>
                </div>
              </div>

              {/* 5. Important Action Section */}
              <div className="space-y-2 pt-2">
                <div>
                  <div className="text-[12px] font-medium text-red-400">Important Action</div>
                  <div className="text-[11px] text-[#868686] mt-0.5">
                    Irreversible administrative actions for this project.
                  </div>
                </div>

                <div className="rounded-xl bg-[#101010] border border-red-500/20 overflow-hidden p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <div className="space-y-0.5 min-w-0 flex-1 pr-3">
                    <div className="text-[13px] font-medium text-[#f0f0f2] flex items-center gap-2">
                      <span>Delete Project from System</span>
                    </div>
                    <div className="text-[11.5px] text-[#868686] leading-relaxed">
                      Removes this project and its runtime data (sessions, chats, snapshots, and index) from the system. Your actual source code and files on disk will not be deleted.
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleDeleteProject}
                    disabled={isDeletingProject}
                    className="px-3.5 py-1.5 rounded-lg bg-red-600/10 hover:bg-red-600/20 border border-red-500/30 text-[11.5px] font-medium text-red-400 hover:text-red-300 transition cursor-pointer flex items-center justify-center gap-1.5 active:scale-95 disabled:opacity-50 whitespace-nowrap shrink-0"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>{isDeletingProject ? 'Deleting...' : 'Delete Project'}</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: APPLICATION */}
          {activeTab === 'application' && (
            <div className="space-y-5 animate-fade-in pr-0 sm:pr-6 pb-6">
              <div>
                <h2 className="text-lg font-semibold text-[#f5f5f7] tracking-tight">Application</h2>
                <p className="text-[12px] text-[#868686] mt-0.5">
                  Manage application runtime, terminal environments, updates, and diagnostics.
                </p>
              </div>

              <div className="space-y-3 pt-1">
                <div className="p-3.5 sm:p-4 rounded-xl bg-[#101010] border border-[#222226] flex items-center justify-between gap-4 relative">
                  <div className="space-y-0.5 min-w-0 flex-1 pr-3">
                    <div className="text-[13px] font-medium text-[#f0f0f2]">Default Terminal Shell</div>
                    <div className="text-[11.5px] text-[#868686] leading-relaxed">
                      Default command line shell used by the agent for commands and background tasks.
                    </div>
                  </div>

                  {/* Custom Dropdown */}
                  <div className="relative shrink-0" onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      onClick={() => setOpenDropdown(openDropdown === 'defaultShell' ? 'none' : 'defaultShell')}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#202022] hover:bg-[#28282c] border border-[#2e2e34] text-[11.5px] font-medium text-[#dededf] transition cursor-pointer whitespace-nowrap shrink-0"
                    >
                      <span>
                        {SHELL_OPTIONS.find((s) => s.id === defaultShell)?.label || defaultShell}
                      </span>
                      <ChevronDown className="w-3.5 h-3.5 text-[#868686]" />
                    </button>

                    <BottomSheet
                      isOpen={openDropdown === 'defaultShell'}
                      onClose={() => setOpenDropdown('none')}
                      title="Default Terminal Shell"
                      zIndex={100020}
                      className="w-full sm:w-64 max-h-[80vh] sm:max-h-[380px] overflow-y-auto sm:top-full sm:right-0 sm:mt-1 bg-[#161616] border-t sm:border border-[#28282e] py-2 sm:py-1 divide-y divide-[#202024]"
                    >
                      {SHELL_OPTIONS.map((opt) => {
                        const isSelected = defaultShell === opt.id;
                        return (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() => {
                              handleSetDefaultShell(opt.id);
                              setOpenDropdown('none');
                            }}
                            className="w-full flex items-start justify-between px-4 sm:px-3 py-3 sm:py-2 text-left hover:bg-[#202024] transition cursor-pointer group"
                          >
                            <div className="pr-2">
                              <div className={`text-[13px] sm:text-[11.5px] font-medium ${isSelected ? 'text-white' : 'text-[#dededf]'}`}>
                                {opt.label}
                              </div>
                              <div className="text-[11px] sm:text-[10.5px] text-[#868686] mt-0.5 leading-snug">
                                {opt.desc}
                              </div>
                            </div>
                            {isSelected && <Check className="w-4 h-4 sm:w-3.5 sm:h-3.5 text-white shrink-0 mt-0.5" />}
                          </button>
                        );
                      })}
                    </BottomSheet>
                  </div>
                </div>

                <div className="p-3.5 sm:p-4 rounded-xl bg-[#101010] border border-[#222226] space-y-1.5">
                  <label className="text-[12.5px] font-medium text-[#dededf]">Command Execution Timeout (Seconds)</label>
                  <input
                    type="number"
                    value={terminalTimeout}
                    onChange={(e) => handleSetTerminalTimeout(Number(e.target.value))}
                    className="w-full bg-[#161616] border border-[#26262a] rounded-lg px-3 py-1.5 text-[11.5px] font-mono text-white focus:outline-none focus:border-[#3b82f6]"
                  />
                  <div className="text-[11px] text-[#868686]">
                    Background servers (isDaemon: true) run indefinitely and ignore this limit.
                  </div>
                </div>

                <div className="p-3.5 sm:p-4 rounded-xl bg-[#101010] border border-[#222226] space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="min-w-0 flex-1 pr-3">
                      <div className="text-[12.5px] font-medium text-[#dededf]">Automatic Updates</div>
                      <div className="text-[11px] text-[#868686] mt-0.5">
                        Periodically check for Aidev Desktop updates in background
                      </div>
                    </div>
                    <ToggleSwitch
                      checked={autoUpdate}
                      onChange={handleSetAutoUpdate}
                      ariaLabel="Toggle automatic updates"
                    />
                  </div>

                  <div className="pt-2.5 border-t border-[#1e1e22] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-[12px] font-medium text-[#f0f0f2]">
                          Aidev Desktop {versionData ? versionData.version : 'v1.0.0'}
                        </span>
                        <span className="px-2 py-0.5 rounded text-[10.5px] bg-[#1a2e1a] text-[#4ade80] border border-[#235323] font-medium">
                          {updateStatus === 'latest' ? 'Up to date' : 'Active'}
                        </span>
                      </div>
                      {versionData && (
                        <div className="text-[11px] text-[#868686] font-mono flex items-center gap-2">
                          <span>Git: {versionData.git?.commit} ({versionData.git?.branch})</span>
                          <span>•</span>
                          <span>Node: {versionData.runtime?.node}</span>
                        </div>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={handleCheckForUpdates}
                      disabled={isCheckingUpdate}
                      className="px-3 py-1.5 rounded-lg bg-[#202022] hover:bg-[#28282c] border border-[#2e2e34] text-[11.5px] font-medium text-[#dededf] transition cursor-pointer whitespace-nowrap shrink-0 flex items-center gap-1.5 self-start sm:self-auto"
                    >
                      {isCheckingUpdate && <Loader2 className="w-3.5 h-3.5 animate-spin text-[#3b82f6]" />}
                      <span>{isCheckingUpdate ? 'Checking...' : updateStatus === 'latest' ? 'Up to date' : 'Check for Updates'}</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: APPEARANCE */}
          {activeTab === 'appearance' && (
            <div className="space-y-4 animate-fade-in pr-0 sm:pr-6 pb-6">
              {/* Header */}
              <div>
                <h2 className="text-lg font-semibold text-[#f5f5f7] tracking-tight">Appearance</h2>
                <p className="text-[12px] text-[#868686] mt-0.5">
                  Configure the agent&apos;s visual theme and display preferences.
                </p>
              </div>

              {/* 1. Section: Appearance */}
              <div className="space-y-1.5">
                <div className="text-[12px] font-medium text-[#d4d4d8]">Appearance</div>
                <div className="rounded-xl bg-[#101010] border border-[#222226] divide-y divide-[#1e1e20] overflow-hidden">
                  {/* Theme Row */}
                  <div className="px-3.5 sm:px-4 py-2 flex items-center justify-between gap-4">
                    <div className="text-[12.5px] font-medium text-[#dededf]">Theme</div>
                    <div className="flex items-center p-0.5 bg-[#161616] border border-[#26262a] rounded-lg shrink-0">
                      <button
                        type="button"
                        onClick={() => handleSetTheme('system')}
                        title="Follow System Theme"
                        className={`p-1.5 rounded-md transition cursor-pointer ${
                          theme === 'system'
                            ? 'bg-[#2d2d2d] text-white shadow-sm'
                            : 'text-[#868686] hover:text-[#dededf]'
                        }`}
                      >
                        <Monitor className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSetTheme('light')}
                        title="Light Theme"
                        className={`p-1.5 rounded-md transition cursor-pointer ${
                          theme === 'light'
                            ? 'bg-[#2d2d2d] text-white shadow-sm'
                            : 'text-[#868686] hover:text-[#dededf]'
                        }`}
                      >
                        <Sun className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSetTheme('dark')}
                        title="Dark Theme"
                        className={`p-1.5 rounded-md transition cursor-pointer ${
                          theme === 'dark'
                            ? 'bg-[#2d2d2d] text-white shadow-sm'
                            : 'text-[#868686] hover:text-[#dededf]'
                        }`}
                      >
                        <Moon className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Contrast Row */}
                  <div className="px-3.5 sm:px-4 py-2 flex items-center justify-between gap-4">
                    <div className="text-[12.5px] font-medium text-[#dededf]">Contrast</div>
                    <div className="flex items-center p-0.5 bg-[#161616] border border-[#26262a] rounded-lg shrink-0">
                      <button
                        type="button"
                        onClick={() => handleSetContrast('default')}
                        className={`px-3 py-1 rounded-md text-[11.5px] font-medium transition cursor-pointer whitespace-nowrap ${
                          contrast === 'default'
                            ? 'bg-[#2d2d2d] text-white shadow-sm'
                            : 'text-[#868686] hover:text-[#dededf]'
                        }`}
                      >
                        Default
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSetContrast('strong')}
                        className={`px-3 py-1 rounded-md text-[11.5px] font-medium transition cursor-pointer whitespace-nowrap ${
                          contrast === 'strong'
                            ? 'bg-[#2d2d2d] text-white shadow-sm'
                            : 'text-[#868686] hover:text-[#dededf]'
                        }`}
                      >
                        Strong
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* 2. Section: Light Theme */}
              <div className="space-y-1.5">
                <div className="text-[12px] font-medium text-[#d4d4d8]">Light Theme</div>
                <div className="rounded-xl bg-[#101010] border border-[#222226] divide-y divide-[#1e1e20] overflow-visible">
                  {/* Preset */}
                  <div className="px-3.5 sm:px-4 py-2 flex items-center justify-between gap-4 relative">
                    <div className="text-[12.5px] font-medium text-[#dededf]">Preset</div>
                    <div className="relative shrink-0" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        onClick={() => setOpenDropdown(openDropdown === 'lightPreset' ? 'none' : 'lightPreset')}
                        className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-[#202022] hover:bg-[#28282c] border border-[#2e2e34] text-[11.5px] font-medium text-[#dededf] transition cursor-pointer whitespace-nowrap shrink-0"
                      >
                        <span>{lightPreset}</span>
                        <ChevronDown className="w-3.5 h-3.5 text-[#868686]" />
                      </button>

                    <BottomSheet
                      isOpen={openDropdown === 'lightPreset'}
                      onClose={() => setOpenDropdown('none')}
                      title="Light Theme Preset"
                      zIndex={100020}
                      className="w-full sm:w-52 max-h-[80vh] sm:max-h-[380px] overflow-y-auto sm:top-full sm:right-0 sm:mt-1 bg-[#161616] border-t sm:border border-[#28282e] py-2 sm:py-1 divide-y divide-[#202024]"
                    >
                      {LIGHT_PRESETS.map((p) => {
                        const isSelected = lightPreset === p.id;
                        return (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => {
                              handleSetLightPreset(p.id);
                              setOpenDropdown('none');
                            }}
                            className="w-full flex items-center justify-between px-4 sm:px-3 py-3 sm:py-2 text-left hover:bg-[#202024] transition cursor-pointer group"
                          >
                            <div className="flex items-center gap-2.5 sm:gap-2">
                              <span
                                className="w-4 h-4 sm:w-3 sm:h-3 rounded-full border border-black/20 shrink-0"
                                style={{ backgroundColor: p.bg }}
                              />
                              <span className={`text-[13px] sm:text-[11.5px] font-medium ${isSelected ? 'text-white' : 'text-[#dededf]'}`}>
                                {p.label}
                              </span>
                            </div>
                            {isSelected && <Check className="w-4 h-4 sm:w-3.5 sm:h-3.5 text-white shrink-0" />}
                          </button>
                        );
                      })}
                    </BottomSheet>
                    </div>
                  </div>

                  {/* Background */}
                  <div className="px-3.5 sm:px-4 py-2 flex items-center justify-between gap-4">
                    <div className="text-[12.5px] font-medium text-[#dededf]">Background</div>
                    <label className="flex items-center gap-2 px-2.5 py-1 rounded-lg bg-[#161616] hover:bg-[#202024] border border-[#26262a] text-[11.5px] font-mono text-[#dededf] shrink-0 cursor-pointer group transition">
                      <input
                        type="color"
                        value={lightBg}
                        onChange={(e) => {
                          const val = e.target.value;
                          setLightBg(val);
                          setGlobalCustomColor('light', 'bg', val);
                        }}
                        className="sr-only"
                      />
                      <span
                        className="w-3.5 h-3.5 rounded-[3px] shrink-0 border border-black/20 group-hover:scale-110 transition shadow-sm"
                        style={{ backgroundColor: lightBg }}
                      />
                      <span className="tracking-wider"># {lightBg.replace(/^#/, '').toUpperCase()}</span>
                    </label>
                  </div>

                  {/* Foreground */}
                  <div className="px-3.5 sm:px-4 py-2 flex items-center justify-between gap-4">
                    <div className="text-[12.5px] font-medium text-[#dededf]">Foreground</div>
                    <label className="flex items-center gap-2 px-2.5 py-1 rounded-lg bg-[#161616] hover:bg-[#202024] border border-[#26262a] text-[11.5px] font-mono text-[#dededf] shrink-0 cursor-pointer group transition">
                      <input
                        type="color"
                        value={lightFg}
                        onChange={(e) => {
                          const val = e.target.value;
                          setLightFg(val);
                          setGlobalCustomColor('light', 'fg', val);
                        }}
                        className="sr-only"
                      />
                      <span
                        className="w-3.5 h-3.5 rounded-[3px] shrink-0 border border-white/10 group-hover:scale-110 transition shadow-sm"
                        style={{ backgroundColor: lightFg }}
                      />
                      <span className="tracking-wider"># {lightFg.replace(/^#/, '').toUpperCase()}</span>
                    </label>
                  </div>

                  {/* Accent */}
                  <div className="px-3.5 sm:px-4 py-2 flex items-center justify-between gap-4">
                    <div className="text-[12.5px] font-medium text-[#dededf]">Accent</div>
                    <label className="flex items-center gap-2 px-2.5 py-1 rounded-lg bg-[#161616] hover:bg-[#202024] border border-[#26262a] text-[11.5px] font-mono text-[#dededf] shrink-0 cursor-pointer group transition">
                      <input
                        type="color"
                        value={lightAccent}
                        onChange={(e) => {
                          const val = e.target.value;
                          setLightAccent(val);
                          setGlobalCustomColor('light', 'accent', val);
                        }}
                        className="sr-only"
                      />
                      <span
                        className="w-3.5 h-3.5 rounded-[3px] shrink-0 border border-white/10 group-hover:scale-110 transition shadow-sm"
                        style={{ backgroundColor: lightAccent }}
                      />
                      <span className="tracking-wider"># {lightAccent.replace(/^#/, '').toUpperCase()}</span>
                    </label>
                  </div>
                </div>
              </div>

              {/* 3. Section: Dark Theme */}
              <div className="space-y-1.5">
                <div className="text-[12px] font-medium text-[#d4d4d8]">Dark Theme</div>
                <div className="rounded-xl bg-[#101010] border border-[#222226] divide-y divide-[#1e1e20] overflow-visible">
                  {/* Preset */}
                  <div className="px-3.5 sm:px-4 py-2 flex items-center justify-between gap-4 relative">
                    <div className="text-[12.5px] font-medium text-[#dededf]">Preset</div>
                    <div className="relative shrink-0" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        onClick={() => setOpenDropdown(openDropdown === 'darkPreset' ? 'none' : 'darkPreset')}
                        className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-[#202022] hover:bg-[#28282c] border border-[#2e2e34] text-[11.5px] font-medium text-[#dededf] transition cursor-pointer whitespace-nowrap shrink-0"
                      >
                        <span>{darkPreset}</span>
                        <ChevronDown className="w-3.5 h-3.5 text-[#868686]" />
                      </button>

                    <BottomSheet
                      isOpen={openDropdown === 'darkPreset'}
                      onClose={() => setOpenDropdown('none')}
                      title="Dark Theme Preset"
                      zIndex={100020}
                      className="w-full sm:w-52 max-h-[80vh] sm:max-h-[380px] overflow-y-auto sm:top-full sm:right-0 sm:mt-1 bg-[#161616] border-t sm:border border-[#28282e] py-2 sm:py-1 divide-y divide-[#202024]"
                    >
                      {DARK_PRESETS.map((p) => {
                        const isSelected = darkPreset === p.id;
                        return (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => {
                              handleSetDarkPreset(p.id);
                              setOpenDropdown('none');
                            }}
                            className="w-full flex items-center justify-between px-4 sm:px-3 py-3 sm:py-2 text-left hover:bg-[#202024] transition cursor-pointer group"
                          >
                            <div className="flex items-center gap-2.5 sm:gap-2">
                              <span
                                className="w-4 h-4 sm:w-3 sm:h-3 rounded-full border border-white/20 shrink-0"
                                style={{ backgroundColor: p.bg }}
                              />
                              <span className={`text-[13px] sm:text-[11.5px] font-medium ${isSelected ? 'text-white' : 'text-[#dededf]'}`}>
                                {p.label}
                              </span>
                            </div>
                            {isSelected && <Check className="w-4 h-4 sm:w-3.5 sm:h-3.5 text-white shrink-0" />}
                          </button>
                        );
                      })}
                    </BottomSheet>
                    </div>
                  </div>

                  {/* Background */}
                  <div className="px-3.5 sm:px-4 py-2 flex items-center justify-between gap-4">
                    <div className="text-[12.5px] font-medium text-[#dededf]">Background</div>
                    <label className="flex items-center gap-2 px-2.5 py-1 rounded-lg bg-[#161616] hover:bg-[#202024] border border-[#26262a] text-[11.5px] font-mono text-[#dededf] shrink-0 cursor-pointer group transition">
                      <input
                        type="color"
                        value={darkBg}
                        onChange={(e) => {
                          const val = e.target.value;
                          setDarkBg(val);
                          setGlobalCustomColor('dark', 'bg', val);
                        }}
                        className="sr-only"
                      />
                      <span
                        className="w-3.5 h-3.5 rounded-[3px] shrink-0 border border-white/10 group-hover:scale-110 transition shadow-sm"
                        style={{ backgroundColor: darkBg }}
                      />
                      <span className="tracking-wider"># {darkBg.replace(/^#/, '').toUpperCase()}</span>
                    </label>
                  </div>

                  {/* Foreground */}
                  <div className="px-3.5 sm:px-4 py-2 flex items-center justify-between gap-4">
                    <div className="text-[12.5px] font-medium text-[#dededf]">Foreground</div>
                    <label className="flex items-center gap-2 px-2.5 py-1 rounded-lg bg-[#161616] hover:bg-[#202024] border border-[#26262a] text-[11.5px] font-mono text-[#dededf] shrink-0 cursor-pointer group transition">
                      <input
                        type="color"
                        value={darkFg}
                        onChange={(e) => {
                          const val = e.target.value;
                          setDarkFg(val);
                          setGlobalCustomColor('dark', 'fg', val);
                        }}
                        className="sr-only"
                      />
                      <span
                        className="w-3.5 h-3.5 rounded-[3px] shrink-0 border border-white/10 group-hover:scale-110 transition shadow-sm"
                        style={{ backgroundColor: darkFg }}
                      />
                      <span className="tracking-wider"># {darkFg.replace(/^#/, '').toUpperCase()}</span>
                    </label>
                  </div>

                  {/* Accent */}
                  <div className="px-3.5 sm:px-4 py-2 flex items-center justify-between gap-4">
                    <div className="text-[12.5px] font-medium text-[#dededf]">Accent</div>
                    <label className="flex items-center gap-2 px-2.5 py-1 rounded-lg bg-[#161616] hover:bg-[#202024] border border-[#26262a] text-[11.5px] font-mono text-[#dededf] shrink-0 cursor-pointer group transition">
                      <input
                        type="color"
                        value={darkAccent}
                        onChange={(e) => {
                          const val = e.target.value;
                          setDarkAccent(val);
                          setGlobalCustomColor('dark', 'accent', val);
                        }}
                        className="sr-only"
                      />
                      <span
                        className="w-3.5 h-3.5 rounded-[3px] shrink-0 border border-white/10 group-hover:scale-110 transition shadow-sm"
                        style={{ backgroundColor: darkAccent }}
                      />
                      <span className="tracking-wider"># {darkAccent.replace(/^#/, '').toUpperCase()}</span>
                    </label>
                  </div>
                </div>
              </div>

              {/* Code Preview Card (Image 2) */}
              <div className="rounded-xl bg-[#0e0e11] border border-[#222226] p-3.5 font-mono text-[12px] leading-relaxed select-text space-y-0.5">
                <div className="text-[#868686]">// Greet a user by name</div>
                <div>
                  <span className="text-[#38bdf8]">const </span>
                  <span className="text-[#f5f5f7]">greet </span>
                  <span className="text-[#dededf]">= (</span>
                  <span className="text-[#f5f5f7]">name</span>
                  <span className="text-[#dededf]">: </span>
                  <span className="text-[#38bdf8]">string</span>
                  <span className="text-[#dededf]">) =&gt; &#123;</span>
                </div>
                <div className="pl-4">
                  <span className="text-[#38bdf8]">return </span>
                  <span className="text-[#4ade80]">`Hello, $&#123;name&#125;!`</span>
                  <span className="text-[#dededf]">;</span>
                </div>
                <div className="text-[#dededf]">&#125;;</div>
              </div>

              {/* 4. Section: Chat Settings (Image 2) */}
              <div className="space-y-1.5">
                <div className="text-[12px] font-medium text-[#d4d4d8]">Chat Settings</div>
                <div className="rounded-xl bg-[#101010] border border-[#222226] divide-y divide-[#1e1e20] overflow-hidden">
                  {/* Verbose Agent Chat */}
                  <div className="px-3.5 sm:px-4 py-2.5 flex items-center justify-between gap-4">
                    <div className="space-y-0.5 min-w-0 flex-1 pr-3">
                      <div className="text-[13px] font-medium text-[#f0f0f2]">
                        Verbose Agent Chat
                      </div>
                      <div className="text-[11.5px] text-[#868686] leading-relaxed">
                        Display and preserve intermediate thinking steps.
                      </div>
                    </div>
                    <div className="shrink-0">
                      <ToggleSwitch
                        checked={verboseChat}
                        onChange={handleSetVerboseChat}
                        ariaLabel="Toggle verbose agent chat"
                      />
                    </div>
                  </div>

                  {/* Conversation Width */}
                  <div className="px-3.5 sm:px-4 py-2.5 flex items-center justify-between gap-4">
                    <div className="space-y-0.5 min-w-0 flex-1 pr-3">
                      <div className="text-[13px] font-medium text-[#f0f0f2]">
                        Conversation Width
                      </div>
                      <div className="text-[11.5px] text-[#868686] leading-relaxed">
                        Configure the maximum width of the conversation panel.
                      </div>
                    </div>
                    <div className="flex items-center p-0.5 bg-[#161616] border border-[#26262a] rounded-lg shrink-0">
                      <button
                        type="button"
                        onClick={() => handleSetChatWidth('narrow')}
                        className={`px-3 py-1 rounded-md text-[11.5px] font-medium transition cursor-pointer whitespace-nowrap ${
                          chatWidth === 'narrow'
                            ? 'bg-[#2d2d2d] text-white shadow-sm'
                            : 'text-[#868686] hover:text-[#dededf]'
                        }`}
                      >
                        Narrow
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSetChatWidth('default')}
                        className={`px-3 py-1 rounded-md text-[11.5px] font-medium transition cursor-pointer whitespace-nowrap ${
                          chatWidth === 'default'
                            ? 'bg-[#2d2d2d] text-white shadow-sm'
                            : 'text-[#868686] hover:text-[#dededf]'
                        }`}
                      >
                        Default
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSetChatWidth('wide')}
                        className={`px-3 py-1 rounded-md text-[11.5px] font-medium transition cursor-pointer whitespace-nowrap ${
                          chatWidth === 'wide'
                            ? 'bg-[#2d2d2d] text-white shadow-sm'
                            : 'text-[#868686] hover:text-[#dededf]'
                        }`}
                      >
                        Wide
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: MODELS */}
          {activeTab === 'models' && (
            <div className="space-y-5 animate-fade-in pr-0 sm:pr-6 pb-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-[#f5f5f7] tracking-tight">Models</h2>
                  <p className="text-[12px] text-[#868686] mt-0.5">
                    Configure AI providers, inference endpoints, reasoning budget, and API keys.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleSave}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#202022] hover:bg-[#28282c] text-white text-[11.5px] font-medium border border-[#2e2e34] transition shadow-sm cursor-pointer"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>Save</span>
                </button>
              </div>

              <div className="space-y-3 pt-1">
                <div className="p-3.5 sm:p-4 rounded-xl bg-[#101010] border border-[#222226] space-y-1.5">
                  <label className="text-[12.5px] font-medium text-[#dededf]">Gateway Endpoint (OpenAI Compatible)</label>
                  <input
                    type="text"
                    value={gatewayUrl}
                    onChange={(e) => setGatewayUrl(e.target.value)}
                    placeholder="https://your-gateway.com/v1"
                    className="w-full bg-[#161616] border border-[#26262a] rounded-lg px-3 py-1.5 text-[11.5px] font-mono text-white focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div className="p-3.5 sm:p-4 rounded-xl bg-[#101010] border border-[#222226] space-y-1.5">
                  <label className="text-[12.5px] font-medium text-[#dededf]">API Key / Token</label>
                  <div className="relative">
                    <input
                      type={showApiKey ? 'text' : 'password'}
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      placeholder="sk-..."
                      className="w-full bg-[#161616] border border-[#26262a] rounded-lg px-3 py-1.5 text-[11.5px] font-mono text-white focus:outline-none focus:border-blue-500 pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowApiKey(!showApiKey)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#737373] hover:text-white"
                    >
                      {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div className="rounded-xl bg-[#101010] border border-[#222226] divide-y divide-[#1e1e20]">
                  {/* Default Model */}
                  <div className="p-3.5 sm:p-4 flex items-center justify-between gap-4 relative">
                    <div className="space-y-0.5 min-w-0 flex-1 pr-3">
                      <div className="text-[13px] font-medium text-[#f0f0f2]">Default Model</div>
                      <div className="text-[11.5px] text-[#868686] leading-relaxed">
                        The primary AI model used for code generation, chat, and multi-file tasks.
                      </div>
                    </div>

                    {/* Dynamic models resolved from /v1/models cache or fallback */}
                    {(() => {
                      const displayModels =
                        dynamicModels.length > 0
                          ? dynamicModels.map((m) => {
                              let badge = '';
                              if (m.context_length) {
                                if (m.context_length >= 1000000) badge = `${Math.round(m.context_length / 1000000)}M ctx`;
                                else badge = `${Math.round(m.context_length / 1000)}k ctx`;
                              } else if (m.capabilities?.reasoning) {
                                badge = 'Reasoning';
                              }
                              return {
                                id: m.id,
                                label: m.name || m.id,
                                badge,
                                desc: m.owned_by ? `Provider: ${m.owned_by}` : 'Available via AI Gateway',
                              };
                            })
                          : MODEL_OPTIONS;

                      const activeModelObj = displayModels.find((m) => m.id === defaultModel);

                      return (
                        <div className="flex items-center gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                          <button
                            type="button"
                            onClick={handleRefreshModels}
                            disabled={isRefreshingModels}
                            title="Refresh models cache from /v1/models"
                            className="p-1.5 rounded-lg bg-[#202022] hover:bg-[#28282c] border border-[#2e2e34] text-[#868686] hover:text-[#dededf] transition cursor-pointer disabled:opacity-50"
                          >
                            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshingModels ? 'animate-spin text-blue-400' : ''}`} />
                          </button>

                          <div className="relative shrink-0">
                            <button
                              type="button"
                              onClick={() => setOpenDropdown(openDropdown === 'defaultModel' ? 'none' : 'defaultModel')}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#202022] hover:bg-[#28282c] border border-[#2e2e34] text-[11.5px] font-medium text-[#dededf] transition cursor-pointer whitespace-nowrap shrink-0"
                            >
                              <span>{activeModelObj?.label || defaultModel}</span>
                              <ChevronDown className="w-3.5 h-3.5 text-[#868686]" />
                            </button>

                            <BottomSheet
                              isOpen={openDropdown === 'defaultModel'}
                              onClose={() => setOpenDropdown('none')}
                              title="Default AI Model"
                              zIndex={100020}
                              className="w-full sm:w-80 max-h-[80vh] sm:max-h-[400px] overflow-y-auto sm:top-full sm:right-0 sm:mt-1 bg-[#161616] border-t sm:border border-[#28282e] py-2 sm:py-1 divide-y divide-[#202024]"
                            >
                              {displayModels.map((opt) => {
                                const isSelected = defaultModel === opt.id;
                                return (
                                  <button
                                    key={opt.id}
                                    type="button"
                                    onClick={() => {
                                      setDefaultModel(opt.id);
                                      setOpenDropdown('none');
                                    }}
                                    className="w-full flex items-start justify-between px-4 sm:px-3 py-3 sm:py-2 text-left hover:bg-[#202024] transition cursor-pointer group"
                                  >
                                    <div className="pr-2 min-w-0 flex-1">
                                      <div className="flex items-center gap-1.5">
                                        <span className={`text-[13px] sm:text-[11.5px] font-medium truncate ${isSelected ? 'text-white' : 'text-[#dededf]'}`}>
                                          {opt.label}
                                        </span>
                                        {opt.badge && (
                                          <span className="px-1.5 py-0.2 rounded text-[10px] sm:text-[9.5px] bg-[#222226] text-[#a0a0a8] font-mono shrink-0">
                                            {opt.badge}
                                          </span>
                                        )}
                                      </div>
                                      <div className="text-[11px] sm:text-[10.5px] text-[#868686] mt-0.5 leading-snug truncate">
                                        {opt.desc}
                                      </div>
                                    </div>
                                    {isSelected && <Check className="w-4 h-4 sm:w-3.5 sm:h-3.5 text-white shrink-0 mt-0.5 ml-2" />}
                                  </button>
                                );
                              })}
                            </BottomSheet>
                          </div>
                        </div>
                      );
                    })()}
                  </div>

                  {/* Reasoning Effort */}
                  <div className="p-3.5 sm:p-4 flex items-center justify-between gap-4 relative">
                    <div className="space-y-0.5 min-w-0 flex-1 pr-3">
                      <div className="text-[13px] font-medium text-[#f0f0f2]">Reasoning Effort</div>
                      <div className="text-[11.5px] text-[#868686] leading-relaxed">
                        Cognitive budget and depth for planning, reflection, and code verification.
                      </div>
                    </div>

                    <div className="relative shrink-0" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        onClick={() => setOpenDropdown(openDropdown === 'reasoningEffort' ? 'none' : 'reasoningEffort')}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#202022] hover:bg-[#28282c] border border-[#2e2e34] text-[11.5px] font-medium text-[#dededf] transition cursor-pointer whitespace-nowrap shrink-0"
                      >
                        <span>
                          {REASONING_EFFORT_OPTIONS.find((r) => r.id === reasoningEffort)?.label || reasoningEffort}
                        </span>
                        <ChevronDown className="w-3.5 h-3.5 text-[#868686]" />
                      </button>

                    <BottomSheet
                      isOpen={openDropdown === 'reasoningEffort'}
                      onClose={() => setOpenDropdown('none')}
                      title="Reasoning Effort"
                      zIndex={100020}
                      className="w-full sm:w-64 max-h-[80vh] sm:max-h-[380px] overflow-y-auto sm:top-full sm:right-0 sm:mt-1 bg-[#161616] border-t sm:border border-[#28282e] py-2 sm:py-1 divide-y divide-[#202024]"
                    >
                      {REASONING_EFFORT_OPTIONS.map((opt) => {
                        const isSelected = reasoningEffort === opt.id;
                        return (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() => {
                              handleSetReasoningEffort(opt.id as any);
                              setOpenDropdown('none');
                            }}
                            className="w-full flex items-start justify-between px-4 sm:px-3 py-3 sm:py-2 text-left hover:bg-[#202024] transition cursor-pointer group"
                          >
                            <div className="pr-2">
                              <div className={`text-[13px] sm:text-[11.5px] font-medium ${isSelected ? 'text-white' : 'text-[#dededf]'}`}>
                                {opt.label}
                              </div>
                              <div className="text-[11px] sm:text-[10.5px] text-[#868686] mt-0.5 leading-snug">
                                {opt.desc}
                              </div>
                            </div>
                            {isSelected && <Check className="w-4 h-4 sm:w-3.5 sm:h-3.5 text-white shrink-0 mt-0.5" />}
                          </button>
                        );
                      })}
                    </BottomSheet>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB: MCP SERVERS */}
          {activeTab === 'mcp' && <McpSettingsTab />}

          {/* TAB 5: CUSTOMIZATIONS */}
          {activeTab === 'customizations' && (
            <div className="space-y-5 animate-fade-in pr-0 sm:pr-6 pb-6">
              <div>
                <h2 className="text-lg font-semibold text-[#f5f5f7] tracking-tight">Customizations</h2>
                <p className="text-[12px] text-[#868686] mt-0.5">
                  Manage skills discovery, custom agent rules, and prompt extensions.
                </p>
              </div>

              {/* Skills Accordion (media_1789930464132.png) */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => setSkillsAccordionOpen(!skillsAccordionOpen)}
                    className="flex items-center gap-2 text-left cursor-pointer group select-none"
                  >
                    <span className="text-[13.5px] font-semibold text-[#f0f0f2]">Skills</span>
                    <span className="px-1.5 py-0.5 rounded-full bg-[#202022] border border-[#2e2e34] text-[11px] font-medium text-[#9c9ca4]">
                      {skillsList.length}
                    </span>
                    <ChevronDown
                      className={`w-3.5 h-3.5 text-[#868686] transition-transform duration-200 ${
                        skillsAccordionOpen ? 'rotate-180' : ''
                      }`}
                    />
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setShowAddSkillModal(true);
                      setSkillFormError(null);
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#202022] hover:bg-[#28282c] border border-[#2e2e34] text-[11.5px] font-medium text-[#dededf] hover:text-white transition cursor-pointer shadow-sm"
                  >
                    <Plus className="w-3.5 h-3.5 text-[#38bdf8]" />
                    <span>Add Skill</span>
                  </button>
                </div>

                {skillsAccordionOpen && (
                  <div className="rounded-xl bg-[#101010] border border-[#222226] divide-y divide-[#1e1e20] overflow-hidden">
                    {loadingSkills ? (
                      <div className="p-8 text-center text-[12px] text-[#737373]">
                        Loading skills...
                      </div>
                    ) : skillsList.length === 0 ? (
                      <div className="p-8 text-center space-y-2">
                        <div className="text-[12.5px] text-[#868686]">No skills installed yet.</div>
                        <button
                          type="button"
                          onClick={() => setShowAddSkillModal(true)}
                          className="text-[11.5px] text-[#38bdf8] hover:underline cursor-pointer"
                        >
                          + Add your first skill
                        </button>
                      </div>
                    ) : (
                      skillsList.map((skill) => {
                        const isInstalled = skill.scope === 'installed';
                        return (
                          <div
                            key={skill.name}
                            className="p-3.5 sm:p-4 hover:bg-[#131315] transition flex items-start justify-between gap-3 group"
                          >
                            <div className="min-w-0 flex-1 space-y-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span
                                  onClick={() => handlePreviewSkill(skill)}
                                  className="text-[13px] font-semibold text-[#f0f0f2] hover:text-[#38bdf8] cursor-pointer transition"
                                  title="Click to view SKILL.md"
                                >
                                  {skill.name}
                                </span>
                                {isInstalled ? (
                                  <span className="text-[10px] font-medium px-2 py-0.5 rounded bg-[#132d20] text-[#4ade80] border border-[#1e4e33]/60">
                                    Installed
                                  </span>
                                ) : (
                                  <span className="text-[10px] font-medium px-2 py-0.5 rounded bg-[#162544] text-[#60a5fa] border border-[#1e3a8a]/50">
                                    Global
                                  </span>
                                )}
                              </div>
                              <p className="text-[11.5px] text-[#868686] leading-relaxed line-clamp-2">
                                {skill.description}
                              </p>
                            </div>

                            <div className="flex items-center gap-1 shrink-0 pt-0.5">
                              {/* Copy skill path */}
                              <button
                                type="button"
                                onClick={(e) => handleCopySkillPath(skill, e)}
                                title={copiedSkillPath === skill.name ? 'Path copied!' : 'Copy path'}
                                className="p-1.5 rounded-lg text-[#868686] hover:text-[#dededf] hover:bg-[#202022] transition cursor-pointer"
                              >
                                {copiedSkillPath === skill.name ? (
                                  <Check className="w-3.5 h-3.5 text-[#4ade80]" />
                                ) : (
                                  <Copy className="w-3.5 h-3.5" />
                                )}
                              </button>

                              {/* Delete button: Only for Installed skills */}
                              {isInstalled ? (
                                <button
                                  type="button"
                                  onClick={() => setSkillToDelete(skill)}
                                  title="Delete custom skill"
                                  className="p-1.5 rounded-lg text-[#868686] hover:text-red-400 hover:bg-[#202022] transition cursor-pointer"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              ) : (
                                <span
                                  title="Built-in skills cannot be deleted"
                                  className="p-1.5 text-[#38383e] cursor-not-allowed opacity-30 select-none"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                )}
              </div>

              <div className="space-y-3 pt-2">
                <div className="flex items-center justify-between p-3.5 sm:p-4 rounded-xl bg-[#101010] border border-[#222226]">
                  <div className="min-w-0 flex-1 pr-3">
                    <div className="text-[12.5px] font-medium text-[#dededf]">Auto-discover Workspace Skills</div>
                    <div className="text-[11px] text-[#868686] mt-0.5">
                      Scan .aidev/skills, skills/, and SKILL.md files to populate /skill: suggestions
                    </div>
                  </div>
                  <ToggleSwitch
                    checked={autoDiscoverSkills}
                    onChange={handleSetAutoDiscoverSkills}
                    ariaLabel="Toggle auto-discover workspace skills"
                  />
                </div>
              </div>
            </div>
          )}

          {/* TAB 6: BROWSER */}
          {activeTab === 'browser' && (
            <div className="space-y-4 animate-fade-in pr-0 sm:pr-6 pb-6">
              <div>
                <h2 className="text-lg font-semibold text-[#f5f5f7] tracking-tight">Browser</h2>
                <p className="text-[12px] text-[#868686] mt-0.5 leading-relaxed">
                  Configure the browser subagent. It requires{' '}
                  <a
                    href="https://www.google.com/chrome/"
                    target="_blank"
                    rel="noreferrer"
                    className="text-[#4a9eff] hover:underline cursor-pointer"
                  >
                    Google Chrome
                  </a>{' '}
                  to be installed. The browser subagent can be invoked by typing /browser in the conversation input box.
                </p>
              </div>

              {/* Single Settings Card (media_1789930071924.png) */}
              <div className="rounded-xl bg-[#101010] border border-[#222226] divide-y divide-[#1e1e20] overflow-visible">
                {/* Row 1: Browser Javascript Execution Policy */}
                <div className="px-3.5 sm:px-4 py-2.5 sm:py-3 flex items-center justify-between gap-4 relative">
                  <div className="space-y-0.5 min-w-0 flex-1 pr-3">
                    <div className="text-[13px] font-medium text-[#f0f0f2]">
                      Browser Javascript Execution Policy
                    </div>
                    <div className="text-[11.5px] text-[#868686] leading-relaxed">
                      Controls whether the agent can run custom JavaScript to automate complex browser actions.
                    </div>
                  </div>

                  {/* Dropdown Menu */}
                  <div className="relative shrink-0" onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      onClick={() =>
                        setOpenDropdown(openDropdown === 'browserJsPolicy' ? 'none' : 'browserJsPolicy')
                      }
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#202022] hover:bg-[#28282c] border border-[#2e2e34] text-[11.5px] font-medium text-[#dededf] transition cursor-pointer whitespace-nowrap shrink-0"
                    >
                      <span>{browserJsPolicy}</span>
                      <ChevronDown className="w-3.5 h-3.5 text-[#868686]" />
                    </button>

                    <BottomSheet
                      isOpen={openDropdown === 'browserJsPolicy'}
                      onClose={() => setOpenDropdown('none')}
                      title="Browser JS Execution Policy"
                      zIndex={100020}
                      className="w-full sm:w-64 max-h-[80vh] sm:max-h-[380px] overflow-y-auto sm:top-full sm:right-0 sm:mt-1 bg-[#161616] border-t sm:border border-[#28282e] py-2 sm:py-1 divide-y divide-[#202024]"
                    >
                      {BROWSER_JS_POLICIES.map((opt) => {
                        const isSelected = browserJsPolicy === opt.id;
                        return (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() => {
                              handleSetBrowserJsPolicy(opt.id);
                              setOpenDropdown('none');
                            }}
                            className="w-full flex items-start justify-between px-4 sm:px-3 py-3 sm:py-2 text-left hover:bg-[#202024] transition cursor-pointer group"
                          >
                            <div className="pr-2">
                              <div
                                className={`text-[13px] sm:text-[11.5px] font-medium ${
                                  isSelected ? 'text-white' : 'text-[#dededf]'
                                }`}
                              >
                                {opt.label}
                              </div>
                              <div className="text-[11px] sm:text-[10.5px] text-[#868686] mt-0.5 leading-snug">
                                {opt.desc}
                              </div>
                            </div>
                            {isSelected && <Check className="w-4 h-4 sm:w-3.5 sm:h-3.5 text-white shrink-0 mt-0.5" />}
                          </button>
                        );
                      })}
                    </BottomSheet>
                  </div>
                </div>

                {/* Row 2: Browser Actuation Rules */}
                <div className="px-3.5 sm:px-4 py-2.5 sm:py-3 flex items-center justify-between gap-4">
                  <div className="space-y-0.5 min-w-0 flex-1 pr-3">
                    <div className="text-[13px] font-medium text-[#f0f0f2]">
                      Browser Actuation Rules
                    </div>
                    <div className="text-[11.5px] text-[#868686] leading-relaxed">
                      Configure allowed and denied URLs for browser actuation.
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowActuationRulesModal(true)}
                    className="px-4 py-1.5 rounded-lg bg-[#202022] hover:bg-[#28282c] border border-[#2e2e34] text-[11.5px] font-medium text-[#dededf] transition cursor-pointer whitespace-nowrap shrink-0"
                  >
                    Edit
                  </button>
                </div>
              </div>
            </div>
          )}
          </div>
        </main>
      </div>

      {/* Keyboard Shortcuts Dialog */}
      {showShortcutsModal && (
        <div
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowShortcutsModal(false);
          }}
          className="fixed inset-0 z-[100000] bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 animate-fade-in"
        >
          <div className="w-full max-w-xl bg-[#161616] border border-[#28282e] rounded-2xl p-5 shadow-2xl space-y-4 animate-scale-in max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-[#222226] shrink-0">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-[#007acc]" />
                <div className="text-[14px] font-semibold text-white">All Keyboard Shortcuts</div>
              </div>
              <button
                type="button"
                onClick={() => setShowShortcutsModal(false)}
                className="p-1 text-[#868686] hover:text-white rounded-lg hover:bg-[#202022] transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4 overflow-y-auto pr-1 text-[12px] flex-1">
              {/* Category 1: Navigation & Workspace */}
              <div className="space-y-1.5">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-[#007acc]">
                  Navigation & Workspace
                </div>
                <div className="rounded-xl bg-[#101010] border border-[#222226] divide-y divide-[#1b1b1f] overflow-hidden">
                  <div className="flex items-center justify-between px-3 py-2 text-[#cccccc]">
                    <span>Toggle File Explorer Sidebar</span>
                    <kbd className="px-2 py-0.5 font-mono text-[10.5px] bg-[#1a1a1e] border border-[#28282e] rounded text-white shadow-xs">Ctrl + B</kbd>
                  </div>
                  <div className="flex items-center justify-between px-3 py-2 text-[#cccccc]">
                    <span>Toggle Integrated Terminal</span>
                    <kbd className="px-2 py-0.5 font-mono text-[10.5px] bg-[#1a1a1e] border border-[#28282e] rounded text-white shadow-xs">Ctrl + `</kbd>
                  </div>
                  <div className="flex items-center justify-between px-3 py-2 text-[#cccccc]">
                    <span>Quick Open File Picker</span>
                    <kbd className="px-2 py-0.5 font-mono text-[10.5px] bg-[#1a1a1e] border border-[#28282e] rounded text-white shadow-xs">Ctrl + P</kbd>
                  </div>
                  <div className="flex items-center justify-between px-3 py-2 text-[#cccccc]">
                    <span>Global Search Workspace</span>
                    <kbd className="px-2 py-0.5 font-mono text-[10.5px] bg-[#1a1a1e] border border-[#28282e] rounded text-white shadow-xs">Ctrl + Shift + F</kbd>
                  </div>
                  <div className="flex items-center justify-between px-3 py-2 text-[#cccccc]">
                    <span>Open Settings & Preferences</span>
                    <kbd className="px-2 py-0.5 font-mono text-[10.5px] bg-[#1a1a1e] border border-[#28282e] rounded text-white shadow-xs">Ctrl + ,</kbd>
                  </div>
                  <div className="flex items-center justify-between px-3 py-2 text-[#cccccc]">
                    <span>Close Active Modal / Dropdown / Menu</span>
                    <kbd className="px-2 py-0.5 font-mono text-[10.5px] bg-[#1a1a1e] border border-[#28282e] rounded text-white shadow-xs">ESC</kbd>
                  </div>
                </div>
              </div>

              {/* Category 2: Chat & Assistant */}
              <div className="space-y-1.5">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-[#007acc]">
                  Chat & Prompting
                </div>
                <div className="rounded-xl bg-[#101010] border border-[#222226] divide-y divide-[#1b1b1f] overflow-hidden">
                  <div className="flex items-center justify-between px-3 py-2 text-[#cccccc]">
                    <span>Send Message / Queue Follow-up (while running)</span>
                    <kbd className="px-2 py-0.5 font-mono text-[10.5px] bg-[#1a1a1e] border border-[#28282e] rounded text-white shadow-xs">Enter</kbd>
                  </div>
                  <div className="flex items-center justify-between px-3 py-2 text-[#cccccc]">
                    <span>Insert New Line (without sending)</span>
                    <kbd className="px-2 py-0.5 font-mono text-[10.5px] bg-[#1a1a1e] border border-[#28282e] rounded text-white shadow-xs">Shift + Enter</kbd>
                  </div>
                  <div className="flex items-center justify-between px-3 py-2 text-[#cccccc]">
                    <span>Trigger Slash Commands Menu</span>
                    <kbd className="px-2 py-0.5 font-mono text-[10.5px] bg-[#1a1a1e] border border-[#28282e] rounded text-white shadow-xs">/</kbd>
                  </div>
                  <div className="flex items-center justify-between px-3 py-2 text-[#cccccc]">
                    <span>Mention File or Code Symbol Context</span>
                    <kbd className="px-2 py-0.5 font-mono text-[10.5px] bg-[#1a1a1e] border border-[#28282e] rounded text-white shadow-xs">@</kbd>
                  </div>
                  <div className="flex items-center justify-between px-3 py-2 text-[#cccccc]">
                    <span>Focus Chat Input / Scroll to Bottom</span>
                    <kbd className="px-2 py-0.5 font-mono text-[10.5px] bg-[#1a1a1e] border border-[#28282e] rounded text-white shadow-xs">Ctrl + L</kbd>
                  </div>
                  <div className="flex items-center justify-between px-3 py-2 text-[#cccccc]">
                    <span>Abort Current Agent Stream</span>
                    <kbd className="px-2 py-0.5 font-mono text-[10.5px] bg-[#1a1a1e] border border-[#28282e] rounded text-white shadow-xs">Ctrl + C / Esc</kbd>
                  </div>
                </div>
              </div>

              {/* Category 3: Editor & Diff Viewer */}
              <div className="space-y-1.5">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-[#007acc]">
                  Editor & Diff Viewer
                </div>
                <div className="rounded-xl bg-[#101010] border border-[#222226] divide-y divide-[#1b1b1f] overflow-hidden">
                  <div className="flex items-center justify-between px-3 py-2 text-[#cccccc]">
                    <span>Zoom In / Out Editor Text</span>
                    <kbd className="px-2 py-0.5 font-mono text-[10.5px] bg-[#1a1a1e] border border-[#28282e] rounded text-white shadow-xs">Ctrl + Wheel / Ctrl + +/-</kbd>
                  </div>
                  <div className="flex items-center justify-between px-3 py-2 text-[#cccccc]">
                    <span>Reset Editor Zoom</span>
                    <kbd className="px-2 py-0.5 font-mono text-[10.5px] bg-[#1a1a1e] border border-[#28282e] rounded text-white shadow-xs">Ctrl + 0</kbd>
                  </div>
                  <div className="flex items-center justify-between px-3 py-2 text-[#cccccc]">
                    <span>Find in Current File / Diff</span>
                    <kbd className="px-2 py-0.5 font-mono text-[10.5px] bg-[#1a1a1e] border border-[#28282e] rounded text-white shadow-xs">Ctrl + F</kbd>
                  </div>
                  <div className="flex items-center justify-between px-3 py-2 text-[#cccccc]">
                    <span>Submit Inline Code / Diff Comment</span>
                    <kbd className="px-2 py-0.5 font-mono text-[10.5px] bg-[#1a1a1e] border border-[#28282e] rounded text-white shadow-xs">Ctrl + Enter</kbd>
                  </div>
                  <div className="flex items-center justify-between px-3 py-2 text-[#cccccc]">
                    <span>Previous / Next Diff Change</span>
                    <kbd className="px-2 py-0.5 font-mono text-[10.5px] bg-[#1a1a1e] border border-[#28282e] rounded text-white shadow-xs">Alt + ↑ / Alt + ↓</kbd>
                  </div>
                </div>
              </div>

              {/* Category 4: Permissions & Agent Control */}
              <div className="space-y-1.5">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-[#007acc]">
                  Permissions & Execution
                </div>
                <div className="rounded-xl bg-[#101010] border border-[#222226] divide-y divide-[#1b1b1f] overflow-hidden">
                  <div className="flex items-center justify-between px-3 py-2 text-[#cccccc]">
                    <span>Accept Pending Plan / Tool Execution</span>
                    <kbd className="px-2 py-0.5 font-mono text-[10.5px] bg-[#1a1a1e] border border-[#28282e] rounded text-white shadow-xs">Ctrl + Enter</kbd>
                  </div>
                  <div className="flex items-center justify-between px-3 py-2 text-[#cccccc]">
                    <span>Reject / Request Changes</span>
                    <kbd className="px-2 py-0.5 font-mono text-[10.5px] bg-[#1a1a1e] border border-[#28282e] rounded text-white shadow-xs">Ctrl + Backspace</kbd>
                  </div>
                  <div className="flex items-center justify-between px-3 py-2 text-[#cccccc]">
                    <span>Configure Security & Permission Rules</span>
                    <kbd className="px-2 py-0.5 font-mono text-[10.5px] bg-[#1a1a1e] border border-[#28282e] rounded text-white shadow-xs">Ctrl + Shift + P</kbd>
                  </div>
                </div>
              </div>
            </div>

            <div className="pt-2 border-t border-[#222226] flex items-center justify-between text-[11px] text-[#71717a] shrink-0">
              <span>All keyboard shortcuts are active and ready to use in Aidev</span>
              <button
                type="button"
                onClick={() => setShowShortcutsModal(false)}
                className="px-3 py-1 rounded-lg bg-[#202024] hover:bg-[#28282c] text-white transition cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Browser Actuation Rules Dialog */}
      {showActuationRulesModal && (
        <div
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowActuationRulesModal(false);
          }}
          className="fixed inset-0 z-[100000] bg-black/60 flex items-center justify-center p-4 animate-fade-in"
        >
          <div className="w-full max-w-lg bg-[#161616] border border-[#28282e] rounded-xl p-5 shadow-2xl space-y-4 animate-scale-in">
            <div className="flex items-center justify-between pb-2 border-b border-[#222226]">
              <div>
                <div className="text-[13.5px] font-semibold text-white">Browser Actuation Rules</div>
                <div className="text-[11px] text-[#868686] mt-0.5">
                  Configure allowed and denied URL patterns for browser actuation.
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowActuationRulesModal(false)}
                className="p-1 text-[#868686] hover:text-white rounded-lg hover:bg-[#202022] transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* List of rules */}
            <div className="space-y-1.5 max-h-60 overflow-y-auto pr-1">
              {actuationRules.length === 0 ? (
                <div className="text-center py-6 text-[11.5px] text-[#737373]">
                  No actuation rules defined.
                </div>
              ) : (
                actuationRules.map((rule, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between px-3 py-2 rounded-lg bg-[#101010] border border-[#222226] text-[11.5px] font-mono text-[#dededf]"
                  >
                    <span className="truncate pr-2">{rule}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveActuationRule(idx)}
                      className="text-[#868686] hover:text-red-400 p-1 rounded hover:bg-[#202022] transition cursor-pointer shrink-0"
                      title="Remove rule"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))
              )}
            </div>

            {/* Add new rule */}
            <div className="flex items-center gap-2 pt-2 border-t border-[#222226]">
              <input
                type="text"
                value={newActuationRule}
                onChange={(e) => setNewActuationRule(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddActuationRule();
                  }
                }}
                placeholder="e.g. https://*.example.com/*"
                className="flex-1 bg-[#101010] border border-[#26262a] rounded-lg px-3 py-1.5 text-[11.5px] font-mono text-white placeholder-[#555] focus:outline-none focus:border-blue-500"
              />
              <button
                type="button"
                onClick={handleAddActuationRule}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#202022] hover:bg-[#28282c] border border-[#2e2e34] text-[11.5px] font-medium text-white transition cursor-pointer shrink-0"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add</span>
              </button>
            </div>

            <div className="flex justify-end pt-1">
              <button
                type="button"
                onClick={() => setShowActuationRulesModal(false)}
                className="px-4 py-1.5 rounded-lg bg-[#202022] hover:bg-[#28282c] border border-[#2e2e34] text-[#dededf] hover:text-white text-[11.5px] font-medium transition cursor-pointer"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Skill Modal Dialog */}
      {showAddSkillModal && (
        <div
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowAddSkillModal(false);
          }}
          className="fixed inset-0 z-[100000] bg-black/70 flex items-center justify-center p-4 animate-fade-in"
        >
          <div className="w-full max-w-xl bg-[#161616] border border-[#28282e] rounded-xl p-5 shadow-2xl space-y-4 animate-scale-in">
            {/* Header */}
            <div className="flex items-center justify-between pb-2 border-b border-[#222226]">
              <div>
                <div className="text-[14px] font-semibold text-white">Add Skill</div>
                <div className="text-[11.5px] text-[#868686] mt-0.5">
                  Configure and install custom skills for your agent environment.
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowAddSkillModal(false)}
                className="p-1 text-[#868686] hover:text-white rounded-lg hover:bg-[#202022] transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Mode Switcher Tabs */}
            <div className="flex items-center gap-2 p-1 bg-[#101010] border border-[#222226] rounded-lg text-[11.5px]">
              <button
                type="button"
                onClick={() => {
                  setAddSkillTab('create');
                  setSkillFormError(null);
                }}
                className={`flex-1 py-1 px-3 rounded-md font-medium transition cursor-pointer text-center ${
                  addSkillTab === 'create'
                    ? 'bg-[#202022] text-white shadow-sm border border-[#2e2e34]'
                    : 'text-[#868686] hover:text-[#dededf]'
                }`}
              >
                Create New
              </button>
              <button
                type="button"
                onClick={() => {
                  setAddSkillTab('import');
                  setSkillFormError(null);
                }}
                className={`flex-1 py-1 px-3 rounded-md font-medium transition cursor-pointer text-center ${
                  addSkillTab === 'import'
                    ? 'bg-[#202022] text-white shadow-sm border border-[#2e2e34]'
                    : 'text-[#868686] hover:text-[#dededf]'
                }`}
              >
                Import from URL / GitHub
              </button>
              <button
                type="button"
                onClick={() => {
                  setAddSkillTab('paste');
                  setSkillFormError(null);
                }}
                className={`flex-1 py-1 px-3 rounded-md font-medium transition cursor-pointer text-center ${
                  addSkillTab === 'paste'
                    ? 'bg-[#202022] text-white shadow-sm border border-[#2e2e34]'
                    : 'text-[#868686] hover:text-[#dededf]'
                }`}
              >
                Paste SKILL.md
              </button>
            </div>

            {/* Error banner */}
            {skillFormError && (
              <div className="p-2.5 rounded-lg bg-red-950/40 border border-red-800/60 text-red-300 text-[11.5px]">
                {skillFormError}
              </div>
            )}

            {/* Tab 1: Create New */}
            {addSkillTab === 'create' && (
              <div className="space-y-3">
                <div className="space-y-1">
                  <label className="text-[12px] font-medium text-[#dededf]">
                    Skill Name <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="text"
                    value={newSkillName}
                    onChange={(e) => setNewSkillName(e.target.value)}
                    placeholder="e.g. docker-expert, nextjs-optimizer"
                    className="w-full bg-[#101010] border border-[#26262a] rounded-lg px-3 py-1.5 text-[11.5px] font-mono text-white placeholder-[#555] focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[12px] font-medium text-[#dededf]">Description</label>
                  <input
                    type="text"
                    value={newSkillDescription}
                    onChange={(e) => setNewSkillDescription(e.target.value)}
                    placeholder="Short summary of what this skill enables the agent to do..."
                    className="w-full bg-[#101010] border border-[#26262a] rounded-lg px-3 py-1.5 text-[11.5px] text-white placeholder-[#555] focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[12px] font-medium text-[#dededf]">
                    Instructions (SKILL.md Content)
                  </label>
                  <textarea
                    value={newSkillContent}
                    onChange={(e) => setNewSkillContent(e.target.value)}
                    placeholder="# Skill Instructions&#10;&#10;Provide detailed agent guidance, best practices, rules, or CLI commands here."
                    rows={7}
                    className="w-full bg-[#101010] border border-[#26262a] rounded-lg p-3 text-[11.5px] font-mono text-white placeholder-[#555] focus:outline-none focus:border-blue-500 leading-relaxed resize-y"
                  />
                </div>
              </div>
            )}

            {/* Tab 2: Import from URL */}
            {addSkillTab === 'import' && (
              <div className="space-y-3">
                <div className="space-y-1">
                  <label className="text-[12px] font-medium text-[#dededf]">
                    GitHub Skill Folder / Raw URL <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="text"
                    value={importSkillUrl}
                    onChange={(e) => setImportSkillUrl(e.target.value)}
                    placeholder="https://raw.githubusercontent.com/user/repo/main/skills/docker"
                    className="w-full bg-[#101010] border border-[#26262a] rounded-lg px-3 py-1.5 text-[11.5px] font-mono text-white placeholder-[#555] focus:outline-none focus:border-blue-500"
                  />
                  <div className="text-[11px] text-[#868686] leading-relaxed">
                    Enter the GitHub skill folder URL (e.g. https://raw.githubusercontent.com/.../skills/docker or https://github.com/.../tree/main/skills/docker). All files in the folder will be auto-discovered and installed.
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[12px] font-medium text-[#dededf]">
                    Override Skill Name (Optional)
                  </label>
                  <input
                    type="text"
                    value={newSkillName}
                    onChange={(e) => setNewSkillName(e.target.value)}
                    placeholder="Leave empty for auto-detection from directory"
                    className="w-full bg-[#101010] border border-[#26262a] rounded-lg px-3 py-1.5 text-[11.5px] font-mono text-white placeholder-[#555] focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>
            )}

            {/* Tab 3: Paste SKILL.md */}
            {addSkillTab === 'paste' && (
              <div className="space-y-3">
                <div className="space-y-1">
                  <label className="text-[12px] font-medium text-[#dededf]">
                    Paste Complete SKILL.md (with YAML Frontmatter) <span className="text-red-400">*</span>
                  </label>
                  <textarea
                    value={rawSkillMarkdown}
                    onChange={(e) => setRawSkillMarkdown(e.target.value)}
                    placeholder="---&#10;name: my-skill&#10;description: A useful skill&#10;---&#10;&#10;# Instructions..."
                    rows={9}
                    className="w-full bg-[#101010] border border-[#26262a] rounded-lg p-3 text-[11.5px] font-mono text-white placeholder-[#555] focus:outline-none focus:border-blue-500 leading-relaxed resize-y"
                  />
                </div>
              </div>
            )}

            {/* Footer buttons */}
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#222226]">
              <button
                type="button"
                onClick={() => setShowAddSkillModal(false)}
                className="px-3.5 py-1.5 rounded-lg bg-[#202022] hover:bg-[#28282c] border border-[#2e2e34] text-[11.5px] font-medium text-[#dededf] hover:text-white transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isSubmittingSkill}
                onClick={handleSaveSkill}
                className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-[11.5px] font-medium text-white transition cursor-pointer shadow-sm"
              >
                {isSubmittingSkill ? 'Saving...' : 'Install Skill'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* View Skill Preview Modal */}
      {selectedSkillPreview && (
        <div
          onClick={(e) => {
            if (e.target === e.currentTarget) setSelectedSkillPreview(null);
          }}
          className="fixed inset-0 z-[100000] bg-black/70 flex items-center justify-center p-4 animate-fade-in"
        >
          <div className="w-full max-w-2xl bg-[#161616] border border-[#28282e] rounded-xl p-5 shadow-2xl space-y-4 animate-scale-in max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between pb-2 border-b border-[#222226] shrink-0">
              <div className="flex items-center gap-2.5">
                <span className="text-[14px] font-semibold text-white">
                  {selectedSkillPreview.name}
                </span>
                {selectedSkillPreview.scope === 'installed' ? (
                  <span className="text-[10px] font-medium px-2 py-0.5 rounded bg-[#132d20] text-[#4ade80] border border-[#1e4e33]/60">
                    Installed
                  </span>
                ) : (
                  <span className="text-[10px] font-medium px-2 py-0.5 rounded bg-[#162544] text-[#60a5fa] border border-[#1e3a8a]/50">
                    Global
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={() => setSelectedSkillPreview(null)}
                className="p-1 text-[#868686] hover:text-white rounded-lg hover:bg-[#202022] transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="text-[11px] font-mono text-[#868686] truncate shrink-0">
              {selectedSkillPreview.path}/SKILL.md
            </div>

            <div className="flex-1 overflow-y-auto rounded-lg bg-[#0e0e11] border border-[#222226] p-4 text-[11.5px] font-mono text-[#dededf] leading-relaxed whitespace-pre-wrap select-text">
              {loadingPreview ? 'Loading SKILL.md...' : previewContent}
            </div>

            <div className="flex justify-end pt-2 border-t border-[#222226] shrink-0">
              <button
                type="button"
                onClick={() => setSelectedSkillPreview(null)}
                className="px-4 py-1.5 rounded-lg bg-[#202022] hover:bg-[#28282c] border border-[#2e2e34] text-[11.5px] font-medium text-white transition cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Skill Confirm Modal */}
      {skillToDelete && (
        <div
          onClick={(e) => {
            if (e.target === e.currentTarget) setSkillToDelete(null);
          }}
          className="fixed inset-0 z-[100000] bg-black/70 flex items-center justify-center p-4 animate-fade-in"
        >
          <div className="w-full max-w-sm bg-[#161616] border border-[#28282e] rounded-xl p-5 shadow-2xl space-y-3.5 animate-scale-in">
            <div className="text-[13.5px] font-semibold text-white">Delete Skill</div>
            <p className="text-[12px] text-[#9c9ca4] leading-relaxed">
              Are you sure you want to delete skill <strong className="text-white font-mono">{skillToDelete.name}</strong>? Its folder in <code className="text-[#dededf] font-mono text-[11px]">skills/installed/</code> will be permanently removed.
            </p>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setSkillToDelete(null)}
                className="px-3 py-1.5 rounded-lg bg-[#202022] hover:bg-[#28282c] border border-[#2e2e34] text-[11.5px] font-medium text-[#dededf] transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isDeletingSkill}
                onClick={handleDeleteSkill}
                className="px-3.5 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 disabled:opacity-50 text-[11.5px] font-medium text-white transition cursor-pointer shadow-sm"
              >
                {isDeletingSkill ? 'Deleting...' : 'Delete Skill'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Directory Picker Modal for Adding Project Folder */}
      <DirectoryPickerModal
        isOpen={showAddFolderModal}
        initialPath={activeProject?.workdir_path}
        onClose={() => setShowAddFolderModal(false)}
        onSelectDirectory={handleAddFolder}
      />

      {/* Local Permissions Modal */}
      <PermissionsRulesModal
        isOpen={showPermissionsModal}
        onClose={() => setShowPermissionsModal(false)}
        initialCategory={permissionsCategory}
        permissions={localPermissions}
        onSavePermissions={handleSaveLocalPermissions}
      />
    </div>
  );
};
