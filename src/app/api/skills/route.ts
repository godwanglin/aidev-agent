import { NextResponse } from 'next/server';
import {
  scanAvailableSkills,
  installCustomSkill,
  installSkillFromUrl,
  deleteCustomSkill,
  getSkillContent,
} from '@/lib/skills';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const workdir = searchParams.get('workdir') || undefined;
    const skillPath = searchParams.get('path') || undefined;
    const autoDiscoverParam = searchParams.get('autoDiscover');
    const autoDiscover = autoDiscoverParam !== null ? autoDiscoverParam !== 'false' : undefined;

    // If 'path' is provided, return the SKILL.md content for preview
    if (skillPath) {
      const content = getSkillContent(skillPath);
      return NextResponse.json({ content });
    }

    const skills = scanAvailableSkills(workdir, undefined, { autoDiscover });
    return NextResponse.json({ skills });
  } catch (err: any) {
    console.error('Failed fetching skills:', err);
    return NextResponse.json({ error: err.message || 'Failed fetching skills' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    let { name, description, content, workdir, importUrl } = body;

    // Case 1: Import from GitHub / Raw folder URL
    if (importUrl) {
      const skill = await installSkillFromUrl({
        importUrl,
        workdir,
        overrideName: name,
        overrideDesc: description,
      });
      return NextResponse.json({ success: true, skill });
    }

    // Case 2: Manual creation or raw markdown paste
    if (!name || !name.trim()) {
      return NextResponse.json({ error: 'Skill name is required' }, { status: 400 });
    }

    const skill = installCustomSkill({
      name: name.trim(),
      description: (description || `Custom skill for ${name}`).trim(),
      content: content || `# ${name}\n\nCustom agent instructions for ${name}.`,
      workdir,
    });

    return NextResponse.json({ success: true, skill });
  } catch (err: any) {
    console.error('Failed creating skill:', err);
    return NextResponse.json({ error: err.message || 'Failed to save skill' }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    let skillPath = searchParams.get('path');
    if (!skillPath) {
      const body = await req.json().catch(() => ({}));
      skillPath = body.path;
    }

    if (!skillPath) {
      return NextResponse.json({ error: 'Skill path is required.' }, { status: 400 });
    }

    deleteCustomSkill(skillPath);
    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('Failed deleting skill:', err);
    return NextResponse.json({ error: err.message || 'Failed to delete skill' }, { status: 400 });
  }
}
