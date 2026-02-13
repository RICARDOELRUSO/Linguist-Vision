
import { GoogleGenAI, Type, Modality } from "@google/genai";
import { Difficulty, MediaType, Feedback } from "../types";

const getAI = () => new GoogleGenAI({ apiKey: process.env.API_KEY || '' });

export const generateLessonPrompt = async (
  topic: string,
  difficulty: Difficulty,
  type: MediaType
): Promise<{ url: string; promptText: string }> => {
  const ai = getAI();
  
  let specificContext = "";
  if (topic === 'Business Analysis') {
    specificContext = `Focus on professional Business Analyst activities: 
    1. Requirement Elicitation & Management (Backlog, User Stories, DEEP, MoSCoW, Traceability Matrix).
    2. Stakeholder Management (RACI Model, Onion Diagrams, Matrix).
    3. Process Flow Modeling (BPMN, Value Stream Mapping, Swim lanes).
    4. Solution & Evaluation Management (KPIs, Cost-Benefit Analysis, ROI, Feasibility, Acceptance Criteria).
    Describe a vivid workspace scene where a BA is presenting or analyzing one of these artifacts.`;
  }

  const promptRequest = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: `Generate a detailed, single-sentence visual prompt for an English learner at ${difficulty} level. 
               The topic is "${topic}". ${specificContext}
               Make it vivid, full of details, and suitable for a long description (up to 500 words). 
               Do not include any other text, just the prompt.`,
  });

  const visualPrompt = promptRequest.text || `A professional office scene showing a business analyst working on project requirements.`;

  if (type === 'image') {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: { parts: [{ text: visualPrompt }] },
      config: { imageConfig: { aspectRatio: "16:9" } }
    });

    let imageUrl = '';
    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData) {
        imageUrl = `data:image/png;base64,${part.inlineData.data}`;
        break;
      }
    }
    return { url: imageUrl, promptText: visualPrompt };
  } else {
    let operation = await ai.models.generateVideos({
      model: 'veo-3.1-fast-generate-preview',
      prompt: visualPrompt,
      config: {
        numberOfVideos: 1,
        resolution: '720p',
        aspectRatio: '16:9'
      }
    });

    while (!operation.done) {
      await new Promise(resolve => setTimeout(resolve, 10000));
      operation = await ai.operations.getVideosOperation({ operation: operation });
    }

    const downloadLink = operation.response?.generatedVideos?.[0]?.video?.uri;
    const response = await fetch(`${downloadLink}&key=${process.env.API_KEY}`);
    const blob = await response.blob();
    return { url: URL.createObjectURL(blob), promptText: visualPrompt };
  }
};

export const evaluateDescription = async (
  userDescription: string,
  originalPrompt: string,
  difficulty: Difficulty
): Promise<Feedback> => {
  const ai = getAI();
  
  const levelContext = difficulty === 'Intermediate' 
    ? "B1 level (CEFR). Focus on phrasal verbs and descriptive adjectives." 
    : `${difficulty} level.`;

  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: `Evaluate the following English description of a visual prompt.
               Visual Context: ${originalPrompt}
               User Description: ${userDescription}
               Target Level: ${levelContext}
               
               If the context is Business Analysis, check for correct usage of professional terms: 
               - Requirement Management: Backlog, Elicitation, Traceability, MoSCoW, Baseline.
               - Stakeholder Management: RACI, Onion Diagram, Power/Interest Grid, Engagement.
               - Process Flow: BPMN, Sequence Diagram, Value Stream, Handoffs.
               - Evaluation: KPIs, ROI, NPV, Feasibility, Cost-Benefit, Acceptance Criteria.
               
               The goal is to help the user reach a mastery of up to 500 words.
               
               Provide a "Model Sample Description" that is a polished, native-level version using rich Business Analysis terminology.
               
               Provide feedback strictly in JSON format.`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          score: { type: Type.NUMBER },
          corrections: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                original: { type: Type.STRING },
                correction: { type: Type.STRING },
                explanation: { type: Type.STRING }
              },
              required: ["original", "correction", "explanation"]
            }
          },
          vocabularySuggestions: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: "Provide at least 5 relevant Business Analysis or professional vocabulary words."
          },
          overallComment: { type: Type.STRING },
          modelSampleDescription: { type: Type.STRING, description: "A high-quality, 150-300 word version of the description using advanced BA terminology." }
        },
        required: ["score", "corrections", "vocabularySuggestions", "overallComment", "modelSampleDescription"]
      }
    }
  });

  return JSON.parse(response.text || '{}');
};

export const generateSpeech = async (text: string): Promise<string> => {
  const ai = getAI();
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash-preview-tts",
    contents: [{ parts: [{ text: `Say professionally: ${text}` }] }],
    config: {
      responseModalities: [Modality.AUDIO],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName: 'Kore' },
        },
      },
    },
  });

  const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  if (!base64Audio) throw new Error("No audio data received");
  return base64Audio;
};

export function decodeBase64(base64: string) {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

export async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number,
  numChannels: number,
): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}
