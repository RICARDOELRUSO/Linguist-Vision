
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { generateLessonPrompt, evaluateDescription, generateSpeech, decodeBase64, decodeAudioData } from './services/gemini';
import { Difficulty, MediaType, LessonPrompt, Feedback, HistoryItem } from './types';

// Fix: Define AIStudio interface to match environmental declarations and ensure compatibility
declare global {
  interface AIStudio {
    hasSelectedApiKey: () => Promise<boolean>;
    openSelectKey: () => Promise<void>;
  }

  interface Window {
    aistudio: AIStudio;
  }
}

// Components
const Header: React.FC = () => (
  <header className="py-6 px-8 border-b bg-white/50 backdrop-blur-md sticky top-0 z-50 flex items-center justify-between">
    <div className="flex items-center gap-2">
      <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-indigo-200">
        <i className="fas fa-graduation-cap text-lg"></i>
      </div>
      <div>
        <h1 className="text-xl font-bold tracking-tight text-slate-800">LinguistVision</h1>
        <p className="text-xs text-slate-500 font-medium">Professional English & BA Tutor</p>
      </div>
    </div>
  </header>
);

const HistoryPanel: React.FC<{ history: HistoryItem[], onSelect: (item: HistoryItem) => void }> = ({ history, onSelect }) => (
  <aside className="hidden lg:flex flex-col w-80 border-l bg-white h-screen fixed right-0 top-0 pt-24 p-6 overflow-y-auto custom-scrollbar">
    <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-4">Past Sessions</h3>
    {history.length === 0 ? (
      <div className="text-center py-12 px-4 border-2 border-dashed border-slate-100 rounded-2xl">
        <p className="text-slate-400 text-sm">No history yet. Start a lesson!</p>
      </div>
    ) : (
      <div className="space-y-4">
        {history.map((item) => (
          <button
            key={item.id}
            onClick={() => onSelect(item)}
            className="w-full text-left p-4 rounded-2xl hover:bg-slate-50 transition-all border border-transparent hover:border-slate-200 group"
          >
            <div className="flex items-center justify-between mb-2">
              <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                item.prompt.difficulty === 'Beginner' ? 'bg-green-100 text-green-600' :
                item.prompt.difficulty === 'Intermediate' ? 'bg-orange-100 text-orange-600' :
                'bg-red-100 text-red-600'
              }`}>
                {item.prompt.difficulty}
              </span>
              <span className="text-[10px] text-slate-400">{new Date(item.timestamp).toLocaleDateString()}</span>
            </div>
            <p className="text-sm font-medium text-slate-700 line-clamp-1 group-hover:text-indigo-600 transition-colors">
              {item.prompt.topic}
            </p>
            <div className="mt-2 h-1 w-full bg-slate-100 rounded-full overflow-hidden">
              <div className="h-full bg-indigo-500" style={{ width: `${item.feedback.score}%` }}></div>
            </div>
          </button>
        ))}
      </div>
    )}
  </aside>
);

const App: React.FC = () => {
  const [difficulty, setDifficulty] = useState<Difficulty>('Intermediate');
  const [topic, setTopic] = useState('Business Analysis');
  const [mediaType, setMediaType] = useState<MediaType>('image');
  const [isLoading, setIsLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [currentPrompt, setCurrentPrompt] = useState<LessonPrompt | null>(null);
  const [userText, setUserText] = useState('');
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [hasApiKey, setHasApiKey] = useState(true);

  const videoRef = useRef<HTMLVideoElement>(null);
  const recognitionRef = useRef<any>(null);
  const audioContextRef = useRef<AudioContext | null>(null);

  const wordCount = userText.trim() === '' ? 0 : userText.trim().split(/\s+/).length;
  const wordLimit = 500;
  const progressPercent = Math.min((wordCount / wordLimit) * 100, 100);

  useEffect(() => {
    const checkKey = async () => {
      if (window.aistudio) {
        const selected = await window.aistudio.hasSelectedApiKey();
        setHasApiKey(selected);
      }
    };
    checkKey();
  }, []);

  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-US';

      recognition.onresult = (event: any) => {
        let interimTranscript = '';
        let finalTranscript = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            finalTranscript += event.results[i][0].transcript;
          } else {
            interimTranscript += event.results[i][0].transcript;
          }
        }
        if (finalTranscript) {
          setUserText(prev => prev + (prev.length > 0 && !prev.endsWith(' ') ? ' ' : '') + finalTranscript);
        }
      };

      recognition.onerror = (event: any) => {
        console.error('Speech recognition error', event.error);
        setIsRecording(false);
      };

      recognition.onend = () => {
        setIsRecording(false);
      };

      recognitionRef.current = recognition;
    }
  }, []);

  const handleSelectKey = async () => {
    if (window.aistudio) {
      await window.aistudio.openSelectKey();
      setHasApiKey(true); // Assume success per instructions
    }
  };

  const toggleRecording = () => {
    if (!recognitionRef.current) {
      alert("Speech recognition is not supported in your browser.");
      return;
    }

    if (isRecording) {
      recognitionRef.current.stop();
    } else {
      setIsRecording(true);
      recognitionRef.current.start();
    }
  };

  const handleStartLesson = async () => {
    if (mediaType === 'video' && !hasApiKey) {
      handleSelectKey();
      return;
    }

    setIsLoading(true);
    setFeedback(null);
    setUserText('');
    setStatusMessage(mediaType === 'image' ? 'Crafting a vivid professional scenario...' : 'Generating educational video...');
    
    try {
      const { url, promptText } = await generateLessonPrompt(topic, difficulty, mediaType);
      const newPrompt: LessonPrompt = {
        id: Math.random().toString(36).substr(2, 9),
        type: mediaType,
        url,
        description: promptText,
        topic,
        difficulty
      };
      setCurrentPrompt(newPrompt);
    } catch (error: any) {
      console.error(error);
      if (error?.message?.includes("Requested entity was not found")) {
        setHasApiKey(false);
        alert("Please re-select your API key to continue.");
      } else {
        alert('Failed to generate lesson. Please check your API key permissions.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmitDescription = async () => {
    if (!userText.trim() || !currentPrompt) return;
    if (isRecording && recognitionRef.current) recognitionRef.current.stop();

    setIsLoading(true);
    setStatusMessage(`Analyzing your ${difficulty} English...`);
    
    try {
      const result = await evaluateDescription(userText, currentPrompt.description, difficulty);
      setFeedback(result);
      
      const newItem: HistoryItem = {
        id: Math.random().toString(36).substr(2, 9),
        prompt: currentPrompt,
        userDescription: userText,
        feedback: result,
        timestamp: Date.now()
      };
      setHistory(prev => [newItem, ...prev]);
    } catch (error) {
      console.error(error);
      alert('Evaluation failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handlePlayAudio = async (text: string) => {
    if (isPlayingAudio) return;
    setIsPlayingAudio(true);
    try {
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      }
      const ctx = audioContextRef.current;
      const base64Audio = await generateSpeech(text);
      const bytes = decodeBase64(base64Audio);
      const audioBuffer = await decodeAudioData(bytes, ctx, 24000, 1);
      
      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(ctx.destination);
      source.onended = () => setIsPlayingAudio(false);
      source.start();
    } catch (error) {
      console.error('Audio playback failed', error);
      setIsPlayingAudio(false);
    }
  };

  const handleSelectHistoryItem = (item: HistoryItem) => {
    setCurrentPrompt(item.prompt);
    setUserText(item.userDescription);
    setFeedback(item.feedback);
  };

  const topics = [
    { id: 'Business Analysis', icon: 'fa-chart-line' },
    { id: 'Daily Life', icon: 'fa-house' },
    { id: 'Nature', icon: 'fa-leaf' },
    { id: 'Cyberpunk City', icon: 'fa-city' },
    { id: 'Space Exploration', icon: 'fa-rocket' },
    { id: 'Cooking', icon: 'fa-utensils' }
  ];

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      
      <main className="flex-1 lg:pr-80 max-w-6xl mx-auto w-full p-6 pb-24">
        
        {!currentPrompt && !isLoading ? (
          <div className="max-w-2xl mx-auto mt-12 space-y-12">
            {!hasApiKey && (
              <div className="p-6 bg-amber-50 border border-amber-200 rounded-2xl flex items-center justify-between">
                <div className="flex gap-4 items-center">
                  <i className="fas fa-key text-amber-500 text-xl"></i>
                  <div>
                    <h4 className="font-bold text-amber-800">Paid API Key Required</h4>
                    <p className="text-sm text-amber-700">Video generation (Veo) requires a selected API key from a paid project.</p>
                    <a href="https://ai.google.dev/gemini-api/docs/billing" target="_blank" className="text-xs text-indigo-600 underline">Learn about billing</a>
                  </div>
                </div>
                <button 
                  onClick={handleSelectKey}
                  className="px-4 py-2 bg-amber-500 text-white rounded-lg font-bold text-sm hover:bg-amber-600 transition-colors"
                >
                  Select Key
                </button>
              </div>
            )}

            <div className="text-center">
              <h2 className="text-4xl font-extrabold text-slate-800 mb-4">Master Professional English.</h2>
              <p className="text-lg text-slate-500">Practice with Business Analysis scenarios. Use RACI, BPMN, and Solution Evaluation terms.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <section className="space-y-4">
                <label className="text-sm font-bold text-slate-700 flex items-center gap-2">
                  <i className="fas fa-bullseye text-indigo-500"></i> Industry Topic
                </label>
                <div className="grid grid-cols-2 gap-3">
                  {topics.map(t => (
                    <button
                      key={t.id}
                      onClick={() => setTopic(t.id)}
                      className={`flex flex-col items-center gap-2 p-4 rounded-2xl border-2 transition-all ${
                        topic === t.id ? 'bg-indigo-50 border-indigo-500 text-indigo-700 shadow-md' : 'bg-white border-slate-100 hover:border-slate-200'
                      }`}
                    >
                      <i className={`fas ${t.icon} text-lg`}></i>
                      <span className="text-sm font-medium">{t.id}</span>
                    </button>
                  ))}
                </div>
              </section>

              <div className="space-y-8">
                <section className="space-y-4">
                  <label className="text-sm font-bold text-slate-700 flex items-center gap-2">
                    <i className="fas fa-signal text-indigo-500"></i> CEFR Level
                  </label>
                  <div className="flex gap-2">
                    {(['Beginner', 'Intermediate', 'Advanced'] as Difficulty[]).map(d => (
                      <button
                        key={d}
                        onClick={() => setDifficulty(d)}
                        className={`flex-1 py-3 px-4 rounded-xl text-sm font-bold border-2 transition-all relative ${
                          difficulty === d ? 'bg-slate-800 border-slate-800 text-white' : 'bg-white border-slate-100 hover:border-slate-200 text-slate-600'
                        }`}
                      >
                        {d}
                        {d === 'Intermediate' && (
                          <span className="absolute -top-2 -right-2 bg-indigo-500 text-[8px] text-white px-1 rounded uppercase">B1 Mastery</span>
                        )}
                      </button>
                    ))}
                  </div>
                </section>

                <section className="space-y-4">
                  <label className="text-sm font-bold text-slate-700 flex items-center gap-2">
                    <i className="fas fa-clapperboard text-indigo-500"></i> Media Style
                  </label>
                  <div className="flex bg-slate-100 p-1 rounded-xl">
                    <button
                      onClick={() => setMediaType('image')}
                      className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-bold transition-all ${
                        mediaType === 'image' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-500'
                      }`}
                    >
                      <i className="fas fa-image"></i> Static
                    </button>
                    <button
                      onClick={() => setMediaType('video')}
                      className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-bold transition-all ${
                        mediaType === 'video' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-500'
                      }`}
                    >
                      <i className="fas fa-film"></i> Video (Veo)
                    </button>
                  </div>
                </section>
              </div>
            </div>

            <button
              onClick={handleStartLesson}
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-5 rounded-2xl font-bold text-xl shadow-xl shadow-indigo-100 transition-all flex items-center justify-center gap-3 transform hover:-translate-y-1 active:translate-y-0"
            >
              Start Practice Session <i className="fas fa-arrow-right"></i>
            </button>
          </div>
        ) : null}

        {isLoading && (
          <div className="flex flex-col items-center justify-center py-20 animate-pulse-soft">
            <div className="relative w-24 h-24 mb-6">
               <div className="absolute inset-0 border-4 border-indigo-100 rounded-full"></div>
               <div className="absolute inset-0 border-4 border-indigo-600 rounded-full border-t-transparent animate-spin"></div>
               <div className="absolute inset-0 flex items-center justify-center">
                 <i className="fas fa-brain text-3xl text-indigo-600"></i>
               </div>
            </div>
            <p className="text-xl font-medium text-slate-600">{statusMessage}</p>
            <p className="text-sm text-slate-400 mt-2">Gemini AI is processing your request...</p>
          </div>
        )}

        {currentPrompt && !isLoading && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mt-4">
            <div className="space-y-6">
              <div className="glass rounded-3xl overflow-hidden shadow-2xl shadow-indigo-100/50 border border-white/50">
                <div className="aspect-video bg-slate-200 relative">
                  {currentPrompt.type === 'image' ? (
                    <img src={currentPrompt.url} alt="English prompt" className="w-full h-full object-cover" />
                  ) : (
                    <video 
                      ref={videoRef}
                      src={currentPrompt.url} 
                      className="w-full h-full object-cover" 
                      controls 
                      autoPlay 
                      loop 
                    />
                  )}
                  <div className="absolute top-4 left-4 bg-black/40 backdrop-blur-md px-4 py-1.5 rounded-full text-white text-xs font-bold flex items-center gap-2">
                    <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></span>
                    Interactive Scene
                  </div>
                </div>
                <div className="p-6 bg-white">
                   <div className="flex items-center gap-3 mb-4">
                     <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Challenge</span>
                     <div className="flex-1 h-px bg-slate-100"></div>
                   </div>
                   <p className="text-slate-700 font-medium leading-relaxed">
                     Describe this scene vividly. {topic === 'Business Analysis' && "Use professional BA terms like 'Stakeholders', 'BPMN', 'Traceability', or 'ROI'."}
                     <span className="text-indigo-600 block mt-2 font-bold">Target: 50-500 words.</span>
                   </p>
                   {topic === 'Business Analysis' && (
                     <div className="mt-4 flex flex-wrap gap-2">
                        <span className="text-[10px] bg-indigo-50 text-indigo-600 px-2 py-1 rounded font-bold">RACI Matrix</span>
                        <span className="text-[10px] bg-indigo-50 text-indigo-600 px-2 py-1 rounded font-bold">Requirement Elicitation</span>
                        <span className="text-[10px] bg-indigo-50 text-indigo-600 px-2 py-1 rounded font-bold">Traceability</span>
                        <span className="text-[10px] bg-indigo-50 text-indigo-600 px-2 py-1 rounded font-bold">Gap Analysis</span>
                     </div>
                   )}
                </div>
              </div>

              <div className="flex gap-3">
                <button 
                  onClick={() => { setCurrentPrompt(null); setFeedback(null); setUserText(''); }}
                  className="px-6 py-3 rounded-xl border border-slate-200 text-slate-600 font-bold hover:bg-slate-50 transition-colors"
                >
                  <i className="fas fa-redo-alt mr-2"></i> New Scene
                </button>
              </div>
            </div>

            <div className="space-y-6">
              {!feedback ? (
                <div className="flex flex-col h-full">
                  <div className="flex-1 glass rounded-3xl p-8 flex flex-col shadow-xl shadow-slate-100 relative min-h-[400px]">
                    <div className="flex items-center justify-between mb-4">
                      <label className="text-sm font-bold text-slate-800 block uppercase tracking-wide">Professional Description</label>
                      <div className="flex items-center gap-2">
                        {isRecording && (
                          <span className="text-[10px] font-bold text-red-500 uppercase animate-pulse flex items-center gap-1">
                            <i className="fas fa-circle text-[8px]"></i> Mic Active
                          </span>
                        )}
                        <button
                          onClick={toggleRecording}
                          className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${
                            isRecording 
                            ? 'bg-red-500 text-white shadow-lg shadow-red-200 animate-pulse' 
                            : 'bg-indigo-50 text-indigo-600 hover:bg-indigo-100'
                          }`}
                          title={isRecording ? "Stop Voice Input" : "Start Voice Input"}
                        >
                          <i className={`fas ${isRecording ? 'fa-microphone-slash' : 'fa-microphone'}`}></i>
                        </button>
                      </div>
                    </div>
                    
                    <textarea
                      value={userText}
                      onChange={(e) => setUserText(e.target.value)}
                      placeholder={isRecording ? "Listening..." : "Describe the Business Analyst's activities using connectors like 'consequently' or 'nevertheless'..."}
                      className="flex-1 w-full bg-transparent resize-none focus:outline-none text-lg text-slate-700 leading-relaxed placeholder:text-slate-300"
                    />
                    
                    <div className="mt-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className={`text-xs font-bold transition-colors ${wordCount < 50 ? 'text-slate-400' : wordCount < 300 ? 'text-indigo-500' : 'text-emerald-500'}`}>
                          {wordCount} / {wordLimit} words
                        </span>
                        <span className="text-[10px] text-slate-400 uppercase tracking-widest font-bold">Aim for B1/B2 depth</span>
                      </div>
                      <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                        <div 
                          className={`h-full transition-all duration-500 ${wordCount < 50 ? 'bg-slate-300' : wordCount < 300 ? 'bg-indigo-400' : 'bg-emerald-500'}`} 
                          style={{ width: `${progressPercent}%` }}
                        ></div>
                      </div>
                      
                      <div className="flex items-center justify-end pt-2">
                        <button
                          onClick={handleSubmitDescription}
                          disabled={!userText.trim() || isLoading}
                          className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white px-8 py-3 rounded-xl font-bold transition-all flex items-center gap-2 shadow-lg shadow-indigo-100"
                        >
                          Evaluate <i className="fas fa-paper-plane"></i>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-6 overflow-y-auto max-h-[calc(100vh-180px)] pr-2 custom-scrollbar">
                  <div className="glass rounded-3xl p-8 shadow-xl shadow-indigo-50 border-indigo-50 border-2">
                    <div className="flex items-center justify-between mb-8">
                      <div>
                        <h3 className="text-2xl font-bold text-slate-800">Session Review</h3>
                        <p className="text-slate-500 text-sm">Language Proficiency Score</p>
                      </div>
                      <div className="relative w-24 h-24 flex items-center justify-center">
                        <svg className="w-full h-full -rotate-90">
                          <circle cx="48" cy="48" r="42" fill="none" stroke="#f1f5f9" strokeWidth="8" />
                          <circle 
                            cx="48" cy="48" r="42" fill="none" stroke="#4f46e5" strokeWidth="8" 
                            strokeDasharray={263.8} 
                            strokeDashoffset={263.8 - (263.8 * feedback.score) / 100}
                            strokeLinecap="round"
                            className="transition-all duration-1000 ease-out"
                          />
                        </svg>
                        <span className="absolute text-2xl font-black text-indigo-600">{feedback.score}</span>
                      </div>
                    </div>

                    <div className="mb-8 p-6 bg-indigo-50 border border-indigo-100 rounded-2xl relative shadow-sm">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[10px] font-bold text-indigo-500 uppercase tracking-widest flex items-center gap-1">
                          <i className="fas fa-magic"></i> Professional Model Sample
                        </span>
                        <button 
                          onClick={() => handlePlayAudio(feedback.modelSampleDescription)}
                          disabled={isPlayingAudio}
                          className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${isPlayingAudio ? 'bg-indigo-200 text-indigo-400' : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-md shadow-indigo-200'}`}
                        >
                          <i className={`fas ${isPlayingAudio ? 'fa-spinner fa-spin' : 'fa-volume-up'}`}></i>
                        </button>
                      </div>
                      <p className="text-slate-700 leading-relaxed font-medium text-sm italic">
                        {feedback.modelSampleDescription}
                      </p>
                    </div>

                    <div className="bg-slate-50 p-6 rounded-2xl mb-8 border border-slate-100">
                       <p className="text-slate-700 italic leading-relaxed text-sm">
                         <i className="fas fa-quote-left text-indigo-300 mr-2"></i>
                         {feedback.overallComment}
                       </p>
                    </div>

                    <div className="space-y-6">
                      <div className="flex items-center gap-3">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Target Vocabulary</span>
                        <div className="flex-1 h-px bg-slate-100"></div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {feedback.vocabularySuggestions.map((word, i) => (
                          <span key={i} className="bg-white px-3 py-1.5 rounded-xl text-xs font-semibold text-indigo-600 border border-indigo-100 shadow-sm flex items-center gap-2 hover:border-indigo-300 transition-colors cursor-default">
                            <i className="fas fa-sparkles text-[10px]"></i> {word}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="glass rounded-3xl p-8 shadow-xl shadow-slate-100">
                    <h4 className="text-sm font-bold text-slate-800 mb-6 uppercase tracking-wide flex items-center gap-2">
                      <i className="fas fa-highlighter text-amber-500"></i> Structural Feedback
                    </h4>
                    {feedback.corrections.length > 0 ? (
                      <div className="space-y-4">
                        {feedback.corrections.map((c, i) => (
                          <div key={i} className="group border-l-4 border-amber-400 pl-6 py-2">
                            <div className="flex flex-col gap-1 mb-2">
                              <span className="text-xs text-slate-400 line-through font-medium">{c.original}</span>
                              <span className="text-sm text-emerald-600 font-bold flex items-center gap-2">
                                <i className="fas fa-check-circle"></i> {c.correction}
                              </span>
                            </div>
                            <p className="text-xs text-slate-500 bg-slate-50 p-3 rounded-lg border border-slate-100 group-hover:bg-amber-50 group-hover:border-amber-100 transition-all">
                              {c.explanation}
                            </p>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="py-8 text-center bg-emerald-50 rounded-2xl border border-emerald-100">
                        <i className="fas fa-award text-3xl text-emerald-500 mb-3"></i>
                        <p className="font-bold text-emerald-700">Flawless professional English!</p>
                      </div>
                    )}
                  </div>

                  <button 
                    onClick={() => setFeedback(null)}
                    className="w-full bg-slate-800 text-white py-4 rounded-2xl font-bold shadow-xl transition-all hover:bg-slate-900"
                  >
                    Next Challenge
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      <HistoryPanel history={history} onSelect={handleSelectHistoryItem} />
    </div>
  );
};

export default App;
