import { v4 as uuidv4 } from 'uuid';
import type { TranscriptSegment, QuestionDetection } from './types';

const QUESTION_PREFIXES = [
  'what', 'why', 'how', 'when', 'where', 'who', 'which',
  'can you', 'could you', 'would you', 'is it', 'is there', 'are there',
  'do you', 'did you', 'have you', 'should we', 'shall we',
  'explain', 'describe', 'tell me', 'walk me through',
  "what's", "how's", "why's", "where's", "who's"
];

export class QuestionDetector {
  private onQuestionCallbacks = new Set<(q: QuestionDetection) => void>();
  private pendingTimer: NodeJS.Timeout | null = null;
  private lastDetectedText = '';

  onQuestion(cb: (q: QuestionDetection) => void): () => void {
    this.onQuestionCallbacks.add(cb);
    return () => this.onQuestionCallbacks.delete(cb);
  }

  processSegment(segment: TranscriptSegment): void {
    const raw = segment.text.trim();
    if (!raw || raw.length < 5) return;

    const lower = raw.toLowerCase();

    // Check if ends with '?' or starts with common question pattern
    const endsWithQuestionMark = raw.endsWith('?');
    const startsWithQuestionWord = QUESTION_PREFIXES.some(
      (prefix) => lower.startsWith(prefix + ' ') || lower === prefix
    );

    const isLikelyQuestion = endsWithQuestionMark || (startsWithQuestionWord && raw.split(' ').length >= 3);

    if (!isLikelyQuestion) {
      return;
    }

    // Calculate basic heuristic confidence (0.5 to 0.95)
    let confidence = 0.6;
    if (endsWithQuestionMark) confidence += 0.25;
    if (startsWithQuestionWord) confidence += 0.15;
    if (raw.split(' ').length >= 5) confidence += 0.05;
    confidence = Math.min(0.99, confidence);

    // Debounce: if the segment is interim, debounce until speech pauses or isFinal arrives
    if (this.pendingTimer) {
      clearTimeout(this.pendingTimer);
      this.pendingTimer = null;
    }

    const fireDetection = () => {
      // Avoid firing duplicate consecutive triggers for the same question
      if (raw.toLowerCase() === this.lastDetectedText.toLowerCase()) {
        return;
      }

      this.lastDetectedText = raw;
      const questionEvent: QuestionDetection = {
        id: uuidv4(),
        text: raw,
        timestamp: segment.timestamp,
        confidence,
        source: 'audio',
      };

      this.onQuestionCallbacks.forEach((cb) => cb(questionEvent));
    };

    if (segment.isFinal) {
      // Small 300ms pause to ensure final sentence closure
      this.pendingTimer = setTimeout(fireDetection, 300);
    } else {
      // For interim transcripts, wait 1400ms for user to finish sentence
      this.pendingTimer = setTimeout(fireDetection, 1400);
    }
  }

  clear(): void {
    if (this.pendingTimer) {
      clearTimeout(this.pendingTimer);
      this.pendingTimer = null;
    }
    this.lastDetectedText = '';
  }
}
