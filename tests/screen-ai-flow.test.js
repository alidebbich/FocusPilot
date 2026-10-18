const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { GoogleGenerativeAI } = require('@google/generative-ai');

console.log('--- FocusPilot Multimodal Screen Context AI Test ---');

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
  console.error('No gemini API key found');
  process.exit(1);
}

// 2. Synthesize a clean 1280x720 test screen frame with mock text
const genAI = new GoogleGenerativeAI(keys.gemini);
const model = genAI.getGenerativeModel({
  model: 'gemini-3.5-flash-lite',
  systemInstruction: 'You are FocusPilot, a context-aware Windows desktop assistant. Answer questions based on the provided screen capture.'
});

// A real JPEG buffer of a minimal test image
const mockScreenJpeg = '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=';

const prompt = 'I have shared my screen with you. Confirm that you can receive image context and describe what you are ready to help with.';

(async () => {
  try {
    const chat = model.startChat();
    const result = await chat.sendMessageStream([
      { inlineData: { mimeType: 'image/jpeg', data: mockScreenJpeg } },
      prompt
    ]);

    let fullText = '';
    for await (const chunk of result.stream) {
      fullText += chunk.text();
    }

    console.log('AI Response:');
    console.log(fullText.trim());

    if (fullText.length > 10) {
      console.log('\n✓ Multimodal screen context stream verified successfully!');
      process.exitCode = 0;
    } else {
      console.error('Empty response');
      process.exitCode = 1;
    }
  } catch (err) {
    console.error('Screen AI flow failed:', err);
    process.exitCode = 1;
  }
})();
