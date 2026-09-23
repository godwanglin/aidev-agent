import fs from 'fs';
import path from 'path';
import { applyPatch, parsePatch } from 'diff';
import { sanitizeAndResolvePath } from '../security';
import { sessionRepo } from '../db';
import { ensureChatStorageInitialized } from '../storage';
import { createPreChangeSnapshot } from '../snapshot';

export interface ApplyPatchParams {
  path: string;
  patchText: string;
}

export interface ApplyPatchResult {
  success: boolean;
  path: string;
  additions: number;
  deletions: number;
  snapshotId: string;
  isArtifact?: boolean;
  error?: string;
}

export async function executeApplyPatch(
  params: ApplyPatchParams,
  workdir: string,
  sessionId: string,
  messageId: string
): Promise<ApplyPatchResult> {
  const normalizedPath = params.path.replace(/\\/g, '/');
  const cleanBaseName = path.basename(params.path);

  const isArtifact =
    normalizedPath === 'walkthrough.md' ||
    normalizedPath === 'implementation_plan.md' ||
    normalizedPath.startsWith('artifacts/') ||
    normalizedPath.startsWith('.aidev/artifacts/') ||
    normalizedPath.startsWith('artifact:');

  if (isArtifact) {
    const session = sessionRepo.getById(sessionId);
    const projectId = session?.project_id || 'default';
    const chatStorage = ensureChatStorageInitialized(projectId, sessionId);
    const targetFile = path.join(chatStorage.artifacts, cleanBaseName);

    let currentContent = '';
    if (fs.existsSync(targetFile)) {
      currentContent = fs.readFileSync(targetFile, 'utf-8');
    }

    let newContent = applyPatch(currentContent, params.patchText, { fuzzFactor: 2 });
    if (newContent === false) {
      const normalizedOriginal = currentContent.replace(/\r\n/g, '\n');
      const normalizedPatch = params.patchText.replace(/\r\n/g, '\n');
      newContent = applyPatch(normalizedOriginal, normalizedPatch, { fuzzFactor: 4 });
    }

    if (newContent === false) {
      throw new Error(`Failed to apply unified patch to artifact ${params.path}: context line mismatch`);
    }

    fs.writeFileSync(targetFile, newContent, 'utf-8');

    // Update metadata if applicable
    try {
      const metaPath = path.join(chatStorage.artifacts, '.metadata.json');
      let metadata: Record<string, any> = {};
      if (fs.existsSync(metaPath)) {
        try { metadata = JSON.parse(fs.readFileSync(metaPath, 'utf-8')); } catch {}
      }
      let title = cleanBaseName;
      if (cleanBaseName === 'walkthrough.md') {
        const titleMatch = /^#\s*(?:Walkthrough:?\s*)?(.*)$/im.exec(newContent);
        title = titleMatch && titleMatch[1].trim() ? `Walkthrough: ${titleMatch[1].trim()}` : 'Walkthrough';
      } else if (cleanBaseName === 'implementation_plan.md') {
        const titleMatch = /^#\s*(?:Implementation Plan:?\s*)?(.*)$/im.exec(newContent);
        title = titleMatch && titleMatch[1].trim() ? `Implementation Plan: ${titleMatch[1].trim()}` : 'Implementation Plan';
      }
      metadata[cleanBaseName] = { title, updatedAt: Date.now() };
      fs.writeFileSync(metaPath, JSON.stringify(metadata, null, 2), 'utf-8');
    } catch {}

    // Clean up if legacy workdir file exists
    if (workdir) {
      try {
        const legacyFile = sanitizeAndResolvePath(workdir, params.path);
        if (fs.existsSync(legacyFile)) {
          fs.unlinkSync(legacyFile);
          const parent = path.dirname(legacyFile);
          if (path.basename(parent) === 'artifacts' && fs.readdirSync(parent).length === 0) {
            fs.rmdirSync(parent);
          }
        }
      } catch {}
    }

    return {
      success: true,
      path: `artifacts/${cleanBaseName}`,
      additions: 0,
      deletions: 0,
      snapshotId: '',
      isArtifact: true,
    };
  }
  const resolvedTarget = sanitizeAndResolvePath(workdir, params.path);

  let currentContent = '';
  if (fs.existsSync(resolvedTarget)) {
    currentContent = fs.readFileSync(resolvedTarget, 'utf-8');
  } else {
    // If target file doesn't exist, create directory first
    fs.mkdirSync(path.dirname(resolvedTarget), { recursive: true });
  }

  // Attempt to apply patch using diff library
  let newContent = applyPatch(currentContent, params.patchText, {
    fuzzFactor: 2,
  });

  // If applyPatch returned false (hunk failure), attempt normalized line ending patch
  if (newContent === false) {
    const normalizedOriginal = currentContent.replace(/\r\n/g, '\n');
    const normalizedPatch = params.patchText.replace(/\r\n/g, '\n');
    newContent = applyPatch(normalizedOriginal, normalizedPatch, {
      fuzzFactor: 4,
    });
  }

  if (newContent === false) {
    // If standard patch failed, check if patchText is actually raw replacement content
    // or if hunks could be parsed
    const parsed = parsePatch(params.patchText);
    if (parsed.length === 0) {
      throw new Error(`Invalid patch format for ${params.path}`);
    }
    throw new Error(`Failed to apply unified patch to ${params.path}: context line mismatch`);
  }

  // Create pre-change snapshot before writing to disk
  const { snapshotId, additions, deletions } = await createPreChangeSnapshot(
    sessionId,
    messageId,
    workdir,
    params.path,
    newContent
  );

  // Live direct edit to workspace disk
  fs.writeFileSync(resolvedTarget, newContent, 'utf-8');

  return {
    success: true,
    path: params.path.replace(/\\/g, '/'),
    additions,
    deletions,
    snapshotId,
  };
}
