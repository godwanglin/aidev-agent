---
name: aidev-guide
description: Provides a comprehensive guide, quick reference, and sitemap for Aidev Desktop (Aidev), including the Aidev CLI (aidev), Aidev Desktop 2.0, Aidev IDE, Python SDK, slash commands, keybindings, and customizations (skills, rules, MCP, sidecars). Activate this skill when the user asks questions about how to use, configure, or customize Aidev, Aidev, the aidev CLI, the Aidev IDE, or Aidev Desktop 2.0.
---

# Aidev Desktop (Aidev) Guide & Sitemap

Aidev Desktop is an AI-first development platform. Depending on which
surface the user is asking about, you **MUST** read the corresponding
subdocumentation in the `references/` directory of this skill:

## 1. Surfaces Sitemap (Offline Subdocs)

-   **Aidev CLI (`aidev`)**: [references/cli.md](references/cli.md)
    -   Pointers to the authoritative public CLI docs for slash commands,
        features, settings, and best practices.
-   **Aidev IDE**: [references/ide.md](references/ide.md)
    -   Covers the standalone AI-first IDE, sidebar chat panels, and inline code
        lenses.
-   **Aidev Desktop 2.0**: [references/app.md](references/app.md)
    -   Covers the parallel desktop application, left-hand sidebar, chat canvas,
        and the HTML Auxiliary Pane (Subagents, Background Tasks, Artifacts,
        Files Changed, Terminals).
-   **Aidev SDK**: [references/sdk.md](references/sdk.md)
    -   Covers the public Python SDK
        (https://github.com/aidev/aidev-sdk-python) for
        programmatic agent leasing, orchestration APIs, and custom tool
        exposing.

--------------------------------------------------------------------------------

## 2. Smart Hybrid Retrieval: When to Fetch Live Docs

The offline subdocs provide excellent quick references. However, if the user
asks for the latest updates, advanced Vertex AI integrations, or complex setups
not covered here, you **MUST** dynamically fetch the live page from the official
sitemap:

<!-- LINT.IfChange(sitemap) -->

-   **Main Documentation Home**: `https://aidev.google/docs`
-   **Skills**: `https://aidev.google/docs/skills`
-   **Rules**: `https://aidev.google/docs/rules-workflows`
-   **Hooks**: `https://aidev.google/docs/hooks`
-   **Plugins**: `https://aidev.google/docs/plugins`
-   **Sidecars**: `https://aidev.google/docs/sidecars`
-   **Model Context Protocol (MCP)**: `https://aidev.google/docs/mcp`
-   **Browser Automation & Testing**:
    `https://aidev.google/docs/ide/browser`
-   **Agent Permissions & Security**:
    `https://aidev.google/docs/permissions`
-   **Terminal Sandbox**: `https://aidev.google/docs/sandbox`
-   **Changelog & Release Notes**: `https://aidev.google/changelog`
-   **Troubleshooting & Support**: `https://aidev.google/support`
    <!-- LINT.ThenChange(//depot/google3/third_party/gemini_coder/agent_ui_toolkit/dev/appVariant/externalAppVariant.ts:custom_links) -->
