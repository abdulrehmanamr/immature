import React, { useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Send, Mic, Paperclip, X, Eye, Square, BrainCircuit,
  Search, CircleDot, Info
} from 'lucide-react';
import { MessageAttachment } from '../types';

interface InputAreaProps {
  onSendMessage: (text: string, attachments: MessageAttachment[]) => void;
  isStreaming: boolean;
  onStopStreaming?: () => void;
  searchEnabled: boolean;
  onToggleSearch: () => void;
  onOpenVoiceAssistant: () => void;
  isGuest?: boolean;
  trialCount?: number;
  maxTrials?: number;
}

export default function InputArea({
  onSendMessage,
  isStreaming,
  onStopStreaming,
  searchEnabled,
  onToggleSearch,
  onOpenVoiceAssistant,
  isGuest = false,
  trialCount = 0,
  maxTrials = 10
}: InputAreaProps) {
  const [inputText, setInputText] = useState('');
  const [attachments, setAttachments] = useState<MessageAttachment[]>([]);
  const [isListening, setIsListening] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const limitReached = isGuest && trialCount >= maxTrials;

  // File Upload drag handler
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    processFiles(Array.from(e.target.files));
  };

  const processFiles = (filesList: File[]) => {
    filesList.forEach(file => {
      // Validate file size limit to prevent overflowing payload (max 10MB)
      if (file.size > 10 * 1024 * 1024) {
        alert(`File ${file.name} is too large. Max size is 10MB.`);
        return;
      }

      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        const newAttachment: MessageAttachment = {
          name: file.name,
          type: file.type || 'application/octet-stream',
          size: file.size,
          dataUrl: result, // Full data base64 URL with prefix
          base64: result.split(',')[1] || result // Pure base64 data stream
        };

        setAttachments(prev => [...prev, newAttachment]);
      };
      reader.readAsDataURL(file);
    });
  };

  const handleRemoveAttachment = (idx: number) => {
    setAttachments(prev => prev.filter((_, i) => i !== idx));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() && attachments.length === 0) return;
    
    onSendMessage(inputText, attachments);
    setInputText('');
    setAttachments([]);
  };

  // HTML5 Web Speech Recognition Speech-To-Text API
  const handleToggleListening = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("Your browser does not natively support HTML5 Speeches Recognition. Consider using Chrome or Safari.");
      return;
    }

    if (isListening) {
      setIsListening(false);
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.lang = 'en-US';
    recognition.interimResults = false;

    recognition.onstart = () => {
      setIsListening(true);
    };

    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      setInputText(prev => prev ? `${prev} ${transcript}` : transcript);
    };

    recognition.onerror = () => {
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognition.start();
  };

  return (
    <div className="bg-transparent border-t border-[#262626] p-4 absolute bottom-0 left-0 right-0 max-w-3xl mx-auto w-full z-10 backdrop-blur-md bg-opacity-95">
      <form onSubmit={handleSubmit} className="space-y-3">
        
        {/* Guest Trial Info Bar */}
        {isGuest && (
          <div className="flex items-center justify-between text-[10px] px-2 text-neutral-400 font-sans border-b border-[#262626]/20 pb-1.5">
            <div className="flex items-center gap-1.5">
              <span className={`w-1.5 h-1.5 rounded-full ${trialCount >= maxTrials ? 'bg-red-500 animate-pulse' : 'bg-[#8B5CF6]'}`} />
              <span>Guest Trial Active: <strong className="text-white">{trialCount}</strong> / {maxTrials} inquiries used</span>
            </div>
            {trialCount >= maxTrials ? (
              <span className="text-red-400 font-semibold uppercase tracking-wider animate-pulse">Trial Ended • Register to Continue</span>
            ) : (
              <span className="text-[9px] text-neutral-500 font-mono">{(maxTrials - trialCount).toString().padStart(2, '0')} REMAINING</span>
            )}
          </div>
        )}

        {/* Render Attachments Queue */}
        <AnimatePresence>
          {attachments.length > 0 && (
            <motion.div 
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="flex flex-wrap gap-2 pb-2 overflow-hidden"
            >
              {attachments.map((attach, idx) => {
                const isImg = attach.type.startsWith('image/');
                return (
                  <div key={idx} className="relative flex items-center gap-2 p-1.5 bg-neutral-900 border border-neutral-800 rounded-xl pr-8 max-w-[180px]">
                    {isImg && attach.dataUrl ? (
                      <img src={attach.dataUrl} alt="Visual Thumbnail" className="w-8 h-8 rounded object-cover shadow" />
                    ) : (
                      <div className="w-8 h-8 rounded bg-[#8B5CF6]/10 border border-[#8B5CF6]/20 flex items-center justify-center text-[#8B5CF6] font-bold text-xs uppercase font-mono">
                        {attach.name.split('.').pop() || 'file'}
                      </div>
                    )}
                    <div className="min-w-0 pr-1">
                      <p className="text-[10px] text-white truncate font-medium">{attach.name}</p>
                      <p className="text-[8px] text-neutral-500 font-mono">{(attach.size / 1024).toFixed(1)} KB</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveAttachment(idx)}
                      className="absolute right-1 top-2.5 p-1 rounded-full bg-neutral-800 hover:bg-neutral-700 text-neutral-400 hover:text-white transition-colors cursor-pointer"
                    >
                      <X size={10} />
                    </button>
                  </div>
                );
              })}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Input Wrapper Card */}
        <div className="p-2.5 bg-[#111111]/85 backdrop-blur-xl border border-[#262626] focus-within:border-[#8B5CF6]/50 rounded-2xl shadow-2xl transition-all relative">
          
          <textarea
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSubmit(e);
              }
            }}
            placeholder={isGuest && trialCount >= maxTrials ? "Guest trial limit completed. Create a free AEZ Account in the sidebar to reset!" : "Propose a task or analyze files..."}
            disabled={isGuest && trialCount >= maxTrials}
            rows={2}
            className="w-full bg-transparent outline-none border-none text-neutral-100 placeholder-neutral-500 text-sm leading-relaxed resize-none pr-10 pl-2 focus:ring-0 disabled:opacity-45"
          />

          <div className="flex items-center justify-between pt-2.5 border-t border-[#262626] xs:flex-wrap">
            <div className="flex items-center gap-1.5">
              {/* Upload Paperclip Selector */}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={limitReached}
                title="Context File Uploader"
                className="p-2 rounded-xl bg-[#171717] hover:bg-[#1f1f1f] border border-[#262626] text-gray-400 hover:text-[#8B5CF6] transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Paperclip size={15} />
              </button>
              <input
                type="file"
                ref={fileInputRef}
                multiple
                accept=".pdf,image/*,text/*,.csv,.json"
                onChange={handleFileChange}
                disabled={limitReached}
                className="hidden"
              />

              {/* Toggle Gemini Search Grounding */}
              <button
                type="button"
                onClick={onToggleSearch}
                disabled={limitReached}
                title="Search Grounding"
                className={`py-1.5 px-3 rounded-xl transition-colors font-medium text-xs flex items-center gap-1.5 border cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                  searchEnabled 
                    ? 'bg-[#8B5CF6]/10 border-[#8B5CF6]/40 text-[#8B5CF6]' 
                    : 'bg-[#171717] hover:bg-[#1f1f1f] border-[#262626] text-gray-400'
                }`}
              >
                <Search size={12} />
                <span>Search</span>
              </button>

              {/* Live Audio Interface Option */}
              <button
                type="button"
                onClick={onOpenVoiceAssistant}
                disabled={limitReached}
                title="Open Voice Module"
                className="py-1.5 px-3 bg-[#171717] hover:bg-[#1f1f1f] border border-[#262626] rounded-xl text-gray-400 hover:text-white transition-colors text-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <BrainCircuit size={13} className="text-[#8B5CF6]" />
                <span>Live Voice</span>
              </button>
            </div>

            <div className="flex items-center gap-1.5">
              {/* STT speech recognition mic button */}
              <button
                type="button"
                onClick={handleToggleListening}
                disabled={limitReached}
                title="Speech to text dictation"
                className={`p-2 rounded-xl transition-colors shrink-0 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                  isListening 
                    ? 'bg-red-650/15 border border-red-500/30 text-red-400 animate-pulse' 
                    : 'bg-[#171717] hover:bg-[#1f1f1f] text-gray-400 hover:text-white'
                }`}
              >
                {isListening ? <CircleDot size={15} /> : <Mic size={15} />}
              </button>

              {/* Streaming Interruption tool */}
              {isStreaming && onStopStreaming ? (
                <button
                  type="button"
                  onClick={onStopStreaming}
                  className="p-2 rounded-xl bg-red-650/10 text-red-400 hover:bg-red-650/20 transition-colors flex items-center gap-1 cursor-pointer font-semibold text-xs border border-red-500/20"
                >
                  <Square size={13} fill="currentColor" />
                  Stop
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={limitReached || (!inputText.trim() && attachments.length === 0)}
                  className="p-2 rounded-xl bg-[#8B5CF6] hover:bg-[#7c3aed] text-white disabled:opacity-40 disabled:hover:bg-[#8B5CF6] transition-colors flex items-center justify-center shrink-0 cursor-pointer shadow-lg shadow-[#8B5CF6]/15 disabled:cursor-not-allowed"
                >
                  <Send size={14} />
                </button>
              )}
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}
