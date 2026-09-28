import { executeGenerateImage } from '../src/lib/tools/generate-image';
import { dispatchToolCall, normalizeToolName } from '../src/lib/tools';
import fs from 'fs';
import path from 'path';

async function run() {
  console.log('Testing normalizeToolName...');
  if (normalizeToolName('image_generation') !== 'generate_image') {
    throw new Error('normalizeToolName failed for image_generation');
  }
  if (normalizeToolName('create_image') !== 'generate_image') {
    throw new Error('normalizeToolName failed for create_image');
  }
  console.log('✅ PASS: Tool normalization verified');

  console.log('Testing executeGenerateImage via dispatchToolCall...');
  const testOutPath = 'tests/output/test_cube.png';
  const result = await dispatchToolCall(
    'generate_image',
    {
      prompt: 'A futuristic cyan energy cube, game asset, plain white background',
      output_path: testOutPath,
      aspect_ratio: '1:1',
      width: 512,
      height: 512,
    },
    process.cwd(),
    'test_session_img',
    'msg_123'
  );

  console.log('Result:', result);
  if (!result.success || !fs.existsSync(result.path)) {
    throw new Error('Image generation failed or file was not created on disk!');
  }
  console.log(`✅ PASS: Image created at ${result.path} (${result.sizeBytes} bytes)`);

  // Clean up test file
  try {
    fs.unlinkSync(result.path);
    const parentDir = path.dirname(result.path);
    if (fs.readdirSync(parentDir).length === 0) {
      fs.rmdirSync(parentDir);
    }
  } catch {}

  console.log('🎉 ALL GENERATE_IMAGE TESTS PASSED!');
}

run().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
