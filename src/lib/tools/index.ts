import path from 'path';
import type { ChatCompletionTool } from 'openai/resources/chat/completions';
import { executeApplyPatch, ApplyPatchParams } from './apply-patch';
import { executeReadFile, ReadFileParams } from './read-file';
import { executeWriteFile, WriteFileParams } from './write-file';
import { executeGlob, GlobParams } from './glob';
import { executeGrep, GrepParams, executeSearchFiles, SearchFilesParams } from './grep';
import { executeRunCommand, RunCommandParams } from './run-command';
import { executeInvokeSubagent, InvokeSubagentParams } from './invoke-subagent';
import { executeUpdateTodos, UpdateTodosParams } from './todo';
import { executeWebSearch, WebSearchParams } from './web-search';
import { executeReadUrl, ReadUrlParams } from './read-url';
import { executeGetRepoMap, RepoMapParams, executeGetFileSymbols, FileSymbolsParams } from './repo-map';
import { executeGetDiagnostics, DiagnosticsParams, executeFindReferences, FindReferencesParams } from './diagnostics';
import { loadSettings } from '../storage';
import { matchPattern } from '../security';
import { mcpClientManager } from '../mcp/client-manager';
import type { McpTool } from '../mcp/types';

export function validateBrowserPolicy(
  toolName: string,
  args: any,
  settings: ReturnType<typeof loadSettings>
) {
  // Check JS Policy
  if (toolName === 'evaluate_script' && settings.browserJsPolicy === 'Disable') {
    throw new Error('AccessDenied: Script evaluation is disabled by Browser JS Policy.');
  }

  // Check URL Actuation Rules for navigation
  const targetUrl = args?.url || args?.targetUrl || args?.uri;
  if (typeof targetUrl === 'string' && targetUrl.trim()) {
    const rules = settings.browserActuationRules || [];
    if (rules.length > 0) {
      const allowed = rules.some((rule) => matchPattern(rule, targetUrl.trim()));
      if (!allowed) {
        throw new Error(
          `AccessDenied: Navigation to "${targetUrl}" blocked by Browser Actuation Rules. Permitted patterns: ${rules.join(', ')}`
        );
      }
    }
  }
}

export const CALL_MCP_TOOL_DEF: ChatCompletionTool = {
  type: 'function',
  function: {
    name: 'call_mcp_tool',
    description: 'Call a lazily-loaded MCP tool from an active MCP server. Read the tool schema file in ~/.aidev/mcp/<serverName>/<toolName>.json to inspect arguments.',
    parameters: {
      type: 'object',
      properties: {
        server_name: {
          type: 'string',
          description: 'Name of the MCP server hosting the tool (e.g. "github", "sqlite", "chrome-devtools-mcp").',
        },
        tool_name: {
          type: 'string',
          description: 'Name of the tool to execute on the MCP server.',
        },
        arguments: {
          type: 'object',
          description: 'Arguments payload conforming to the tool schema.',
        },
      },
      required: ['server_name', 'tool_name', 'arguments'],
    },
  },
};

export function formatMcpToolForOpenAi(mcpTool: McpTool): ChatCompletionTool {
  return {
    type: 'function',
    function: {
      name: mcpTool.prefixedName,
      description: `[MCP: ${mcpTool.serverName}] ${mcpTool.description || mcpTool.name}`,
      parameters: mcpTool.inputSchema || { type: 'object', properties: {} },
    },
  };
}

export const AGENT_TOOLS: ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'apply_patch',
      description: 'Apply unified diff patch directly to a file in the workspace. Creates an automatic pre-change snapshot for 1-click revert.',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Relative path of the target file within the workspace (e.g. src/auth.ts).',
          },
          patchText: {
            type: 'string',
            description: 'Unified diff patch content starting with @@ hunk headers.',
          },
        },
        required: ['path', 'patchText'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'read_file',
      description: 'Read contents of a file in the workspace with optional line slice boundaries. Maximum 500 KB.',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Relative path of the file to read (e.g. package.json).',
          },
          start_line: {
            type: 'number',
            description: 'Optional 1-based start line number.',
          },
          end_line: {
            type: 'number',
            description: 'Optional 1-based end line number.',
          },
        },
        required: ['path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'write_file',
      description: 'Create a new file or completely overwrite an existing file in the workspace. Automatically creates a pre-change snapshot if file exists.',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Relative path of the file to create or overwrite.',
          },
          content: {
            type: 'string',
            description: 'The complete string content to write.',
          },
        },
        required: ['path', 'content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'glob',
      description: 'Fast file search using glob patterns (e.g. src/**/*.tsx, **/*.json). Returns matching relative paths.',
      parameters: {
        type: 'object',
        properties: {
          pattern: {
            type: 'string',
            description: 'Glob pattern to search for (e.g. "**/*.test.ts").',
          },
          ignore: {
            type: 'array',
            items: { type: 'string' },
            description: 'Optional array of glob patterns to exclude.',
          },
        },
        required: ['pattern'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'grep',
      description: 'Search for text or regex patterns across files or directories in the workspace. Returns matching file paths, line numbers, and code line snippets.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'The search string or regex pattern to look for.',
          },
          path: {
            type: 'string',
            description: 'Optional path of a directory or specific file to search within (relative to workspace root). Defaults to entire workspace.',
          },
          isRegex: {
            type: 'boolean',
            description: 'Whether the query is a regular expression (default false).',
          },
          caseSensitive: {
            type: 'boolean',
            description: 'Whether to perform case-sensitive search (default false).',
          },
          filePattern: {
            type: 'string',
            description: 'Optional glob pattern to restrict files searched (e.g. "*.ts", "src/**/*.tsx").',
          },
          maxResults: {
            type: 'number',
            description: 'Maximum number of results to return (default 100).',
          },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_files',
      description: 'Search for text or regex patterns across files in the workspace (alias for grep). Returns file names, line numbers, and snippets.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Search string or regex pattern.',
          },
          path: {
            type: 'string',
            description: 'Optional relative path or directory to search within.',
          },
          isRegex: {
            type: 'boolean',
            description: 'Whether the query is a regular expression (default false).',
          },
          caseSensitive: {
            type: 'boolean',
            description: 'Whether to perform case-sensitive search (default false).',
          },
          filePattern: {
            type: 'string',
            description: 'Optional glob pattern to restrict files searched (e.g. "*.ts").',
          },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'run_command',
      description: 'Execute a shell command headlessly in the workspace root with a timeout. Returns clean stdout, stderr, and exit code.',
      parameters: {
        type: 'object',
        properties: {
          command: {
            type: 'string',
            description: 'Shell command to execute (e.g. npm test, git status).',
          },
          timeoutMs: {
            type: 'number',
            description: 'Execution timeout in milliseconds (default 60000).',
          },
          background: {
            type: 'boolean',
            description: 'Set to true if this is a dev server (e.g. npm run dev, node server.js), long-running test watcher, or background download. It will run as a managed background task.',
          },
        },
        required: ['command'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'ask_question',
      description: 'Ask the user a clarifying question to resolve ambiguities, solicit preferences, or choose architectural direction. Provide 2 to 3 candidate options, with the recommended option listed first.',
      parameters: {
        type: 'object',
        properties: {
          question: {
            type: 'string',
            description: 'The specific question to ask the user.',
          },
          options: {
            type: 'array',
            items: { type: 'string' },
            description: '2 to 3 candidate answers/options, with the recommended option listed first.',
          },
          allowCustom: {
            type: 'boolean',
            description: 'Whether to allow the user to type a custom answer (default true).',
          },
        },
        required: ['question', 'options'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'invoke_subagent',
      description: 'Delegate a focused sub-task to an autonomous background subagent (e.g. researcher, tester, coder, debugger, reviewer). The subagent executes with specialized system instructions and reports findings/results back to you.',
      parameters: {
        type: 'object',
        properties: {
          role_name: {
            type: 'string',
            enum: ['researcher', 'tester', 'coder', 'debugger', 'reviewer'],
            description: 'The specialized role for this subagent (researcher for deep exploration and file reading, tester for running test suites, coder for targeted file edits).',
          },
          task_description: {
            type: 'string',
            description: 'The specific, actionable task description for the subagent to execute.',
          },
        },
        required: ['role_name', 'task_description'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_todos',
      description: 'Update the live interactive task checklist for the session. Use this to plan steps, track real-time progress (pending -> in_progress -> completed), and keep execution transparent.',
      parameters: {
        type: 'object',
        properties: {
          todos: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string', description: 'Unique identifier for the task (e.g. "step-1").' },
                title: { type: 'string', description: 'Clear, concise description of the task step.' },
                status: {
                  type: 'string',
                  enum: ['pending', 'in_progress', 'completed'],
                  description: 'Current status of the task step.',
                },
              },
              required: ['id', 'title', 'status'],
            },
            description: 'The complete array of tasks reflecting the current plan and execution progress.',
          },
        },
        required: ['todos'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'web_search',
      description: 'Search the public web for developer documentation, tutorials, API references, library changes, and error solutions. Returns title, snippet, and clean URLs.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Search query string (e.g. "Next.js App Router server actions" or "TypeScript 5.7 breaking changes").',
          },
          maxResults: {
            type: 'number',
            description: 'Maximum number of search results to return (default 5, max 10).',
          },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'read_url',
      description: 'Fetch and read any public web page or documentation URL, automatically converting HTML to clean, readable Markdown with scripts and ads stripped.',
      parameters: {
        type: 'object',
        properties: {
          url: {
            type: 'string',
            description: 'The HTTP or HTTPS URL to read.',
          },
          maxChars: {
            type: 'number',
            description: 'Maximum number of characters to return (default 20000, max 50000).',
          },
        },
        required: ['url'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_repo_map',
      description: 'Generate a compact architectural map of the workspace codebase. Extracts high-level class, function, interface, and type definitions without loading entire file bodies. Highly token-efficient.',
      parameters: {
        type: 'object',
        properties: {
          directory: {
            type: 'string',
            description: 'Subdirectory to map relative to workspace (defaults to root ".").',
          },
          maxDepth: {
            type: 'number',
            description: 'Maximum directory search depth (default 5).',
          },
          maxFiles: {
            type: 'number',
            description: 'Maximum number of code files to scan (default 80).',
          },
          includeSignatures: {
            type: 'boolean',
            description: 'Whether to include function and method parameter signatures (default true).',
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_file_symbols',
      description: 'Extract a clean outline of all declared symbols, functions, classes, interfaces, and types with their line numbers from a single file.',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Relative path of the target file within the workspace (e.g. "src/lib/db.ts").',
          },
        },
        required: ['path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_diagnostics',
      description: 'Run instant compiler and type-checker diagnostics across TypeScript/JavaScript files in the workspace. Returns line numbers, error codes, and descriptive error messages.',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Optional path of a specific file to check. If omitted, checks the workspace.',
          },
          maxResults: {
            type: 'number',
            description: 'Maximum number of diagnostic issues to return (default 50).',
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'find_references',
      description: 'Find all references and usages of a specific function, class, type, or variable name across the codebase.',
      parameters: {
        type: 'object',
        properties: {
          symbol: {
            type: 'string',
            description: 'The exact symbol or identifier name to search for.',
          },
          path: {
            type: 'string',
            description: 'Optional relative directory or file to restrict the search.',
          },
          maxResults: {
            type: 'number',
            description: 'Maximum number of references to return (default 50).',
          },
        },
        required: ['symbol'],
      },
    },
  },
];

// Read-only subset for researcher sub-agent
export const RESEARCHER_TOOLS: ChatCompletionTool[] = AGENT_TOOLS.filter(
  t => t.type === 'function' && ['read_file', 'glob', 'grep', 'search_files', 'web_search', 'read_url', 'get_repo_map', 'get_file_symbols', 'get_diagnostics', 'find_references'].includes(t.function.name)
);

export function normalizeToolName(name: string): string {
  const lower = name.toLowerCase().trim();
  if (['exec', 'execute', 'execute_command', 'run_command', 'bash', 'sh', 'cmd', 'terminal'].includes(lower)) {
    return 'run_command';
  }
  if (['read_file', 'view_file', 'cat', 'read'].includes(lower)) {
    return 'read_file';
  }
  if (['write_file', 'create_file', 'overwrite_file', 'edit_file'].includes(lower)) {
    return 'write_file';
  }
  if (['apply_patch', 'patch', 'diff_patch'].includes(lower)) {
    return 'apply_patch';
  }
  if (['glob', 'find', 'list_files', 'find_files', 'dir'].includes(lower)) {
    return 'glob';
  }
  if (['search_files', 'grep', 'search', 'grep_search', 'find_in_files'].includes(lower)) {
    return 'grep';
  }
  if (['ask_question', 'ask', 'question', 'confirm', 'clarify'].includes(lower)) {
    return 'ask_question';
  }
  if (['invoke_subagent', 'subagent', 'delegate', 'spawn_subagent', 'start_subagent'].includes(lower)) {
    return 'invoke_subagent';
  }
  if (['update_todos', 'todo_write', 'update_todo', 'manage_tasks', 'todos', 'tasks'].includes(lower)) {
    return 'update_todos';
  }
  if (['web_search', 'search_web', 'google', 'bing', 'search_internet'].includes(lower)) {
    return 'web_search';
  }
  if (['read_url', 'fetch_url', 'fetch_page', 'browse_url', 'get_url'].includes(lower)) {
    return 'read_url';
  }
  if (['get_repo_map', 'repo_map', 'codebase_map', 'skeleton'].includes(lower)) {
    return 'get_repo_map';
  }
  if (['get_file_symbols', 'file_symbols', 'symbols', 'outline'].includes(lower)) {
    return 'get_file_symbols';
  }
  if (['get_diagnostics', 'diagnostics', 'typecheck', 'tsc', 'lint'].includes(lower)) {
    return 'get_diagnostics';
  }
  if (['find_references', 'references', 'find_usages', 'usages'].includes(lower)) {
    return 'find_references';
  }
  return name;
}

export async function dispatchToolCall(
  name: string,
  args: any,
  workdir: string,
  sessionId: string,
  messageId: string,
  onEvent?: (event: any) => void
): Promise<any> {
  const normName = normalizeToolName(name);

  // Normalize common argument keys
  const normalizedArgs = { ...args };
  if (!normalizedArgs.command && normalizedArgs.cmd) {
    normalizedArgs.command = normalizedArgs.cmd;
  }
  if (!normalizedArgs.path && normalizedArgs.file) {
    normalizedArgs.path = normalizedArgs.file;
  }
  if (!normalizedArgs.path && normalizedArgs.filePath) {
    normalizedArgs.path = normalizedArgs.filePath;
  }
  if (!normalizedArgs.path && normalizedArgs.searchPath) {
    normalizedArgs.path = normalizedArgs.searchPath;
  }

  // Workspace Confinement Security Enforcement
  const settings = loadSettings();
  if (settings.workspaceConfinement && workdir) {
    const targetPath = normalizedArgs.path || normalizedArgs.file || normalizedArgs.dir;
    if (typeof targetPath === 'string' && targetPath.trim()) {
      const resolved = path.isAbsolute(targetPath)
        ? path.normalize(targetPath)
        : path.normalize(path.join(workdir, targetPath));
      const normWorkdir = path.normalize(workdir);
      const rel = path.relative(normWorkdir, resolved);
      const isEscaped = rel.startsWith('..') || path.isAbsolute(rel);
      const isInternalArtifact =
        resolved.toLowerCase().includes('.aidev') ||
        targetPath.startsWith('artifact:') ||
        targetPath.startsWith('artifacts/') ||
        targetPath === 'walkthrough.md' ||
        targetPath === 'implementation_plan.md';
      if (isEscaped && !isInternalArtifact) {
        throw new Error(
          `[Workspace Confinement Security Policy] Access denied to path "${targetPath}". The agent is strictly locked to workspace: "${workdir}".`
        );
      }
    }
  }

  switch (normName) {
    case 'update_todos':
      return await executeUpdateTodos(normalizedArgs as UpdateTodosParams, sessionId, onEvent);
    case 'web_search':
      return await executeWebSearch(normalizedArgs as WebSearchParams);
    case 'read_url':
      return await executeReadUrl(normalizedArgs as ReadUrlParams);
    case 'get_repo_map':
      return await executeGetRepoMap(normalizedArgs as RepoMapParams, workdir);
    case 'get_file_symbols':
      return await executeGetFileSymbols(normalizedArgs as FileSymbolsParams, workdir);
    case 'get_diagnostics':
      return await executeGetDiagnostics(normalizedArgs as DiagnosticsParams, workdir);
    case 'find_references':
      return await executeFindReferences(normalizedArgs as FindReferencesParams, workdir);
    case 'apply_patch':
      return await executeApplyPatch(normalizedArgs as ApplyPatchParams, workdir, sessionId, messageId);
    case 'read_file':
      return await executeReadFile(normalizedArgs as ReadFileParams, workdir, sessionId);
    case 'write_file':
      return await executeWriteFile(normalizedArgs as WriteFileParams, workdir, sessionId, messageId);
    case 'glob':
      return await executeGlob(normalizedArgs as GlobParams, workdir);
    case 'grep':
    case 'search_files':
      return await executeGrep(normalizedArgs as GrepParams, workdir);
    case 'run_command':
      return await executeRunCommand(normalizedArgs as RunCommandParams, workdir, sessionId);
    case 'invoke_subagent':
      return await executeInvokeSubagent(
        normalizedArgs as InvokeSubagentParams,
        workdir,
        sessionId,
        messageId,
        onEvent
      );
    case 'call_mcp_tool': {
      const serverName = normalizedArgs.server_name || normalizedArgs.serverName || '';
      const toolName = normalizedArgs.tool_name || normalizedArgs.toolName || '';
      const toolArgs = normalizedArgs.arguments || normalizedArgs.args || {};

      if (
        serverName === 'chrome-devtools-mcp' ||
        toolName === 'navigate_page' ||
        toolName === 'new_page' ||
        toolName === 'evaluate_script'
      ) {
        validateBrowserPolicy(toolName, toolArgs, loadSettings());
      }

      const res = await mcpClientManager.callTool(serverName, toolName, toolArgs, sessionId);
      if (res.isError) {
        throw new Error(res.content);
      }
      if (res.mediaUrl) {
        return JSON.stringify({
          output: res.content,
          mediaUrl: res.mediaUrl,
          filename: res.filename,
        });
      }
      return res.content;
    }
    default: {
      // Check if this is an eager MCP tool call
      const mcpFound = mcpClientManager.findTool(name);
      if (mcpFound) {
        if (
          mcpFound.serverName === 'chrome-devtools-mcp' ||
          mcpFound.tool.name === 'navigate_page' ||
          mcpFound.tool.name === 'new_page' ||
          mcpFound.tool.name === 'evaluate_script'
        ) {
          validateBrowserPolicy(mcpFound.tool.name, normalizedArgs, loadSettings());
        }
        const res = await mcpClientManager.callTool(mcpFound.serverName, mcpFound.tool.name, normalizedArgs, sessionId);
        if (res.isError) {
          throw new Error(res.content);
        }
        if (res.mediaUrl) {
          return JSON.stringify({
            output: res.content,
            mediaUrl: res.mediaUrl,
            filename: res.filename,
          });
        }
        return res.content;
      }
      throw new Error(`Unknown tool: ${name}`);
    }
  }
}
