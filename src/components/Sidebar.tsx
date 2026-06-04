import React, { useState } from 'react';
import { motion } from 'motion/react';
import { 
  Plus, MessageSquare, Trash2, Search, Sliders, LogOut, 
  LogIn, Moon, Sun, Brain, User, Volume2, ShieldAlert,
  KeyRound, Mail
} from 'lucide-react';
import { Conversation, UserProfile, UserSettings } from '../types';

interface SidebarProps {
  conversations: Conversation[];
  activeId: string | null;
  onSelectConversation: (id: string) => void;
  onNewConversation: () => void;
  onDeleteConversation: (id: string) => void;
  searchQuery: string;
  onSearchQueryChange: (query: string) => void;
  user: any;
  userProfile: UserProfile | null;
  settings: UserSettings;
  onUpdateSettings: (s: Partial<UserSettings>) => void;
  onSignInWithGoogle: () => void;
  onSignInWithEmail: (email: string, pass: string, isSignUp: boolean, displayName?: string) => Promise<void>;
  onSendResetEmail: (email: string) => Promise<void>;
  onSignOut: () => void;
  onOpenMemories: () => void;
}

export default function Sidebar({
  conversations,
  activeId,
  onSelectConversation,
  onNewConversation,
  onDeleteConversation,
  searchQuery,
  onSearchQueryChange,
  user,
  userProfile,
  settings,
  onUpdateSettings,
  onSignInWithGoogle,
  onSignInWithEmail,
  onSendResetEmail,
  onSignOut,
  onOpenMemories
}: SidebarProps) {
  const [showSettings, setShowSettings] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authDisplayName, setAuthDisplayName] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [authSuccessMsg, setAuthSuccessMsg] = useState<string | null>(null);
  const [showForgotPassword, setShowForgotPassword] = useState(false);

  // Filter conversations based on query
  const filteredConversations = conversations.filter(c => 
    c.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleEmailAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setAuthSuccessMsg(null);
    if (!authEmail || !authPassword) {
      setAuthError("Please input both email and password.");
      return;
    }
    try {
      await onSignInWithEmail(authEmail, authPassword, isSignUp, authDisplayName);
      setShowAuthModal(false);
      setAuthPassword('');
      setAuthEmail('');
      setAuthDisplayName('');
    } catch (err: any) {
      setAuthError(err.message || "Authentication failed.");
    }
  };

  const handlePasswordReset = async () => {
    setAuthError(null);
    setAuthSuccessMsg(null);
    if (!authEmail) {
      setAuthError("Please input your email address above first.");
      return;
    }
    try {
      await onSendResetEmail(authEmail);
      setAuthSuccessMsg("Password reset email sent securely!");
    } catch (err: any) {
      setAuthError(err.message || "Failed to trigger password reset.");
    }
  };

  return (
    <div className="w-80 h-full border-r flex flex-col transition-all overflow-hidden bg-[#111111] border-[#262626] text-gray-200">
      {/* Brand Header */}
      <div className="p-4 border-b border-[#262626] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <img 
            src="https://i.ibb.co/4gJwpQyb/image.png" 
            alt="AEZ logo" 
            className="w-8 h-8 rounded-lg object-contain bg-neutral-900 border border-neutral-800 shadow-md shadow-[#8B5CF6]/5"
            referrerPolicy="no-referrer"
          />
          <div>
            <h1 className="font-semibold text-white text-md tracking-tight">AEZ Ai</h1>
            <p className="text-[10px] text-gray-500 font-mono">Claude Replica v1.0</p>
          </div>
        </div>
        
        {/* New Chat Button Shortcut */}
        <button 
          onClick={onNewConversation}
          title="New Chat"
          className="p-2 rounded-lg bg-[#171717] border border-[#262626] hover:bg-[#1f1f1f] transition-colors text-[#8B5CF6] hover:text-[#a78bfa]"
          id="btn-sidebar-new-chat-short"
        >
          <Plus size={18} />
        </button>
      </div>

      {/* Primary Action Button */}
      <div className="p-4">
        <button
          onClick={onNewConversation}
          className="flex w-full items-center justify-between rounded-lg border border-[#262626] bg-[#171717] px-4 py-2.5 text-sm font-medium transition-colors hover:bg-[#1f1f1f]"
          id="btn-sidebar-new-chat"
        >
          <div className="flex items-center gap-2">
            <svg className="h-4 w-4 text-[#8B5CF6]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4"/></svg>
            New Chat
          </div>
          <span className="text-[10px] text-gray-500 uppercase tracking-widest">⌘K</span>
        </button>
      </div>

      {/* Search Chats */}
      <div className="px-4 mb-2">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-3 text-neutral-500" />
          <input
            type="text"
            placeholder="Search conversations..."
            value={searchQuery}
            onChange={(e) => onSearchQueryChange(e.target.value)}
            className="w-full py-1.5 pl-9 pr-4 bg-[#171717]/80 hover:bg-[#171717] focus:bg-[#171717] outline-none border border-[#262626] focus:border-[#8B5CF6]/50 text-xs rounded-lg text-gray-300 placeholder-gray-500 transition-colors"
          />
        </div>
      </div>

      {/* Chat Thread History */}
      <div className="flex-1 overflow-y-auto px-2 space-y-1 py-2">
        {filteredConversations.length === 0 ? (
          <div className="text-center py-8 text-neutral-500 text-xs">
            {searchQuery ? "No matching chats found" : "No chats yet"}
          </div>
        ) : (
          filteredConversations.map((c) => {
            const isActive = c.id === activeId;
            return (
              <div
                key={c.id}
                className={`group flex items-center justify-between p-2.5 rounded-xl cursor-pointer transition-all ${
                  isActive 
                    ? 'bg-[#171717] border border-[#262626] text-white font-medium' 
                    : 'hover:bg-[#171717]/50 text-gray-400 hover:text-gray-250'
                }`}
                onClick={() => onSelectConversation(c.id)}
              >
                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                  <MessageSquare size={16} className={isActive ? "text-[#8B5CF6]" : "text-gray-500"} />
                  <span className="text-xs truncate">{c.title || "Untitled Chat"}</span>
                </div>
                
                {/* Delete button only visible on hover / active */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (confirm("Delete this conversation and its history?")) {
                      onDeleteConversation(c.id);
                    }
                  }}
                  className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-neutral-700 hover:text-red-400 text-neutral-500 transition-all"
                  title="Delete Chat"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            );
          })
        )}
      </div>

      {/* Interactive Settings and Memory triggers */}
      {showSettings && (
        <motion.div 
          initial={{ opacity: 0, y: 15 }} 
          animate={{ opacity: 1, y: 0 }}
          className="mx-3 mb-2 p-3 bg-neutral-950 border border-neutral-800 rounded-xl space-y-3"
        >
          <div className="flex items-center justify-between border-b border-neutral-900 pb-2">
            <span className="text-xs font-semibold text-white flex items-center gap-1.5">
              <Sliders size={13} className="text-indigo-400" /> Settings
            </span>
            <button 
              onClick={() => setShowSettings(false)}
              className="text-[10px] hover:underline text-neutral-500 hover:text-neutral-400 cursor-pointer"
            >
              Close
            </button>
          </div>

          {/* Theme toggler */}
          <div className="flex items-center justify-between text-xs">
            <span className="text-neutral-400">Theme</span>
            <button
              onClick={() => onUpdateSettings({ theme: settings.theme === 'light' ? 'dark' : 'light' })}
              className="flex items-center gap-1.5 px-2 py-1 bg-neutral-800 hover:bg-neutral-750 rounded-lg text-neutral-300 cursor-pointer"
            >
              {settings.theme === 'light' ? (
                <>
                  <Sun size={12} className="text-yellow-400" />
                  <span>Light</span>
                </>
              ) : (
                <>
                  <Moon size={12} className="text-indigo-400" />
                  <span>Dark</span>
                </>
              )}
            </button>
          </div>

          {/* Voice select */}
          <div className="space-y-1.5 text-xs">
            <label className="text-neutral-400 flex items-center gap-1">
              <Volume2 size={12} /> Prebuilt Voice
            </label>
            <select
              value={settings.voiceName}
              onChange={(e) => onUpdateSettings({ voiceName: e.target.value })}
              className="w-full p-1.5 bg-neutral-850 border border-neutral-800 text-neutral-300 rounded focus:outline-none"
            >
              <option value="Zephyr">Zephyr (Warm Male)</option>
              <option value="Kore">Kore (Clear Female)</option>
              <option value="Puck">Puck (Cheerful Male)</option>
              <option value="Charon">Charon (Professional Male)</option>
              <option value="Fenrir">Fenrir (Deep Male)</option>
            </select>
          </div>
        </motion.div>
      )}

      {/* User Session Footer */}
      <div className="p-3 border-t border-[#262626] bg-[#111111]">
        {user ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-[#8B5CF6] to-[#D946EF] flex items-center justify-center text-white border border-[#262626] font-medium text-xs">
                  {userProfile?.displayName ? userProfile.displayName.charAt(0).toUpperCase() : <User size={14} />}
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-medium text-white truncate">
                    {userProfile?.displayName || user.displayName || "Activated User"}
                  </p>
                  <p className="text-[10px] text-gray-500 truncate">{user.email}</p>
                </div>
              </div>
              <button
                onClick={onSignOut}
                title="Sign Out"
                className="p-1.5 rounded-lg hover:bg-[#1f1f1f] text-gray-400 hover:text-rose-400 transition-colors"
              >
                <LogOut size={16} />
              </button>
            </div>

            {/* Quick Actions Bar */}
            <div className="grid grid-cols-2 gap-2 pt-1 border-t border-[#262626]">
              <button
                onClick={onOpenMemories}
                className="py-1 px-2.5 bg-[#171717] hover:bg-[#1f1f1f] border border-[#262626] rounded-lg text-[10px] text-gray-300 hover:text-[#8B5CF6] transition-colors flex items-center justify-center gap-1 font-medium cursor-pointer"
              >
                <Brain size={12} />
                Memories
              </button>
              <button
                onClick={() => setShowSettings(prev => !prev)}
                className="py-1 px-2.5 bg-[#171717] hover:bg-[#1f1f1f] border border-[#262626] rounded-lg text-[10px] text-gray-300 hover:text-[#8B5CF6] transition-colors flex items-center justify-center gap-1 font-medium cursor-pointer"
              >
                <Sliders size={12} />
                Settings
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setShowAuthModal(true)}
            className="w-full py-2 bg-[#8B5CF6] hover:bg-[#7c3aed] transition-colors font-medium text-white flex items-center justify-center gap-2 rounded-xl text-xs cursor-pointer shadow-md shadow-[#8B5CF6]/10"
            id="btn-sidebar-signin"
          >
            <LogIn size={14} />
            Sign in of account
          </button>
        )}
      </div>

      {/* Complete Authentic Firebase Authentication Modal */}
      {showAuthModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full max-w-sm bg-neutral-900 border border-neutral-800 p-6 rounded-2xl shadow-xl text-neutral-200"
          >
            <div className="flex items-center justify-between border-b border-neutral-800 pb-3 mb-4">
              <h2 className="text-sm font-semibold text-white flex items-center gap-1.5">
                <KeyRound size={15} className="text-indigo-400" />
                {showForgotPassword ? "Reset Password" : isSignUp ? "Create AEZ Ai Account" : "Sign In to AEZ Ai"}
              </h2>
              <button 
                onClick={() => {
                  setShowAuthModal(false);
                  setShowForgotPassword(false);
                  setAuthError(null);
                  setAuthSuccessMsg(null);
                }}
                className="text-neutral-500 hover:text-neutral-300 text-xs"
              >
                Cancel
              </button>
            </div>

            {authError && (
              <div className="p-2.5 mb-3 bg-red-950/60 border border-red-900 text-red-300 text-[11px] rounded flex gap-1.5 items-start">
                <ShieldAlert size={14} className="shrink-0 mt-0.5" />
                <div>{authError}</div>
              </div>
            )}

            {authSuccessMsg && (
              <div className="p-2.5 mb-3 bg-green-950/60 border border-green-900 text-green-300 text-[11px] rounded flex gap-1.5 items-start">
                <Mail size={14} className="shrink-0 mt-0.5" />
                <div>{authSuccessMsg}</div>
              </div>
            )}

            {showForgotPassword ? (
              <div className="space-y-4">
                <p className="text-[11px] text-neutral-400 leading-relaxed">
                  Enter your email address and we will generate a password recovery link.
                </p>
                <div>
                  <label className="block text-[10px] text-neutral-400 uppercase tracking-wider mb-1 font-mono">Email Address</label>
                  <input
                    type="email"
                    value={authEmail}
                    onChange={(e) => setAuthEmail(e.target.value)}
                    placeholder="name@domain.com"
                    className="w-full p-2 bg-neutral-950 border border-neutral-800 hover:border-neutral-700 rounded text-xs text-white focus:outline-none"
                  />
                </div>
                <button
                  type="button"
                  onClick={handlePasswordReset}
                  className="w-full py-2 bg-indigo-650 hover:bg-indigo-600 transition-colors text-white font-medium rounded-lg text-xs"
                >
                  Send Recovery Link
                </button>
                <div className="text-center">
                  <button 
                    onClick={() => setShowForgotPassword(false)}
                    className="text-[10px] text-indigo-400 hover:underline"
                  >
                    Back to Normal Login
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleEmailAuthSubmit} className="space-y-3">
                {isSignUp && (
                  <div>
                    <label className="block text-[10px] text-neutral-400 uppercase tracking-wider mb-1 font-mono">Display Name</label>
                    <input
                      type="text"
                      value={authDisplayName}
                      onChange={(e) => setAuthDisplayName(e.target.value)}
                      placeholder="My Nickname"
                      className="w-full p-2 bg-neutral-950 border border-neutral-800 hover:border-neutral-700 rounded text-xs text-white focus:outline-none"
                    />
                  </div>
                )}

                <div>
                  <label className="block text-[10px] text-neutral-400 uppercase tracking-wider mb-1 font-mono">Email Address</label>
                  <input
                    type="email"
                    required
                    value={authEmail}
                    onChange={(e) => setAuthEmail(e.target.value)}
                    placeholder="user@example.com"
                    className="w-full p-2 bg-neutral-950 border border-neutral-800 hover:border-neutral-700 rounded text-xs text-white focus:outline-none"
                  />
                </div>

                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="block text-[10px] text-neutral-400 uppercase tracking-wider font-mono">Secure Password</label>
                    {!isSignUp && (
                      <button 
                        type="button"
                        onClick={() => setShowForgotPassword(true)}
                        className="text-[10px] text-indigo-400 hover:underline"
                      >
                        Forgot?
                      </button>
                    )}
                  </div>
                  <input
                    type="password"
                    required
                    value={authPassword}
                    onChange={(e) => setAuthPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full p-2 bg-neutral-950 border border-neutral-800 hover:border-neutral-700 rounded text-xs text-white focus:outline-none"
                  />
                </div>

                <button
                  type="submit"
                  className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-550 transition-colors text-white font-semibold rounded-xl text-xs"
                >
                  {isSignUp ? "Register Account" : "Login Securely"}
                </button>

                {/* Switch Login / Sign Up options */}
                <div className="text-center pt-1 text-xs text-neutral-400">
                  <span>{isSignUp ? "Already have an account?" : "New to AEZ Ai?"} </span>
                  <button
                    type="button"
                    onClick={() => {
                      setIsSignUp(!isSignUp);
                      setAuthError(null);
                      setAuthSuccessMsg(null);
                    }}
                    className="text-indigo-400 hover:underline inline-block font-medium"
                  >
                    {isSignUp ? "Sign In Instead" : "Create Account"}
                  </button>
                </div>

                {/* Google Oauth Divider */}
                <div className="flex items-center gap-2 py-2">
                  <div className="h-px bg-neutral-800 flex-1"></div>
                  <span className="text-[10px] text-neutral-500 font-mono">OR</span>
                  <div className="h-px bg-neutral-800 flex-1"></div>
                </div>

                {/* Google SSO Button */}
                <button
                  type="button"
                  onClick={() => {
                    onSignInWithGoogle();
                    setShowAuthModal(false);
                  }}
                  className="w-full py-2 bg-neutral-800 hover:bg-neutral-750 transition-colors border border-neutral-700/80 rounded-xl text-xs text-neutral-100 font-medium flex items-center justify-center gap-2"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24">
                    <path
                      fill="currentColor"
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    />
                    <path
                      fill="currentColor"
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    />
                    <path
                      fill="currentColor"
                      d="m5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                    />
                    <path
                      fill="currentColor"
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                    />
                  </svg>
                  Connect with Google
                </button>
              </form>
            )}
          </motion.div>
        </div>
      )}
    </div>
  );
}
