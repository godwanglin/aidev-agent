export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { gitService } from '@/lib/git/git-service';
import { getOpenAIClient } from '@/lib/gateway';
import { loadSettings } from '@/lib/storage';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { workdir, modelId } = body;

    if (!workdir || !workdir.trim() || workdir === 'no_project') {
      return NextResponse.json({
        message: 'chore: update project changes',
      });
    }

    const diff = await gitService.getFullDiffForAI(workdir);
    if (!diff || !diff.trim()) {
      return NextResponse.json({
        message: 'chore: update project changes',
      });
    }

    // Truncate diff if extremely large to prevent exceeding token context limits
    const maxDiffLength = 8000;
    const truncatedDiff =
      diff.length > maxDiffLength
        ? diff.substring(0, maxDiffLength) + '\n... [diff truncated for length]'
        : diff;

    const settings = loadSettings();
    const effectiveModel = modelId || settings.defaultModel || 'claude-3-7-sonnet-20250219';
    const client = getOpenAIClient();

    const response = await client.chat.completions.create({
      model: effectiveModel,
      messages: [
        {
          role: 'system',
          content: `You are an expert software developer and Git commit writer.
Generate a concise, high-quality SINGLE-LINE Conventional Commit message summarizing the git changes.

Format:
<type>(<optional-scope>): <short description in imperative mood>
Examples:
- feat(git): add visual diff and commit helper
- fix(auth): resolve session token expiration check
- refactor(storage): move runtimes cache to ~/.cache/aidev-runtimes
- docs: update README deployment instructions
- chore(deps): upgrade fast-glob package

CRITICAL RULES:
1. Output ONLY the single line commit message.
2. Absolutely NO markdown fences (no \`\`\`), NO surrounding quotes, NO leading emojis.
3. Keep it strictly on one line (under 72 characters).
4. Do NOT output multiple lines, bullet points, or explanations.`,
        },
        {
          role: 'user',
          content: `Here is the git diff:\n\n${truncatedDiff}`,
        },
      ],
      temperature: 0.2,
      max_tokens: 60,
    });

    let rawMessage = response.choices[0]?.message?.content?.trim() || '';

    // Sanitize: strip quotes, backticks, take first line
    rawMessage = rawMessage
      .replace(/^```[a-z]*\n?/i, '')
      .replace(/\n?```$/i, '')
      .replace(/^["']|["']$/g, '')
      .trim();

    const firstLine = rawMessage.split(/\r?\n/)[0]?.trim() || 'chore: update project changes';

    return NextResponse.json({ message: firstLine });
  } catch (err: any) {
    console.error('[AI-Commit] Error generating commit message:', err);
    return NextResponse.json(
      {
        message: 'chore: update project changes',
        error: err.message,
      },
      { status: 500 }
    );
  }
}
