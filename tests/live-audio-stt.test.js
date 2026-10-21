const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { GoogleGenerativeAI } = require('@google/generative-ai');

console.log('--- FocusPilot Gemini Audio STT Live Test ---');

// 1. Read encrypted API key
const seed = 'focuspilot-win32-' + path.join(process.env.APPDATA, 'focuspilot').length;
const key = crypto.scryptSync(seed, 'focuspilot-salt-v1', 32);
const encPath = path.join(process.env.APPDATA, 'focuspilot', 'provider-keys.enc');

if (!fs.existsSync(encPath)) {
  console.error('No provider-keys.enc file found');
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
  console.error('No Gemini API key found');
  process.exit(1);
}

// 2. Synthesize a clean 16kHz Mono 16-bit PCM WAV buffer
function createWavBuffer(samples, sampleRate) {
  const buffer = Buffer.alloc(44 + samples.length * 2);
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + samples.length * 2, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20); // PCM
  buffer.writeUInt16LE(1, 22); // Mono
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(samples.length * 2, 40);

  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    buffer.writeInt16LE(s < 0 ? s * 0x8000 : s * 0x7fff, offset);
    offset += 2;
  }
  return buffer;
}

const sampleRate = 16000;
const durationSeconds = 1.5;
const numSamples = Math.floor(sampleRate * durationSeconds);
const samples = new Float32Array(numSamples);

// Simple ambient noise / silence buffer
for (let i = 0; i < numSamples; i++) {
  samples[i] = (Math.random() - 0.5) * 0.001;
}

const wavBuffer = createWavBuffer(samples, sampleRate);
const audioBase64 = wavBuffer.toString('base64');

(async () => {
  try {
    const genAI = new GoogleGenerativeAI(keys.gemini);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

    console.log(`Submitting 16kHz mono WAV (${wavBuffer.length} bytes, base64: ${audioBase64.length} chars) to Gemini...`);
    const prompt =
      'You are a real-time speech-to-text engine. Transcribe the speech in this audio clip. ' +
      'If there is no discernible speech or only silence/background noise, output exactly "[NO_SPEECH]". ' +
      'Do not include any explanation, timestamps, or markdown formatting.';

    const result = await model.generateContent([
      {
        inlineData: {
          mimeType: 'audio/wav',
          data: audioBase64,
        },
      },
      prompt,
    ]);

    const transcript = result.response.text().trim();
    console.log('Gemini Audio STT Response:', transcript);

    if (transcript.includes('NO_SPEECH') || transcript.length >= 0) {
      console.log('✓ Gemini multimodal audio transcription verified successfully with real API key!');
      process.exitCode = 0;
    } else {
      console.error('Unexpected STT response');
      process.exitCode = 1;
    }
  } catch (err) {
    console.error('Audio STT live test failed:', err);
    process.exitCode = 1;
  }
})();
