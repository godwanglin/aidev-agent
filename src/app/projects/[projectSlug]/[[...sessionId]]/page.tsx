import DesktopAgentApp from '@/components/workspace/desktop-agent-app';

export default async function ProjectSessionPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectSlug: string; sessionId?: string[] }>;
  searchParams: Promise<{ spw?: string; spd?: 'right' | 'down' }>;
}) {
  const { projectSlug, sessionId } = await params;
  const { spw, spd } = await searchParams;
  const sessId = sessionId && sessionId.length > 0 ? sessionId[0] : undefined;

  return (
    <DesktopAgentApp
      initialProjectSlug={projectSlug}
      initialSessionId={sessId}
      initialSpwId={spw}
      initialSpd={spd}
    />
  );
}
