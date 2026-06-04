import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  X, Mic, MicOff, Volume2, VolumeX, Pause, Play, 
  RotateCcw, Sparkles, AlertCircle, Headphones, Sliders, Check
} from 'lucide-react';
import { VoiceConfig } from '../types';

interface VoiceAssistantProps {
  isOpen: boolean;
  onClose: () => void;
  voiceConfig: VoiceConfig;
  onUpdateVoiceConfig: (cfg: Partial<VoiceConfig>) => void;
  onSendTextMessage: (txt: string) => Promise<string>; // to send transcript to AI
}

export default function VoiceAssistant({
  isOpen,
  onClose,
  voiceConfig,
  onUpdateVoiceConfig,
  onSendTextMessage
}: VoiceAssistantProps) {
  const [isLiveConnected, setIsLiveConnected] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [transcription, setTranscription] = useState('');
  const [aiTranscriptHistory, setAiTranscriptHistory] = useState<string[]>([]);
  const [errMessage, setErrMessage] = useState<string | null>(null);

  const socketRef = useRef<WebSocket | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const micProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const activeAudioSourceRef = useRef<AudioBufferSourceNode | null>(null);

  // Fallback Audio speech synthesizers
  const speechUttRef = useRef<SpeechSynthesisUtterance | null>(null);

  useEffect(() => {
    // Cleanup everything on unmount
    return () => {
      disconnectLiveSession();
      stopPlayback();
    };
  }, []);

  const startPlayback = (audioBase64: string) => {
    try {
      stopPlayback();

      // Initialize browser context
      if (!audioCtxRef.current) {
        audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      }

      const ctx = audioCtxRef.current;
      const binary = atob(audioBase64);
      const len = binary.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binary.charCodeAt(i);
      }

      ctx.decodeAudioData(bytes.buffer, (buffer) => {
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.connect(ctx.destination);
        
        // Handle playback parameters
        source.playbackRate.value = voiceConfig.speed;
        
        source.onended = () => {
          setIsPlaying(false);
        };

        activeAudioSourceRef.current = source;
        source.start(0);
        setIsPlaying(true);
      }, (err) => {
        console.error("Audio decoding failed, triggering local speech synthesis fallback:", err);
        // If server TTS fail to decode, trigger elegant native TTS fallback
        triggerLocalTTSFallback();
      });
    } catch (e) {
      triggerLocalTTSFallback();
    }
  };

  const triggerLocalTTSFallback = () => {
    try {
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
        
        const lastTurn = aiTranscriptHistory[aiTranscriptHistory.length - 1] || "Connecting to voice waves...";
        const utterance = new SpeechSynthesisUtterance(lastTurn);
        
        // Map prebuilt to standard browser matching names
        utterance.rate = voiceConfig.speed;
        utterance.pitch = voiceConfig.pitch;
        
        utterance.onend = () => {
          setIsPlaying(false);
        };

        speechUttRef.current = utterance;
        window.speechSynthesis.speak(utterance);
        setIsPlaying(true);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const stopPlayback = () => {
    if (activeAudioSourceRef.current) {
      try {
        activeAudioSourceRef.current.stop();
      } catch (e) {}
      activeAudioSourceRef.current = null;
    }
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    setIsPlaying(false);
  };

  // Connect to backend WS for continuous low-latency Live audio loop
  const connectLiveSession = async () => {
    try {
      setErrMessage(null);
      stopPlayback();
      setTranscription('');

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/api/live`;
      
      const ws = new WebSocket(wsUrl);
      socketRef.current = ws;

      ws.onopen = async () => {
        setIsLiveConnected(true);
        setIsRecording(true);
        await startMicCapturing();
      };

      ws.onmessage = async (event) => {
        const payload = JSON.parse(event.data);
        
        // AI transcript returned
        if (payload.text) {
          setAiTranscriptHistory(prev => {
            const copy = [...prev];
            if (copy[copy.length - 1] === 'Thinking...') {
              copy[copy.length - 1] = payload.text;
            } else {
              copy.push(payload.text);
            }
            return copy;
          });
        }

        // Live binary speech synth PCM code
        if (payload.audio) {
          startPlayback(payload.audio);
        }

        if (payload.interrupted) {
          stopPlayback();
        }

        if (payload.error) {
          setErrMessage(payload.error);
        }
      };

      ws.onerror = (e) => {
        console.error(e);
        // WebSockets can be blocked in Sandboxed iframes. Provide graceful fallback guidance!
        setErrMessage("Interactive Websocket connection suspended. Switching to ultra-stable Speech-To-Speech fallback mode!");
        setIsLiveConnected(false);
        setIsRecording(false);
      };

      ws.onclose = () => {
        setIsLiveConnected(false);
        setIsRecording(false);
      };

    } catch (err: any) {
      setErrMessage(err.message || "Failed to launch voice bridge.");
    }
  };

  const disconnectLiveSession = () => {
    // 1. Close WebSockets
    if (socketRef.current) {
      socketRef.current.close();
      socketRef.current = null;
    }
    // 2. Shut off microphone streaming
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach(track => track.stop());
      micStreamRef.current = null;
    }
    if (micProcessorRef.current) {
      micProcessorRef.current.disconnect();
      micProcessorRef.current = null;
    }
    setIsLiveConnected(false);
    setIsRecording(false);
  };

  // Convert raw Float32 array sound buffer into base64 PCM 16kHz
  const startMicCapturing = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micStreamRef.current = stream;

      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      const source = audioContext.createMediaStreamSource(stream);
      const processor = audioContext.createScriptProcessor(2048, 1, 1);
      
      processor.onaudioprocess = (e) => {
        if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) return;

        const inputData = e.inputBuffer.getChannelData(0);
        // Decimate / convert Float32 to Int16 PCM array
        const pcmBuffer = new Int16Array(inputData.length);
        for (let i = 0; i < inputData.length; i++) {
          const s = Math.max(-1, Math.min(1, inputData[i]));
          pcmBuffer[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
        }

        // Encode as standard base64 chunk
        const binaryString = String.fromCharCode(...new Uint8Array(pcmBuffer.buffer));
        const base64Audio = btoa(binaryString);

        // Emit to WS gateway
        socketRef.current.send(JSON.stringify({ audio: base64Audio }));
      };

      source.connect(processor);
      processor.connect(audioContext.destination);
      micProcessorRef.current = processor;

    } catch (err: any) {
      setErrMessage("Microphone permission denied or blocked by iframe context.");
      setIsRecording(false);
    }
  };

  // Robust fallback voice pipeline when Websockets cannot run natively in sandbox
  const triggerStableSpeechTurn = async () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setErrMessage("No Speech recognition API present. Type or retry in a different browser.");
      return;
    }

    setTranscription("Listening carefully...");
    setIsRecording(true);
    stopPlayback();

    const rec = new SpeechRecognition();
    rec.continuous = false;
    rec.lang = 'en-US';

    rec.onresult = async (ev: any) => {
      const userText = ev.results[0][0].transcript;
      setTranscription(`You said: "${userText}"`);
      setIsRecording(false);

      // AI Response queue
      setAiTranscriptHistory(prev => [...prev, `Prompt: "${userText}"`, "Thinking..."]);

      try {
        // Send to chat system
        const answer = await onSendTextMessage(userText);
        setAiTranscriptHistory(prev => {
          const copy = [...prev];
          if (copy[copy.length - 1] === "Thinking...") {
            copy[copy.length - 1] = answer;
          }
          return copy;
        });

        // Query server synthesize speech
        const synthRes = await fetch('/api/gemini/tts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: answer,
            voiceName: voiceConfig.voiceName
          })
        });

        const data = await synthRes.json();
        if (data.audio) {
          startPlayback(data.audio);
        } else {
          // Trigger browser speak fallback
          triggerLocalTTSFallback();
        }
      } catch (err: any) {
        setErrMessage("TTS compilation failed, using native web engine.");
        triggerLocalTTSFallback();
      }
    };

    rec.onerror = (e: any) => {
      setTranscription("");
      setIsRecording(false);
      setErrMessage("Listening aborted. Check permissions of microphone.");
    };

    rec.start();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-xl flex flex-col items-center justify-between p-6 z-50 text-neutral-100">
          
          {/* Top Bar Navigation */}
          <div className="w-full max-w-xl flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Headphones className="w-5 h-5 text-indigo-400" />
              <div>
                <h3 className="font-semibold text-sm tracking-tight text-white">AEZ Ai Voice Engine</h3>
                <span className="text-[9px] text-neutral-500 font-mono">
                  {isLiveConnected ? "LIVE WEBSOCKET MODE" : "STABLE TRANSCRIBE MODE"}
                </span>
              </div>
            </div>
            
            <button
              onClick={() => {
                disconnectLiveSession();
                stopPlayback();
                onClose();
              }}
              className="p-1 px-3 bg-neutral-900 border border-neutral-850 hover:bg-neutral-800 transition-colors text-xs text-neutral-400 hover:text-white rounded-xl cursor-pointer"
            >
              Exit Engine
            </button>
          </div>

          {/* Central Interactive Sound Wave visualizer */}
          <div className="flex flex-col items-center max-w-lg text-center space-y-8">
            <div className="relative h-44 flex items-center justify-center gap-2 w-full">
              {/* Ripple Ring Wave animations */}
              <AnimatePresence>
                {(isRecording || isPlaying) && (
                  <>
                    <motion.div 
                      key="pulse-1"
                      initial={{ scale: 0.8, opacity: 0.8 }}
                      animate={{ scale: 1.5, opacity: 0 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 2, repeat: Infinity, ease: 'easeOut' }}
                      className="absolute w-32 h-32 rounded-full border border-indigo-500/20"
                    />
                    <motion.div 
                      key="pulse-2"
                      initial={{ scale: 0.6, opacity: 0.6 }}
                      animate={{ scale: 1.3, opacity: 0 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 2, repeat: Infinity, delay: 1, ease: 'easeOut' }}
                      className="absolute w-32 h-32 rounded-full border border-purple-500/20"
                    />
                  </>
                )}
              </AnimatePresence>

              {/* Core interactive speaker icon */}
              <motion.button
                onClick={isLiveConnected ? disconnectLiveSession : (isRecording ? stopPlayback : triggerStableSpeechTurn)}
                whileHover={{ scale: 1.05 }}
                className={`w-24 h-24 rounded-full flex items-center justify-center border text-white transition-all shadow-xl shadow-indigo-600/10 cursor-pointer ${
                  isRecording 
                    ? 'bg-red-650/20 border-red-500/50 text-red-400 animate-pulse'
                    : isPlaying
                      ? 'bg-green-650/20 border-green-500/40 text-green-400'
                      : 'bg-indigo-650 hover:bg-indigo-600 border-indigo-500/30'
                }`}
              >
                {isRecording ? <MicOff size={32} /> : isPlaying ? <Play size={32} /> : <Mic size={32} />}
              </motion.button>
            </div>

            <div className="space-y-2">
              <h2 className="text-lg font-medium text-white tracking-tight">
                {isRecording ? "Listening carefully..." : isPlaying ? "AEZ Ai is speaking" : "Microphone offline"}
              </h2>
              <p className="text-xs text-neutral-400 leading-relaxed max-w-sm px-4">
                {transcription || "Click the central indicator node to synthesize speech and begin talking continuously."}
              </p>
            </div>
          </div>

          {/* Transcript History bubble scroll */}
          <div className="w-full max-w-lg h-32 overflow-y-auto p-4 bg-neutral-900/40 border border-neutral-850/60 rounded-2xl flex flex-col justify-end space-y-2">
            {aiTranscriptHistory.length === 0 ? (
              <span className="text-[10px] text-neutral-500 text-center block py-8 italic">
                Acoustic text buffers are empty...
              </span>
            ) : (
              aiTranscriptHistory.map((h, idx) => (
                <div key={idx} className="text-xs leading-relaxed text-neutral-300">
                  <span className={`font-semibold mr-1.5 ${h.startsWith('Prompt:') ? 'text-indigo-400' : 'text-purple-400'}`}>
                    {h.startsWith('Prompt:') ? 'You:' : 'AI:'}
                  </span>
                  <span>{h.replace(/^Prompt:\s/, '')}</span>
                </div>
              ))
            )}
          </div>

          {/* Quick Info Alerts & Audio Settings panel */}
          <div className="w-full max-w-lg space-y-3 pb-4">
            {errMessage && (
              <div className="p-3 bg-neutral-900 border border-neutral-850/80 hover:border-neutral-800 rounded-xl flex gap-2 items-start transition-all">
                <AlertCircle size={15} className="shrink-0 mt-0.5 text-yellow-500" />
                <div className="text-[10px] text-neutral-400 leading-normal">{errMessage}</div>
              </div>
            )}

            {/* Micro sliders panel */}
            <div className="p-4 bg-neutral-900 border border-neutral-850 rounded-2xl space-y-3">
              <div className="flex items-center justify-between border-b border-neutral-800/60 pb-1.5 mb-1.5">
                <span className="text-[10px] uppercase font-mono tracking-wider font-semibold text-neutral-400 flex items-center gap-1">
                  <Sliders size={11} className="text-indigo-400" /> Voice Synthesis configurations
                </span>
                
                {/* Switch Modes button */}
                <button
                  onClick={isLiveConnected ? disconnectLiveSession : connectLiveSession}
                  className="text-[9px] px-2 py-0.5 bg-neutral-800 text-neutral-300 hover:text-white rounded border border-neutral-700 font-mono"
                >
                  {isLiveConnected ? "SWITCH TO OFFLINE MODE" : "LAUNCH WEBSOCKET BRIDGE"}
                </button>
              </div>

              <div className="grid grid-cols-2 gap-4">
                {/* Pitch control */}
                <div className="space-y-1">
                  <div className="flex justify-between text-[10px] text-neutral-400 font-mono">
                    <span>Acoustic Pitch</span>
                    <span>{voiceConfig.pitch.toFixed(1)}x</span>
                  </div>
                  <input
                    type="range"
                    min="0.5"
                    max="2.0"
                    step="0.1"
                    value={voiceConfig.pitch}
                    onChange={(e) => onUpdateVoiceConfig({ pitch: parseFloat(e.target.value) })}
                    className="w-full h-1 bg-neutral-850 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                  />
                </div>

                {/* Speed control */}
                <div className="space-y-1">
                  <div className="flex justify-between text-[10px] text-neutral-400 font-mono">
                    <span>Acoustic Speed</span>
                    <span>{voiceConfig.speed.toFixed(1)}x</span>
                  </div>
                  <input
                    type="range"
                    min="0.5"
                    max="2.0"
                    step="0.1"
                    value={voiceConfig.speed}
                    onChange={(e) => onUpdateVoiceConfig({ speed: parseFloat(e.target.value) })}
                    className="w-full h-1 bg-neutral-850 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                  />
                </div>
              </div>
            </div>
          </div>

        </div>
      )}
    </AnimatePresence>
  );
}
