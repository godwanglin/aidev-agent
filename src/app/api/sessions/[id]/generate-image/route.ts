export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { sessionRepo, projectRepo, messageRepo } from '@/lib/db';
import { executeGenerateImage } from '@/lib/tools/generate-image';
import { sessionEventBus } from '@/lib/session-bus';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = sessionRepo.getById(id);
  if (!session) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 });
  }

  const project = projectRepo.getById(session.project_id);
  if (!project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }

  try {
    const body = await req.json();
    const { prompt, aspect_ratio, model } = body;
    if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
      return NextResponse.json({ error: 'Prompt is required' }, { status: 400 });
    }

    const cleanPrompt = prompt.trim();

    // 1. Create user message in DB
    const userMsgId = `msg_${Date.now()}_user_img`;
    messageRepo.create({
      id: userMsgId,
      session_id: id,
      role: 'user',
      content: `/image ${cleanPrompt}`,
      created_at: Date.now(),
    });

    // 2. Execute generate image tool directly without LLM roundtrip
    const result = await executeGenerateImage(
      {
        prompt: cleanPrompt,
        aspect_ratio: aspect_ratio || '1:1',
        model: model || undefined,
      },
      project.workdir_path,
      id
    );

    // 3. Create assistant message in DB with markdown image & metadata
    const assistantMsgId = `msg_${Date.now()}_assistant_img`;
    const imageMarkdown = result.markdown;
    const detailsMarkdown = `**Image generated directly:**\n- **Prompt:** ${cleanPrompt}\n- **Model:** \`${model || 'default'}\`\n- **Aspect Ratio:** \`${aspect_ratio || '1:1'}\` (${result.width}x${result.height})\n- **Workspace File:** \`${result.relativePath}\``;
    const finalContent = `${imageMarkdown}\n\n${detailsMarkdown}`;

    messageRepo.create({
      id: assistantMsgId,
      session_id: id,
      role: 'assistant',
      content: finalContent,
      tool_result: JSON.stringify(result),
      status: 'COMPLETED',
      created_at: Date.now() + 1,
    });

    // 4. Update session timestamp
    sessionRepo.update(id, { updated_at: Date.now() });

    // 5. Broadcast file changed so workspace tree & tabs refresh
    if (result.relativePath) {
      sessionEventBus.broadcast(id, {
        type: 'file_changed',
        data: { path: result.relativePath },
      });
    }

    // 6. Broadcast done to trigger clean session refresh across clients
    sessionEventBus.broadcast(id, {
      type: 'done',
      data: { sessionId: id },
    });

    sessionEventBus.broadcast('global', {
      type: 'sessions_updated',
      data: { projectId: session.project_id, sessionId: id },
    });

    return NextResponse.json({
      success: true,
      result,
      userMessageId: userMsgId,
      assistantMessageId: assistantMsgId,
    });
  } catch (err: any) {
    console.error('[GenerateImageRoute] Error:', err);
    return NextResponse.json(
      { error: err.message || 'Failed to generate image' },
      { status: 500 }
    );
  }
}
