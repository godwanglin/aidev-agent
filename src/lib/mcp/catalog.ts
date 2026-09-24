export interface McpCatalogItem {
  id: string;
  name: string;
  description: string;
  category: 'Cloud & Infrastructure' | 'Developer Tools' | 'Databases' | 'Analytics & AI' | 'Productivity';
  transport: 'stdio' | 'sse';
  command?: string;
  args?: string;
  serverUrl?: string;
  env?: Array<{ key: string; value: string }>;
  loadingMode?: 'eager' | 'lazy';
  badge?: string;
}

export const MCP_CATEGORIES = [
  'All',
  'Cloud & Infrastructure',
  'Developer Tools',
  'Databases',
  'Analytics & AI',
  'Productivity',
] as const;

export const MCP_CATALOG: McpCatalogItem[] = [
  {
    id: 'cloud-audit-manager-us',
    name: 'Cloud Audit Manager (us-central1)',
    description:
      'The Cloud Audit Manager remote MCP server allows you to enroll projects, generate audit and scope reports, and check resource enrollment statuses in the us-central1 region.',
    category: 'Cloud & Infrastructure',
    transport: 'sse',
    serverUrl: 'https://cloudauditmanager.googleapis.com/mcp/us-central1',
    badge: 'Google Cloud',
  },
  {
    id: 'cloud-audit-manager-eu',
    name: 'Cloud Audit Manager (europe-west1)',
    description:
      'The Cloud Audit Manager remote MCP server allows you to enroll projects, generate audit and scope reports, and check resource enrollment statuses in the europe-west1 region.',
    category: 'Cloud & Infrastructure',
    transport: 'sse',
    serverUrl: 'https://cloudauditmanager.googleapis.com/mcp/europe-west1',
    badge: 'Google Cloud',
  },
  {
    id: 'antimetal',
    name: 'Antimetal',
    description:
      'Investigate and fix software issues using AI-powered root cause analysis. This MCP server connects to your Antimetal account to search issues, read investigative reports with causal tracing.',
    category: 'Analytics & AI',
    transport: 'stdio',
    command: 'npx',
    args: '-y antimetal-mcp',
    env: [{ key: 'ANTIMETAL_API_KEY', value: '' }],
  },
  {
    id: 'windsor-ai',
    name: 'Windsor.ai',
    description:
      'Query and act on your marketing, analytics, CRM, e-commerce, and warehouse data across 325+ connectors (Meta Ads, Google Ads, TikTok Ads, GA4, HubSpot, Salesforce, Shopify, Snowflake).',
    category: 'Analytics & AI',
    transport: 'stdio',
    command: 'npx',
    args: '-y @windsorai/mcp-server',
    env: [{ key: 'WINDSOR_API_KEY', value: '' }],
  },
  {
    id: 'gitlab-orbit',
    name: 'GitLab Orbit',
    description:
      'Query your GitLab SDLC as a knowledge graph. Orbit indexes groups, projects, source code, merge requests, pipelines, work items, and security findings into a single graph so agents can reason across the entire lifecycle.',
    category: 'Developer Tools',
    transport: 'stdio',
    command: 'npx',
    args: '-y @gitlab/orbit-mcp',
    env: [{ key: 'GITLAB_ACCESS_TOKEN', value: '' }],
    badge: 'Official',
  },
  {
    id: 'cloud-run',
    name: 'Cloud Run',
    description:
      'Enable Antigravity to deploy apps to Google Cloud Run, inspect services, trigger revisions, and stream build logs.',
    category: 'Cloud & Infrastructure',
    transport: 'stdio',
    command: 'npx',
    args: '-y @google-cloud/mcp-server-cloudrun',
    env: [{ key: 'GOOGLE_CLOUD_PROJECT', value: '' }],
    badge: 'Google Cloud',
  },
  {
    id: 'chrome-devtools',
    name: 'Chrome DevTools',
    description:
      'Automate Chrome, inspect live DOM, network requests, console logs, performance profiling, and browser testing.',
    category: 'Developer Tools',
    transport: 'stdio',
    command: 'npx',
    args: '-y chrome-devtools-mcp@latest',
    loadingMode: 'lazy',
    badge: 'Popular',
  },
  {
    id: 'github',
    name: 'GitHub',
    description:
      'Search repositories, inspect pull requests, issues, commit trees, and perform automated code reviews.',
    category: 'Developer Tools',
    transport: 'stdio',
    command: 'npx',
    args: '-y @modelcontextprotocol/server-github',
    env: [{ key: 'GITHUB_PERSONAL_ACCESS_TOKEN', value: '' }],
    badge: 'Popular',
  },
  {
    id: 'supabase',
    name: 'Supabase',
    description:
      'Manage PostgreSQL databases, inspect schemas, generate SQL migrations, and query tables via Supabase.',
    category: 'Databases',
    transport: 'stdio',
    command: 'npx',
    args: '-y @supabase/mcp-server',
    env: [{ key: 'SUPABASE_ACCESS_TOKEN', value: '' }],
    badge: 'Popular',
  },
  {
    id: 'linear',
    name: 'Linear',
    description:
      'Project tracking, issues, sprint cycles, and roadmap management.',
    category: 'Productivity',
    transport: 'stdio',
    command: 'npx',
    args: '-y @linear/mcp-server',
    env: [{ key: 'LINEAR_API_KEY', value: '' }],
  },
  {
    id: 'neon',
    name: 'Neon',
    description:
      'Serverless Postgres with instant branching, connection pooling, and schema inspection.',
    category: 'Databases',
    transport: 'stdio',
    command: 'npx',
    args: '-y @neondatabase/mcp-server',
    env: [{ key: 'NEON_API_KEY', value: '' }],
  },
  {
    id: 'bigquery',
    name: 'BigQuery',
    description:
      'Run enterprise SQL data queries, analyze dataset schemas, and execute analytical pipelines in Google Cloud.',
    category: 'Databases',
    transport: 'stdio',
    command: 'npx',
    args: '-y @google-cloud/mcp-server-bigquery',
    env: [{ key: 'GOOGLE_CLOUD_PROJECT', value: '' }],
    badge: 'Google Cloud',
  },
  {
    id: 'alloydb',
    name: 'AlloyDB for PostgreSQL',
    description:
      'Google Cloud fully managed relational database management, schema exploration, and query execution.',
    category: 'Databases',
    transport: 'stdio',
    command: 'npx',
    args: '-y @google-cloud/mcp-server-alloydb',
    badge: 'Google Cloud',
  },
  {
    id: 'posthog',
    name: 'PostHog',
    description:
      'Product analytics, event capture, user retention charts, and feature flag management.',
    category: 'Analytics & AI',
    transport: 'stdio',
    command: 'npx',
    args: '-y @posthog/mcp-server',
    env: [{ key: 'POSTHOG_API_KEY', value: '' }],
  },
  {
    id: 'sequential-thinking',
    name: 'Sequential Thinking',
    description:
      'Structured dynamic hypothesis testing and multi-step thought refinement for complex tasks.',
    category: 'Analytics & AI',
    transport: 'stdio',
    command: 'npx',
    args: '-y @modelcontextprotocol/server-sequential-thinking',
  },
  {
    id: 'figma-dev-mode',
    name: 'Figma Dev Mode',
    description:
      'Inspect Figma design files, components, styles, design tokens, and extract CSS/SVG.',
    category: 'Productivity',
    transport: 'stdio',
    command: 'npx',
    args: '-y @figma/mcp-server',
    env: [{ key: 'FIGMA_ACCESS_TOKEN', value: '' }],
  },
  {
    id: 'firebase',
    name: 'Firebase',
    description:
      'Firestore collections, Firebase Authentication, Cloud Storage, and edge functions management.',
    category: 'Cloud & Infrastructure',
    transport: 'stdio',
    command: 'npx',
    args: '-y @firebase/mcp-server',
    env: [{ key: 'FIREBASE_TOKEN', value: '' }],
    badge: 'Google Cloud',
  },
  {
    id: 'atlassian',
    name: 'Atlassian Jira',
    description:
      'Search Jira issues, create tickets, update status, and manage Confluence pages.',
    category: 'Productivity',
    transport: 'stdio',
    command: 'npx',
    args: '-y @atlassian/mcp-server',
    env: [{ key: 'ATLASSIAN_API_TOKEN', value: '' }],
  },
  {
    id: 'postman',
    name: 'Postman',
    description:
      'API collection execution, environment variables, and endpoint testing.',
    category: 'Developer Tools',
    transport: 'stdio',
    command: 'npx',
    args: '-y @postman/mcp-server',
    env: [{ key: 'POSTMAN_API_KEY', value: '' }],
  },
  {
    id: 'sonarqube',
    name: 'SonarQube',
    description:
      'Code quality, code smells, test coverage, and security vulnerability scanning.',
    category: 'Developer Tools',
    transport: 'stdio',
    command: 'npx',
    args: '-y sonarqube-mcp-server',
    env: [{ key: 'SONAR_TOKEN', value: '' }],
  },
  {
    id: 'stripe',
    name: 'Stripe',
    description:
      'Inspect Stripe payments, customer subscriptions, charges, invoices, and webhook events.',
    category: 'Analytics & AI',
    transport: 'stdio',
    command: 'npx',
    args: '-y @stripe/mcp-server',
    env: [{ key: 'STRIPE_SECRET_KEY', value: '' }],
  },
  {
    id: 'filesystem',
    name: 'Local Filesystem',
    description:
      'Read and edit files in specified directories outside the current workspace.',
    category: 'Developer Tools',
    transport: 'stdio',
    command: 'npx',
    args: '-y @modelcontextprotocol/server-filesystem C:\\dev',
  },
  {
    id: 'sqlite',
    name: 'SQLite Database',
    description:
      'Query local SQLite database files, execute migrations, and inspect table schemas.',
    category: 'Databases',
    transport: 'stdio',
    command: 'npx',
    args: '-y @modelcontextprotocol/server-sqlite --db-path ./database.sqlite',
  },
  {
    id: 'postgres',
    name: 'PostgreSQL Database',
    description:
      'Query PostgreSQL databases and inspect schema relations.',
    category: 'Databases',
    transport: 'stdio',
    command: 'npx',
    args: '-y @modelcontextprotocol/server-postgres postgresql://localhost/mydb',
  },
  {
    id: 'brave-search',
    name: 'Brave Web Search',
    description:
      'Perform real-time web searches and news indexing via Brave Search API.',
    category: 'Developer Tools',
    transport: 'stdio',
    command: 'npx',
    args: '-y @modelcontextprotocol/server-brave-search',
    env: [{ key: 'BRAVE_API_KEY', value: '' }],
  },
  {
    id: 'memory',
    name: 'Memory Graph',
    description:
      'Persistent entity-relation graph memory and context retention across sessions.',
    category: 'Analytics & AI',
    transport: 'stdio',
    command: 'npx',
    args: '-y @modelcontextprotocol/server-memory',
  },
  {
    id: 'fetch',
    name: 'Web Fetch / HTML',
    description:
      'Fetch web pages, convert to markdown, and extract clean text content.',
    category: 'Developer Tools',
    transport: 'stdio',
    command: 'uvx',
    args: 'mcp-server-fetch',
  },
];
