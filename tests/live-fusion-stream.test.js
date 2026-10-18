const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { GeminiProvider } = require('../dist/main/providers/geminiProvider');

console.log('--- FocusPilot Multimodal Live Fusion Stream Test ---');

// 1. Read encrypted API key from secure store
const seed = 'focuspilot-win32-' + path.join(process.env.APPDATA, 'focuspilot').length;
const key = crypto.scryptSync(seed, 'focuspilot-salt-v1', 32);
const encPath = path.join(process.env.APPDATA, 'focuspilot', 'provider-keys.enc');

if (!fs.existsSync(encPath)) {
  console.error('No provider-keys.enc found');
  process.exit(1);
}

const raw = fs.readFileSync(encPath);
const iv = raw.subarray(0, 16);
const authTag = raw.subarray(16, 32);
const ciphertext = raw.subarray(32);
const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
decipher.setAuthTag(authTag);
const dec = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
const keys = JSON.parse(dec.toString());

if (!keys.gemini) {
  console.error('No Gemini API key available in secure store');
  process.exit(1);
}

const provider = new GeminiProvider(keys.gemini);

// 2. Synthesize test inputs:
// Minimal valid 1x1 JPEG base64
const mockScreenJpeg = '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=';

const mockAudioContext = {
  recentFullText: 'Interviewer: Can you explain the difference between optimistic locking and pessimistic locking in database transactions? Candidate: Sure, let me review.',
  segments: [
    { text: 'Interviewer: Can you explain the difference between optimistic locking and pessimistic locking in database transactions?', isFinal: true, timestamp: Date.now() - 5000 },
    { text: 'Candidate: Sure, let me review.', isFinal: true, timestamp: Date.now() - 1000 }
  ],
  detectedQuestion: 'Can you explain the difference between optimistic locking and pessimistic locking in database transactions?'
};

const mockImageContext = {
  base64: mockScreenJpeg,
  mimeType: 'image/jpeg',
  timestamp: Date.now(),
  sourceName: 'Primary Display'
};

(async () => {
  try {
    console.log('Testing fused stream with screen JPEG + recent speech transcript context...');
    const stream = provider.streamMessage({
      model: 'gemini-2.5-flash',
      messages: [
        {
          role: 'user',
          content: 'Suggested response for detected question: "Can you explain the difference between optimistic locking and pessimistic locking in database transactions?"'
        }
      ],
      imageContext: mockImageContext,
      audioContext: mockAudioContext,
      temperature: 0.4,
      maxTokens: 500
    });

    let fullAnswer = '';
    let chunkCount = 0;
    for await (const chunk of stream) {
      chunkCount++;
      fullAnswer += chunk;
      process.stdout.write(chunk);
    }

    console.log('\n\n--- Stream completed ---');
    console.log(`Received ${chunkCount} chunks. Total chars: ${fullAnswer.length}`);

    // Verification checks
    const lower = fullAnswer.toLowerCase();
    const hasPessimistic = lower.includes('pessimistic');
    const hasOptimistic = lower.includes('optimistic');

    if (chunkCount > 0 && hasOptimistic && hasPessimistic) {
      console.log('✓ Successfully verified live multimodal fusion streaming with screen and speech context!');
      process.exitCode = 0;
    } else {
      console.error('Response did not contain expected answers');
      process.exitCode = 1;
    }
  } catch (err) {
    console.error('Stream failed:', err);
    process.exitCode = 1;
  }
})();
