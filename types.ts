
export type Difficulty = 'Beginner' | 'Intermediate' | 'Advanced';

export type MediaType = 'image' | 'video';

export interface LessonPrompt {
  id: string;
  type: MediaType;
  url: string;
  description: string;
  topic: string;
  difficulty: Difficulty;
}

export interface Feedback {
  score: number;
  corrections: {
    original: string;
    correction: string;
    explanation: string;
  }[];
  vocabularySuggestions: string[];
  overallComment: string;
  modelSampleDescription: string;
}

export interface HistoryItem {
  id: string;
  prompt: LessonPrompt;
  userDescription: string;
  feedback: Feedback;
  timestamp: number;
}
