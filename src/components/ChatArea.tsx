import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Bot, Check, Clipboard, CornerDownLeft, Sparkles, 
  Search, ExternalLink, RefreshCw, Calendar, Eye, FileText
} from 'lucide-react';
import { Message, UserProfile } from '../types';

interface ChatAreaProps {
  messages: Message[];
  isStreaming: boolean;
  currentStreamText: string;
  activeConversationId: string | null;
  userProfile: UserProfile | null;
  onSelectSuggestion: (text: string) => void;
  metadataSources?: any; // Google Search grounding chunks
}

export default function ChatArea({
  messages,
  isStreaming,
  currentStreamText,
  activeConversationId,
  userProfile,
  onSelectSuggestion,
  metadataSources
}: ChatAreaProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    // Scroll to the bottom when messages or stream changes
    if (containerRef.current) {
      if (isStreaming) {
        // Fast instant scroll during live streaming so the text moves instantly following the blinking cursor
        containerRef.current.scrollTop = containerRef.current.scrollHeight;
      } else {
        // Smooth scroll for completed messages changes
        scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
      }
    }
  }, [messages, currentStreamText, isStreaming]);

  const handleCopyCode = (codeText: string, blockId: string) => {
    navigator.clipboard.writeText(codeText);
    setCopiedId(blockId);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Highly robust custom markdown & table renderer
  const renderFormattedContent = (content: string, msgId: string, showCursor = false) => {
    if (!content) return null;

    // First, split elements by triple-backtick code blocks
    const parts = content.split(/(```[\s\S]*?```)/g);

    return parts.map((part, index) => {
      // It is a code block
      if (part.startsWith('```') && part.endsWith('```')) {
        const fullBlock = part.slice(3, -3).trim();
        const lines = fullBlock.split('\n');
        let language = 'code';
        let codeBody = fullBlock;

        // Extract programming language if declared
        if (lines.length > 0 && lines[0].length < 15 && !lines[0].includes(' ') && lines[0].match(/^[a-zA-Z0-9#+-]+$/)) {
          language = lines[0].toLowerCase();
          codeBody = lines.slice(1).join('\n');
        }

        const blockId = `${msgId}-code-${index}`;
        const isCopied = copiedId === blockId;

        return (
          <div key={index} className="my-4 overflow-hidden rounded-xl border border-neutral-800 bg-neutral-950 text-neutral-200">
            {/* Window Header */}
            <div className="flex items-center justify-between px-4 py-2 bg-neutral-900 border-b border-neutral-850">
              <span className="text-[10px] font-mono font-semibold tracking-wider text-neutral-400 uppercase">
                {language}
              </span>
              <button
                onClick={() => handleCopyCode(codeBody, blockId)}
                className="flex items-center gap-1.5 px-2 py-1 rounded bg-neutral-850 hover:bg-neutral-800 text-[10px] text-neutral-300 hover:text-white transition-colors cursor-pointer"
              >
                {isCopied ? <Check size={11} className="text-green-400" /> : <Clipboard size={11} />}
                <span>{isCopied ? "Copied!" : "Copy code"}</span>
              </button>
            </div>
            {/* Code Output */}
            <pre className="p-4 overflow-x-auto font-mono text-xs leading-relaxed text-neutral-100 selection:bg-indigo-600/30">
              <code>{codeBody}</code>
            </pre>
          </div>
        );
      }

      // Check if this part contains Markdown table elements
      if (part.includes('|') && part.split('\n').some(line => line.trim().startsWith('|') && line.includes('-'))) {
        const lines = part.split('\n');
        const rows: string[][] = [];
        let isInsideTable = false;

        const tableElements: React.ReactNode[] = [];

        lines.forEach((line, lIdx) => {
          const trimmed = line.trim();
          if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
            isInsideTable = true;
            // Clean padding and split columns
            const cols = trimmed.split('|').map(v => v.trim()).filter((_, i, arr) => i !== 0 && i !== arr.length - 1);
            rows.push(cols);
          } else {
            if (isInsideTable) {
              // Flush table
              tableElements.push(renderTableHTML(rows, `${msgId}-table-${lIdx}`));
              rows.length = 0;
              isInsideTable = false;
            }
            // Normal paragraph text
            if (trimmed) {
              tableElements.push(<p key={lIdx} className="mb-3 leading-relaxed text-neutral-200 last:mb-0 text-sm whitespace-pre-wrap">{parseInlineMarkdown(trimmed)}</p>);
            }
          }
        });

        if (isInsideTable && rows.length > 0) {
          tableElements.push(renderTableHTML(rows, `${msgId}-table-final`));
        }

        return <div key={index} className="space-y-3">{tableElements}</div>;
      }

      // Normal text paragraphs with list items, headers
      const lines = part.split('\n');
      const isLastPart = index === parts.length - 1;

      return (
        <div key={index} className="space-y-2">
          {lines.map((line, lIdx) => {
            const trimmed = line.trim();
            const isLastLine = isLastPart && lIdx === lines.length - 1;

            if (!trimmed) return <div key={lIdx} className="h-2"></div>;

            // Headers formatting
            if (trimmed.startsWith('# ')) {
              return <h1 key={lIdx} className="text-xl font-semibold text-white tracking-tight pt-3 pb-1 border-b border-neutral-800">{parseInlineMarkdown(trimmed.slice(2))}</h1>;
            }
            if (trimmed.startsWith('## ')) {
              return <h2 key={lIdx} className="text-lg font-semibold text-white tracking-tight pt-2 pb-1">{parseInlineMarkdown(trimmed.slice(3))}</h2>;
            }
            if (trimmed.startsWith('### ')) {
              return <h3 key={lIdx} className="text-sm font-semibold text-white tracking-tight pt-1">{parseInlineMarkdown(trimmed.slice(4))}</h3>;
            }

            // Bullet list item
            if (trimmed.startsWith('* ') || trimmed.startsWith('- ')) {
              return (
                <ul key={lIdx} className="list-disc list-inside pl-3 space-y-1 my-1">
                  <li className="text-sm leading-relaxed text-neutral-200">
                    {parseInlineMarkdown(trimmed.slice(2))}
                    {isLastLine && showCursor && (
                      <span className="inline-block w-1.5 h-3.5 bg-[#8B5CF6] ml-1 animate-pulse align-middle" />
                    )}
                  </li>
                </ul>
              );
            }

            // Numbered list item
            if (trimmed.match(/^\d+\.\s/)) {
              const contentOnly = trimmed.replace(/^\d+\.\s/, '');
              return (
                <ol key={lIdx} className="list-decimal list-inside pl-3 space-y-1 my-1">
                  <li className="text-sm leading-relaxed text-neutral-200">
                    {parseInlineMarkdown(contentOnly)}
                    {isLastLine && showCursor && (
                      <span className="inline-block w-1.5 h-3.5 bg-[#8B5CF6] ml-1 animate-pulse align-middle" />
                    )}
                  </li>
                </ol>
              );
            }

            // Inline normal paragraph code
            return (
              <p key={lIdx} className="leading-relaxed text-neutral-200 last:mb-0 text-sm whitespace-pre-wrap">
                {parseInlineMarkdown(line)}
                {isLastLine && showCursor && (
                  <span className="inline-block w-1.5 h-3.5 bg-[#8B5CF6] ml-1 animate-pulse align-middle" />
                )}
              </p>
            );
          })}
        </div>
      );
    });
  };

  // Convert row vectors to a beautiful theme-styled HTML Table
  const renderTableHTML = (rows: string[][], tableId: string) => {
    if (rows.length === 0) return <div key={tableId} />;
    
    // Filter out separator lines (e.g. |---|---|)
    const filteredRows = rows.filter(r => !r.every(cell => cell.startsWith('-') || cell.includes('---')));
    if (filteredRows.length === 0) return <div key={tableId} />;

    const headers = filteredRows[0];
    const dataRows = filteredRows.slice(1);

    return (
      <div key={tableId} className="my-4 overflow-x-auto rounded-xl border border-neutral-850 bg-neutral-950/20 max-w-full">
        <table className="w-full text-xs text-left text-neutral-300 border-collapse">
          <thead className="bg-neutral-900 text-[10px] uppercase font-mono border-b border-neutral-800 text-neutral-400">
            <tr>
              {headers.map((h, i) => (
                <th key={i} className="px-4 py-2.5 font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-850">
            {dataRows.map((row, rIdx) => (
              <tr key={rIdx} className="hover:bg-neutral-900/40 transition-colors">
                {row.map((cell, cIdx) => (
                  <td key={cIdx} className="px-4 py-2 font-medium">{parseInlineMarkdown(cell)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  // Regex string highlighter for Bold, Italics, Code tags
  const parseInlineMarkdown = (text: string) => {
    if (!text) return '';

    // Handle bold: **text**
    let parts: any[] = [text];

    // Split bold stars
    parts = parts.flatMap((p, i) => {
      if (typeof p !== 'string') return p;
      return p.split(/(\*\*[\s\S]*?\*\*)/g).map(chunk => {
        if (chunk.startsWith('**') && chunk.endsWith('**')) {
          return <strong key={i + chunk} className="font-semibold text-white">{chunk.slice(2, -2)}</strong>;
        }
        return chunk;
      });
    });

    // Split inline code backticks: `code`
    parts = parts.flatMap((p, i) => {
      if (typeof p !== 'string') return p;
      return p.split(/(`[^`]+`)/g).map(chunk => {
        if (chunk.startsWith('`') && chunk.endsWith('`')) {
          return <code key={i + chunk} className="px-1.5 py-0.5 rounded bg-neutral-950 text-indigo-300 font-mono text-[11px] font-medium border border-neutral-900">{chunk.slice(1, -1)}</code>;
        }
        return chunk;
      });
    });

    // Handle italics: *text*
    parts = parts.flatMap((p, i) => {
      if (typeof p !== 'string') return p;
      return p.split(/(\*[^*]+\*)/g).map(chunk => {
        if (chunk.startsWith('*') && chunk.endsWith('*')) {
          return <em key={i + chunk} className="italic text-neutral-300">{chunk.slice(1, -1)}</em>;
        }
        return chunk;
      });
    });

    return parts;
  };

  const suggestions = [
    { text: "Help me debug a TypeScript algorithm", desc: "Advanced reasoning & structures" },
    { text: "Analyze this image and perform OCR", desc: "Screenshot visual understanding" },
    { text: "Read a PDF report and extract facts", desc: "Context summarization & query" },
    { text: "Initiate continuous live voice conversation", desc: "Real-time dual voice bridge" }
  ];

  return (
    <div ref={containerRef} className="flex-1 overflow-y-auto bg-[#0A0A0A] p-4 md:p-6 flex flex-col justify-between selection:bg-[#8B5CF6]/20">
      
      {/* If empty chat history, show Claude-style beautiful welcome dashboard */}
      {messages.length === 0 ? (
        <div className="max-w-2xl mx-auto w-full my-auto py-12 flex flex-col items-center">
          <motion.div 
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="w-16 h-16 rounded-2xl bg-neutral-900 border border-neutral-800 flex items-center justify-center p-2.5 mb-6 relative"
          >
            <img 
              src="https://i.ibb.co/4gJwpQyb/image.png" 
              alt="AEZ logo" 
              className="w-full h-full object-contain"
              referrerPolicy="no-referrer"
            />
            <div className="absolute -inset-1 bg-[#8B5CF6]/5 rounded-2xl blur-md -z-10 animate-pulse"></div>
          </motion.div>
          
          <h2 className="text-2xl font-semibold text-white text-center tracking-tight mb-2">
            Welcome to AEZ Ai, {userProfile?.displayName ? userProfile.displayName : "Guest"}
          </h2>
          <p className="text-xs text-neutral-400 text-center leading-relaxed max-w-md mb-8">
            Our most sophisticated Claude-inspired multimodal AI assistant. Powered by Gemini 3.5, I speak, listen, read PDFs, process charts, and ground searches in real-time.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 w-full">
            {suggestions.map((s, idx) => (
              <motion.div
                key={idx}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.1 }}
                onClick={() => onSelectSuggestion(s.text)}
                className="p-3.5 bg-neutral-900/60 hover:bg-neutral-900 border border-neutral-850 hover:border-neutral-800 rounded-xl cursor-pointer transition-all flex flex-col justify-between group text-left shadow-sm"
              >
                <span className="text-xs font-semibold text-neutral-300 group-hover:text-[#8B5CF6] transition-colors">
                  {s.text}
                </span>
                <span className="text-[10px] text-neutral-500 mt-1 font-mono">{s.desc}</span>
              </motion.div>
            ))}
          </div>
        </div>
      ) : (
        <div className="max-w-3xl mx-auto w-full space-y-6 md:space-y-8 pb-32">
          {messages.map((m) => {
            const isAI = m.role === 'assistant';
            return (
              <motion.div
                key={m.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className={`flex gap-4 md:gap-5 ${isAI ? 'text-left' : 'flex-row-reverse text-right'}`}
              >
                {/* Visual Avatar */}
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border ${
                  isAI 
                    ? 'bg-[#171717] border-[#262626] text-[#8B5CF6]' 
                    : 'bg-neutral-800 border-neutral-700 text-neutral-300 font-semibold'
                }`}>
                  {isAI ? <Bot size={16} /> : (userProfile?.displayName ? userProfile.displayName[0].toUpperCase() : 'U')}
                </div>

                <div className="space-y-2 max-w-[85%]">
                  {/* Sender and stamp */}
                  <div className={`flex items-center gap-2 text-[10px] text-neutral-500 font-mono ${!isAI && 'flex-row-reverse'}`}>
                    <span className="font-semibold text-neutral-400">
                      {isAI ? "AEZ Ai" : (userProfile?.displayName || "User")}
                    </span>
                    <span>•</span>
                    <span>
                      {new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>

                  {/* Message container Bubble */}
                  <div className={`p-4 rounded-2xl leading-relaxed text-sm ${
                    isAI 
                      ? 'bg-transparent text-neutral-100 border-none animate-fadeIn' 
                      : 'bg-[#8B5CF6] text-white shadow-lg shadow-[#8B5CF6]/10 font-medium'
                  }`}>
                    
                    {/* Render uploader file items if any */}
                    {m.attachments && m.attachments.length > 0 && (
                      <div className="flex flex-wrap gap-2 mb-3">
                        {m.attachments.map((attach, idx) => {
                          const isImg = attach.type.startsWith('image/');
                          return (
                            <div key={idx} className="flex items-center gap-2 p-1.5 bg-[#171717]/80 border border-[#262626] rounded-lg max-w-[200px] shrink-0">
                              {isImg && attach.dataUrl ? (
                                <img src={attach.dataUrl} alt="Visual Attachment" className="w-8 h-8 rounded object-cover" />
                              ) : (
                                <FileText className="w-6 h-6 text-[#8B5CF6] shrink-0" />
                              )}
                              <div className="min-w-0 pr-1">
                                <p className="text-[10px] text-neutral-300 truncate font-medium">{attach.name}</p>
                                <p className="text-[8px] text-neutral-500 uppercase font-mono">{attach.type.split('/').pop() || 'FILE'}</p>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Content text */}
                    {isAI ? (
                      <div className="space-y-3">
                        {renderFormattedContent(m.content, m.id)}
                      </div>
                    ) : (
                      <p className="whitespace-pre-wrap">{m.content}</p>
                    )}
                  </div>

                  {/* Grounding web citations */}
                  {isAI && metadataSources && m.id === messages[messages.length - 1].id && (
                    <motion.div 
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="mt-3 p-3 bg-neutral-900/50 border border-neutral-850 rounded-xl space-y-2"
                    >
                      <span className="text-[10px] uppercase font-mono tracking-wider font-semibold text-neutral-400 flex items-center gap-1">
                        <Search size={10} className="text-[#8B5CF6]" /> Grounded Search Sources
                      </span>
                      <div className="flex flex-wrap gap-2">
                        {metadataSources.map((chunk: any, chunkIdx: number) => {
                          if (chunk.web) {
                            return (
                              <a
                                key={chunkIdx}
                                href={chunk.web.uri}
                                target="_blank"
                                rel="noreferrer"
                                className="flex items-center gap-1 px-2.5 py-1 bg-[#171717] hover:bg-neutral-900 border border-[#262626] rounded-lg text-[10px] text-neutral-300 hover:text-[#8B5CF6] transition-colors"
                              >
                                <span className="truncate max-w-[150px] font-medium">{chunk.web.title || chunk.web.uri}</span>
                                <ExternalLink size={8} />
                              </a>
                            );
                          }
                          return null;
                        })}
                      </div>
                    </motion.div>
                  )}
                </div>
              </motion.div>
            );
          })}

          {/* Active AI Streaming turn */}
          {isStreaming && (
            <div className="flex gap-4 md:gap-5 text-left animate-fadeIn">
              <div className="w-8 h-8 rounded-lg bg-[#171717] border border-[#262626] text-[#8B5CF6] flex items-center justify-center shrink-0">
                <Bot size={16} className="animate-pulse" />
              </div>
              <div className="space-y-2 max-w-[85%]">
                <div className="flex items-center gap-2 text-[10px] text-neutral-500 font-mono">
                  <span className="font-semibold text-neutral-400">AEZ Ai</span>
                  <span>•</span>
                  <span>{currentStreamText ? "Streaming response..." : "Thinking..."}</span>
                </div>
                <div className="p-4 rounded-2xl bg-transparent text-neutral-100 border-none leading-relaxed text-sm">
                  <div className="space-y-3">
                    {currentStreamText ? (
                      renderFormattedContent(currentStreamText, 'streaming-message', true)
                    ) : (
                      <span className="inline-block w-1.5 h-3.5 bg-[#8B5CF6] animate-pulse align-middle" />
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          <div ref={scrollRef} />
        </div>
      )}
    </div>
  );
}
