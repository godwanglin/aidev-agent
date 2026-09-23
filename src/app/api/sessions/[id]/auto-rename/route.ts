import { NextResponse } from 'next/server';
import { sessionRepo, messageRepo } from '@/lib/db';
import { getOpenAIClient } from '@/lib/gateway';

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = sessionRepo.getById(id);
    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    let body: any = {};
    try {
      body = await req.json();
    } catch {}

    const messages = messageRepo.listBySession(id);

    // Prepare snippet of the initial conversation (up to first 4 user/assistant messages)
    const snippetLines: string[] = [];
    let charCount = 0;
    for (const msg of messages) {
      if (msg.role === 'user' || msg.role === 'assistant') {
        const roleLabel = msg.role === 'user' ? 'User' : 'Assistant';
        const content = (msg.content || '').slice(0, 300);
        snippetLines.push(`${roleLabel}: ${content}`);
        charCount += content.length;
        if (snippetLines.length >= 4 || charCount > 600) break;
      }
    }

    if (snippetLines.length === 0 && (body.prompt || body.content)) {
      const text = String(body.prompt || body.content).slice(0, 300);
      snippetLines.push(`User: ${text}`);
    }

    if (snippetLines.length === 0) {
      return NextResponse.json({ title: session.title, id });
    }

    const conversationText = snippetLines.join('\n');

    try {
      const client = getOpenAIClient();
      const modelToUse = session.model_id || 'gemini-3.8-flash-high';

      const completion = await client.chat.completions.create(
        {
          model: modelToUse,
          messages: [
            {
              role: 'system',
              content: `You are an AI assistant specialized in generating concise, clear conversation titles.
Analyze the conversation snippet and generate a short 3 to 6 word title that captures the user's intent or topic.
Rules:
- Output ONLY the plain title text, nothing else.
- Keep it 3 to 6 words maximum.
- Do NOT include quotation marks, backticks, asterisks, prefixes (such as "Title:" or "Topic:"), or trailing punctuation.
- Match the primary language used by the user in the conversation (e.g. Indonesian if the user writes in Indonesian, English if in English).`,
            },
            {
              role: 'user',
              content: conversationText,
            },
          ],
          max_tokens: 30,
          temperature: 0.2,
        },
        { timeout: 7000 }
      );

      let rawTitle = completion.choices[0]?.message?.content?.trim() || '';

      // Clean up punctuation, markdown, quotes, prefixes
      rawTitle = rawTitle
        .replace(/^["'`#*\s]+|["'`#*\s]+$/g, '')
        .replace(/^(title|topic|subject):\s*/i, '')
        .replace(/[.\s]+$/g, '')
        .trim();

      if (rawTitle && rawTitle.length >= 2 && rawTitle.length < 80) {
        sessionRepo.update(id, { title: rawTitle });
        return NextResponse.json({ title: rawTitle, id, source: 'ai' });
      }
    } catch (aiErr: any) {
      console.warn('[AutoRename] AI title generation failed or timed out, falling back:', aiErr?.message || aiErr);
    }

    // Heuristic fallback: derive from first user message or prompt
    const firstUserMsg = messages.find((m) => m.role === 'user');
    let candidateText = (firstUserMsg?.content || body?.prompt || body?.content || '').trim();

    if (candidateText.startsWith('[') || candidateText.startsWith('{')) {
      try {
        const parsed = JSON.parse(candidateText);
        if (Array.isArray(parsed)) {
          const textPart = parsed.find((p: any) => p.type === 'text');
          if (textPart?.text) candidateText = textPart.text;
        }
      } catch {}
    }

    let clean = candidateText
      .replace(/```[\s\S]*?```/g, '')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/^[#>\s*-]+/gm, '')
      .replace(/\r?\n+/g, ' ')
      .trim();

    if (clean.length > 40) {
      const truncated = clean.slice(0, 40);
      const lastSpace = truncated.lastIndexOf(' ');
      clean = (lastSpace > 12 ? truncated.slice(0, lastSpace) : truncated).trim();
    }

    if (clean && clean.length >= 2) {
      sessionRepo.update(id, { title: clean });
      return NextResponse.json({ title: clean, id, source: 'fallback' });
    }

    return NextResponse.json({ title: session.title, id });
  } catch (err: any) {
    console.error('Auto-rename route error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
