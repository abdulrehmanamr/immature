export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  createdAt: string;
}

export interface UserSettings {
  userId: string;
  theme: 'light' | 'dark';
  voiceName: string; // Puck, Charon, Kore, Fenrir, Zephyr
  voiceSpeed: number;
  voicePitch: number;
  geminiApiKey?: string;
}

export interface Conversation {
  id: string;
  userId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

export interface MessageAttachment {
  name: string;
  type: string;
  size: number;
  dataUrl?: string; // used for images and inline content
  base64?: string;  // clean base64 string
}

export interface Message {
  id: string;
  conversationId: string;
  userId: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
  attachments?: MessageAttachment[];
}

export interface Memory {
  id: string;
  userId: string;
  content: string;
  type: 'fact' | 'preference' | 'instruction';
  createdAt: string;
}

export interface VoiceConfig {
  voiceName: string;
  speed: number;
  pitch: number;
}
