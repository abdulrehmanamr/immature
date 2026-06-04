import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  X, Brain, Plus, Trash2, Edit2, Check, Sparkles, 
  Settings, Info, Lightbulb
} from 'lucide-react';
import { Memory } from '../types';

interface MemoryPanelProps {
  isOpen: boolean;
  onClose: () => void;
  memories: Memory[];
  onAddMemory: (content: string, type: 'fact' | 'preference' | 'instruction') => void;
  onDeleteMemory: (id: string) => void;
  onUpdateMemory: (id: string, content: string, type: 'fact' | 'preference' | 'instruction') => void;
}

export default function MemoryPanel({
  isOpen,
  onClose,
  memories,
  onAddMemory,
  onDeleteMemory,
  onUpdateMemory
}: MemoryPanelProps) {
  const [newContent, setNewContent] = useState('');
  const [newType, setNewType] = useState<'fact' | 'preference' | 'instruction'>('fact');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [editType, setEditType] = useState<'fact' | 'preference' | 'instruction'>('fact');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newContent.trim()) return;

    onAddMemory(newContent.trim(), newType);
    setNewContent('');
  };

  const handleStartEdit = (m: Memory) => {
    setEditingId(m.id);
    setEditContent(m.content);
    setEditType(m.type);
  };

  const handleSaveEdit = (id: string) => {
    if (!editContent.trim()) return;
    onUpdateMemory(id, editContent.trim(), editType);
    setEditingId(null);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 text-neutral-200">
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 15 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 15 }}
            className="w-full max-w-lg bg-[#111111] border border-[#262626] p-6 rounded-2xl shadow-2xl flex flex-col max-h-[85vh] overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-[#262626] pb-3 mb-4">
              <div className="flex items-center gap-2">
                <Brain className="w-5 h-5 text-[#8B5CF6] animate-pulse" />
                <div>
                  <h2 className="text-sm font-semibold text-white">Active Core Memory Nodes</h2>
                  <p className="text-[10px] text-gray-500 font-mono">Long-Term Facts & Settings Storage</p>
                </div>
              </div>
              
              <button
                onClick={onClose}
                className="text-gray-500 hover:text-white p-1 rounded-lg hover:bg-[#1s1s1s] hover:bg-[#1f1f1f] transition-colors cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            {/* Quick explanation tag */}
            <div className="p-3 mb-4 bg-[#8B5CF6]/5 border border-[#8B5CF6]/20 text-gray-300 rounded-xl text-xs flex gap-2 items-start">
              <Sparkles size={16} className="text-[#8B5CF6] shrink-0 mt-0.5" />
              <p className="leading-relaxed">
                Registered profiles are automatically fed into the AI as instructions, allowing AEZ Ai to adjust vocabulary, remember project details, and align behaviors.
              </p>
            </div>

            {/* Add Memory Form */}
            <form onSubmit={handleSubmit} className="p-3.5 bg-[#171717] border border-[#262626] rounded-xl mb-4 space-y-3">
              <span className="text-[10px] text-gray-400 font-mono uppercase tracking-wider block font-semibold">Store new fact / directive</span>
              
              <div className="flex gap-2">
                {/* Fact type */}
                <select
                  value={newType}
                  onChange={(e) => setNewType(e.target.value as any)}
                  className="bg-[#111111] border border-[#262626] font-mono text-[10px] text-gray-300 rounded focus:outline-none p-1 shrink-0"
                >
                  <option value="fact">Fact (Dynamic info)</option>
                  <option value="preference">Preference (Vibes)</option>
                  <option value="instruction">Instruction (Rules)</option>
                </select>

                <input
                  type="text"
                  value={newContent}
                  onChange={(e) => setNewContent(e.target.value)}
                  placeholder="e.g. My nickname is AR and I prefer React + Express stacks."
                  className="flex-1 p-1 bg-transparent border-none text-xs text-white placeholder-gray-500 outline-none focus:ring-0"
                />

                <button
                  type="submit"
                  disabled={!newContent.trim()}
                  className="py-1 px-3 bg-[#8B5CF6] hover:bg-[#7c3aed] transition-colors text-white disabled:opacity-40 disabled:hover:bg-[#8B5CF6] rounded-lg text-xs font-semibold cursor-pointer shrink-0"
                >
                  Save Fact
                </button>
              </div>
            </form>

            {/* Scrollable list of facts */}
            <div className="flex-1 overflow-y-auto space-y-2.5 pr-1">
              {memories.length === 0 ? (
                <div className="text-center py-12 text-neutral-500 text-xs flex flex-col items-center justify-center gap-2">
                  <Lightbulb size={24} className="text-neutral-600" />
                  No stored custom memories yet. Add your details above.
                </div>
              ) : (
                <div className="space-y-2">
                  {memories.map((m) => {
                    const isEditing = editingId === m.id;
                    return (
                      <div
                        key={m.id}
                        className="p-3 bg-[#171717] border border-[#262626] hover:border-[#8B5CF6]/40 rounded-xl flex items-center justify-between gap-3 group transition-all"
                      >
                        {isEditing ? (
                          <div className="flex-1 flex gap-2">
                            <select
                              value={editType}
                              onChange={(e) => setEditType(e.target.value as any)}
                              className="bg-[#111111] border border-[#262626] font-mono text-[10px] text-gray-300 rounded focus:outline-none p-1"
                            >
                              <option value="fact">Fact</option>
                              <option value="preference">Preference</option>
                              <option value="instruction">Instruction</option>
                            </select>
                            <input
                              type="text"
                              value={editContent}
                              onChange={(e) => setEditContent(e.target.value)}
                              className="flex-1 p-1 bg-transparent border-none text-xs text-white focus:outline-none font-mono"
                            />
                            <button
                              onClick={() => handleSaveEdit(m.id)}
                              className="p-1 rounded bg-green-600/20 text-green-400 hover:bg-green-600/30 transition-colors"
                            >
                              <Check size={14} />
                            </button>
                          </div>
                        ) : (
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <span className={`text-[8px] uppercase font-mono tracking-wider px-1.5 py-0.5 rounded font-extrabold ${
                                m.type === 'instruction' 
                                  ? 'bg-red-950/40 text-red-400' 
                                  : m.type === 'preference'
                                    ? 'bg-purple-950/40 text-purple-400'
                                    : 'bg-[#8B5CF6]/15 text-[#8B5CF6]'
                              }`}>
                                {m.type}
                              </span>
                              <span className="text-[8px] text-gray-650 font-mono leading-none">
                                {new Date(m.createdAt).toLocaleDateString()}
                              </span>
                            </div>
                            <p className="text-xs text-gray-200 leading-normal">{m.content}</p>
                          </div>
                        )}

                        {!isEditing && (
                          <div className="flex gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={() => handleStartEdit(m)}
                              title="Edit Memory Node"
                              className="p-1 rounded hover:bg-[#1f1f1f] text-gray-500 hover:text-[#8B5CF6] transition-colors cursor-pointer"
                            >
                              <Edit2 size={12} />
                            </button>
                            <button
                              onClick={() => onDeleteMemory(m.id)}
                              title="Delete Memory Node"
                              className="p-1 rounded hover:bg-neutral-850 text-neutral-500 hover:text-red-400 transition-colors cursor-pointer"
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
