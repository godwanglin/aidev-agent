import fs from 'fs';
import path from 'path';
import { sanitizeAndResolvePath } from '../security';
import { getOpenAIClient } from '../gateway';
import { sessionRepo } from '../db';
import { ensureChatStorageInitialized, loadSettings } from '../storage';

export interface GenerateImageParams {
  prompt: string;
  output_path?: string;
  aspect_ratio?: '1:1' | '16:9' | '9:16' | '4:3' | '3:4' | '3:2' | '2:3';
  width?: number;
  height?: number;
  model?: 'flux' | 'turbo' | 'flux-realism' | 'flux-anime' | 'flux-3d' | string;
  seed?: number;
  negative_prompt?: string;
  n?: number;
}

export interface GenerateImageResult {
  success: boolean;
  path: string;
  relativePath: string;
  width: number;
  height: number;
  sizeBytes: number;
  mediaUrl?: string;
  markdown: string;
  message: string;
}

const ASPECT_RATIO_MAP: Record<string, { width: number; height: number }> = {
  '1:1': { width: 1024, height: 1024 },
  '16:9': { width: 1280, height: 720 },
  '9:16': { width: 720, height: 1280 },
  '4:3': { width: 1024, height: 768 },
  '3:4': { width: 768, height: 1024 },
  '3:2': { width: 1080, height: 720 },
  '2:3': { width: 720, height: 1080 },
};

/**
 * Generates an image using OpenAI DALL-E / Gateway endpoint with automatic fallback
 * to high-definition Pollinations.ai (Flux) pipeline.
 */
export async function executeGenerateImage(
  params: GenerateImageParams,
  workdir: string,
  sessionId?: string
): Promise<GenerateImageResult> {
  const prompt = (params?.prompt || '').trim();
  if (!prompt) {
    throw new Error('A descriptive prompt is required to generate an image.');
  }

  // Determine resolution
  let width = params.width;
  let height = params.height;
  if (!width || !height) {
    const ratio = params.aspect_ratio || '1:1';
    const dims = ASPECT_RATIO_MAP[ratio] || ASPECT_RATIO_MAP['1:1'];
    width = width || dims.width;
    height = height || dims.height;
  }

  // Determine output path in workspace
  let targetRelPath = params.output_path?.trim();
  if (!targetRelPath) {
    const safePromptSlug = prompt
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .slice(0, 30)
      .replace(/^_+|_+$/g, '');
    const filename = `gen_${safePromptSlug || 'img'}_${Date.now()}.png`;
    targetRelPath = path.join('generated_images', filename);
  }

  // Ensure file extension
  if (!path.extname(targetRelPath)) {
    targetRelPath += '.png';
  }

  const resolvedAbsPath = sanitizeAndResolvePath(workdir, targetRelPath);
  const outDir = path.dirname(resolvedAbsPath);
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  let imageBuffer: Buffer | null = null;
  let mimeType = 'image/png';

  // 1. First attempt: Call Gateway / OpenAI images endpoint (/v1/images/generations)
  const settings = loadSettings();
  const isAidev =
    !settings.gatewayUrl ||
    settings.gatewayUrl.includes('localhost:3000') ||
    settings.gatewayUrl.includes('127.0.0.1:3000') ||
    settings.gatewayUrl.includes('aidev') ||
    settings.gatewayUrl.includes('weebinhub');

  let requestedImageModel = params.model;
  const isLegacyPollinationsKeyword =
    !requestedImageModel ||
    ['flux', 'turbo', 'default', 'flux-realism', 'flux-anime', 'flux-3d'].includes(requestedImageModel.toLowerCase());

  if (isAidev && isLegacyPollinationsKeyword) {
    requestedImageModel = settings.defaultImageModel || 'gpt-image-2.5';
  } else if (!requestedImageModel) {
    requestedImageModel = settings.defaultImageModel || 'gpt-image-2.5';
  }

  try {
    const client = getOpenAIClient();
    const sizeStr = `${width}x${height}` as any;
    const response = await client.images.generate(
      {
        model: requestedImageModel,
        prompt,
        n: 1,
        size: sizeStr,
        response_format: 'b64_json',
      },
      { timeout: 90000, maxRetries: 0 }
    );

    if (response?.data?.[0]?.b64_json) {
      imageBuffer = Buffer.from(response.data[0].b64_json, 'base64');
      mimeType = 'image/png';
    } else if (response?.data?.[0]?.url) {
      const imgRes = await fetch(response.data[0].url, { signal: AbortSignal.timeout(30000) });
      if (imgRes.ok) {
        const arrBuf = await imgRes.arrayBuffer();
        imageBuffer = Buffer.from(arrBuf);
        mimeType = imgRes.headers.get('content-type') || 'image/png';
      }
    }
  } catch (gatewayErr: any) {
    if (isAidev) {
      const errMsg = gatewayErr?.message || gatewayErr?.error?.message || String(gatewayErr);
      throw new Error(`[Aidev Gateway Image Generation Failed]: ${errMsg}`);
    }
    console.warn(`[GenerateImage] Gateway endpoint attempt failed (${gatewayErr?.message || gatewayErr}), falling back to direct synthesis engine...`);
  }

  // 2. Second attempt: High-fidelity Pollinations pipeline with smart model fallback
  if (!imageBuffer) {
    const candidateModels = params.model
      ? [params.model, 'default', 'turbo']
      : ['default', 'turbo', 'flux'];

    let lastError: Error | null = null;
    const seed = params.seed ?? Math.floor(Math.random() * 1000000);
    const encodedPrompt = encodeURIComponent(prompt);

    for (const m of candidateModels) {
      try {
        let polliUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=${width}&height=${height}&seed=${seed}&nologo=true`;
        if (m !== 'default') {
          polliUrl += `&model=${encodeURIComponent(m)}`;
        }
        if (params.negative_prompt) {
          polliUrl += `&negative=${encodeURIComponent(params.negative_prompt)}`;
        }

        const polliRes = await fetch(polliUrl, {
          signal: AbortSignal.timeout(12000),
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
          },
        });

        if (polliRes.ok) {
          const arrBuf = await polliRes.arrayBuffer();
          if (arrBuf.byteLength > 1000) {
            imageBuffer = Buffer.from(arrBuf);
            mimeType = polliRes.headers.get('content-type') || 'image/jpeg';
            break;
          }
        } else {
          lastError = new Error(`Image generator returned status ${polliRes.status}: ${polliRes.statusText}`);
          // Brief pause before trying fallback model
          await new Promise((resolve) => setTimeout(resolve, 800));
        }
      } catch (err: any) {
        lastError = err;
      }
    }

    if (!imageBuffer) {
      throw lastError || new Error('Failed to generate image across all available pipelines.');
    }
  }

  // Save image to workspace destination
  fs.writeFileSync(resolvedAbsPath, imageBuffer);

  // If sessionId is active, also register into session artifacts for instant visual chat rendering
  let mediaUrl: string | undefined;
  if (sessionId) {
    try {
      const session = sessionRepo.getById(sessionId);
      const projectId = session?.project_id || 'default';
      const chatStorage = ensureChatStorageInitialized(projectId, sessionId);

      const ext = path.extname(resolvedAbsPath).replace('.', '') || (mimeType.includes('jpeg') ? 'jpg' : 'png');
      const artifactFilename = `gen_img_${Date.now()}_${Math.random().toString(36).substring(2, 6)}.${ext}`;
      const artifactFilePath = path.join(chatStorage.artifacts, artifactFilename);

      fs.writeFileSync(artifactFilePath, imageBuffer);

      mediaUrl = `/api/media?file=${encodeURIComponent(artifactFilename)}&sessionId=${encodeURIComponent(sessionId)}`;

      // Update .metadata.json in artifacts
      try {
        const metaPath = path.join(chatStorage.artifacts, '.metadata.json');
        let meta: Record<string, any> = {};
        if (fs.existsSync(metaPath)) {
          try {
            meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
          } catch {}
        }
        meta[artifactFilename] = {
          title: prompt.slice(0, 50),
          type: 'image',
          mimeType,
          updatedAt: Date.now(),
        };
        fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2), 'utf-8');
      } catch {}
    } catch (saveArtifactErr) {
      console.warn('[GenerateImage] Failed writing artifact copy:', saveArtifactErr);
    }
  }

  const normWorkdir = path.normalize(workdir);
  const relativeDisplayPath = path.relative(normWorkdir, resolvedAbsPath).replace(/\\/g, '/');
  const markdownDisplay = mediaUrl
    ? `![${prompt.slice(0, 40)}](${mediaUrl})`
    : `![${prompt.slice(0, 40)}](${relativeDisplayPath})`;

  return {
    success: true,
    path: resolvedAbsPath,
    relativePath: relativeDisplayPath,
    width,
    height,
    sizeBytes: imageBuffer.length,
    mediaUrl,
    markdown: markdownDisplay,
    message: `Image successfully generated and saved to ${relativeDisplayPath} (${width}x${height}, ${(imageBuffer.length / 1024).toFixed(1)} KB).`,
  };
}
