'use client';

import React, { useState, useMemo } from 'react';
import Prism from 'prismjs';
import 'prismjs/components/prism-javascript';
import 'prismjs/components/prism-typescript';
import 'prismjs/components/prism-jsx';
import 'prismjs/components/prism-tsx';
import 'prismjs/components/prism-json';
import 'prismjs/components/prism-bash';
import 'prismjs/components/prism-python';
import 'prismjs/components/prism-sql';
import 'prismjs/components/prism-css';
import 'prismjs/components/prism-diff';
import 'prismjs/components/prism-markdown';
import 'prismjs/components/prism-yaml';
import { Copy, Check, AtSign } from 'lucide-react';

export interface FormattedCodeCardProps {
  title?: string;
  code: string | any;
  defaultLanguage?: string;
  allowPrettyJson?: boolean;
  maxHeight?: string;
  className?: string;
  onReference?: () => void;
}

function getPrismGrammar(lang: string) {
  const l = (lang || '').toLowerCase().trim();
  if (l === 'json') return Prism.languages.json;
  if (l === 'ts' || l === 'typescript') return Prism.languages.typescript;
  if (l === 'js' || l === 'javascript') return Prism.languages.javascript;
  if (l === 'tsx') return Prism.languages.tsx;
  if (l === 'jsx') return Prism.languages.jsx;
  if (l === 'bash' || l === 'sh' || l === 'shell' || l === 'zsh') return Prism.languages.bash;
  if (l === 'py' || l === 'python') return Prism.languages.python;
  if (l === 'sql') return Prism.languages.sql;
  if (l === 'css') return Prism.languages.css;
  if (l === 'diff') return Prism.languages.diff;
  if (l === 'md' || l === 'markdown') return Prism.languages.markdown;
  if (l === 'yaml' || l === 'yml') return Prism.languages.yaml;
  return Prism.languages[l] || Prism.languages.javascript;
}

export const FormattedCodeCard: React.FC<FormattedCodeCardProps> = ({
  title,
  code,
  defaultLanguage,
  allowPrettyJson = true,
  maxHeight = 'max-h-[380px]',
  className = '',
  onReference,
}) => {
  const [copied, setCopied] = useState(false);
  const [referenced, setReferenced] = useState(false);

  // Process code, format JSON if applicable, detect prefix & language
  const { displayCode, detectedLang, prefixText } = useMemo(() => {
    let rawText = '';
    if (typeof code === 'string') {
      rawText = code;
    } else if (code !== null && code !== undefined) {
      try {
        rawText = JSON.stringify(code, null, 2);
      } catch {
        rawText = String(code);
      }
    }

    let lang = defaultLanguage ? defaultLanguage.toLowerCase() : '';
    let body = rawText;
    let prefix: string | undefined;

    // Check if rawText has a human message prefix followed by JSON/object
    // e.g.: "Script ran on page and returned:\n{\n  \"key\": \"value\"\n}"
    const prefixMatch = rawText.match(/^([^\{\[\r\n]+(?::|\n))\s*([\{\[][\s\S]*[\}\]])$/);
    if (prefixMatch) {
      const candidatePrefix = prefixMatch[1].trim();
      const candidateJson = prefixMatch[2].trim();
      try {
        const parsed = JSON.parse(candidateJson);
        prefix = candidatePrefix;
        body = JSON.stringify(parsed, null, 2);
        lang = 'json';
      } catch {}
    }

    // Pretty-print JSON if valid
    if (allowPrettyJson && (!lang || lang === 'json')) {
      const trimmed = body.trim();
      if (
        (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
        (trimmed.startsWith('[') && trimmed.endsWith(']'))
      ) {
        try {
          const parsed = JSON.parse(trimmed);
          body = JSON.stringify(parsed, null, 2);
          lang = 'json';
        } catch {}
      }
    }

    // Fallback auto-detection if lang is still empty
    if (!lang) {
      const trimmed = body.trim();
      if (
        (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
        (trimmed.startsWith('[') && trimmed.endsWith(']'))
      ) {
        lang = 'json';
      } else if (
        trimmed.startsWith('$') ||
        /^(?:npm|pnpm|yarn|npx|node|git|cd|cat|ls|docker|curl|echo)\b/m.test(trimmed)
      ) {
        lang = 'bash';
      } else if (/^(?:import|export|const|let|var|function|class)\b/m.test(trimmed)) {
        lang = 'typescript';
      } else if (trimmed.startsWith('<') && trimmed.endsWith('>')) {
        lang = 'html';
      } else {
        lang = 'code';
      }
    }

    return { displayCode: body, detectedLang: lang, prefixText: prefix };
  }, [code, defaultLanguage, allowPrettyJson]);

  // Syntax highlight with Prism
  const highlightedHtml = useMemo(() => {
    if (!displayCode) return null;
    const langKey = detectedLang === 'code' ? 'javascript' : detectedLang;
    const grammar = getPrismGrammar(langKey);
    if (grammar) {
      try {
        return Prism.highlight(displayCode, grammar, langKey);
      } catch (err) {
        console.warn('Prism highlight failed:', err);
      }
    }
    return null;
  }, [displayCode, detectedLang]);

  const handleCopy = () => {
    navigator.clipboard.writeText(displayCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleReference = () => {
    if (onReference) {
      onReference();
      return;
    }
    // Default fallback: copy formatted snippet to clipboard
    navigator.clipboard.writeText(`\`\`\`${detectedLang}\n${displayCode}\n\`\`\``);
    setReferenced(true);
    setTimeout(() => setReferenced(false), 2000);
  };

  return (
    <div className={`space-y-1.5 font-sans ${className}`}>
      {title && (
        <div className="text-[12px] font-medium text-[#8c8c94] dark:text-[#8c8c94] px-0.5 select-none tracking-tight">
          {title}
        </div>
      )}

      {prefixText && (
        <div className="text-[12.5px] text-[#cccccc] dark:text-[#cccccc] px-0.5 leading-relaxed font-sans select-text">
          {prefixText}
        </div>
      )}

      <div className="relative rounded-xl bg-[#0e0e11] dark:bg-[#0e0e11] border border-[#232328] dark:border-[#232328] overflow-hidden shadow-sm group/code transition-colors">
        {/* Card Header Bar */}
        <div className="bg-[#141418] dark:bg-[#141418] px-3.5 py-1.5 flex items-center justify-between text-[11px] text-[#71717a] border-b border-[#232328]/80 font-mono select-none">
          <span className="font-mono text-[#a1a1aa] dark:text-[#a1a1aa] lowercase font-medium text-[11.5px] tracking-wide">
            {detectedLang}
          </span>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={handleReference}
              className="hover:text-white text-[#8c8c94] dark:text-[#8c8c94] dark:hover:text-white transition p-1 rounded-md hover:bg-white/[0.06] cursor-pointer"
              title="Copy snippet reference"
            >
              {referenced ? (
                <Check className="w-3.5 h-3.5 text-[#7ee787]" />
              ) : (
                <AtSign className="w-3.5 h-3.5 opacity-80 hover:opacity-100" />
              )}
            </button>
            <button
              type="button"
              onClick={handleCopy}
              className="hover:text-white text-[#8c8c94] dark:text-[#8c8c94] dark:hover:text-white transition p-1 rounded-md hover:bg-white/[0.06] cursor-pointer flex items-center gap-1"
              title="Copy code"
            >
              {copied ? (
                <Check className="w-3.5 h-3.5 text-[#7ee787]" />
              ) : (
                <Copy className="w-3.5 h-3.5" />
              )}
            </button>
          </div>
        </div>

        {/* Code Content */}
        <pre
          className={`p-3.5 overflow-x-auto text-[12px] font-mono leading-relaxed text-[#e4e4e7] ${maxHeight} overflow-y-auto select-text scrollbar-thin`}
        >
          {highlightedHtml ? (
            <code
              className={`language-${detectedLang}`}
              dangerouslySetInnerHTML={{ __html: highlightedHtml }}
            />
          ) : (
            <code className={`language-${detectedLang}`}>{displayCode}</code>
          )}
        </pre>
      </div>
    </div>
  );
};
