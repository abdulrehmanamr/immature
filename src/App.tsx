import { useEffect, useState } from 'react';
import { GoogleGenAI } from '@google/genai';
import firebaseConfigLocal from '../firebase-applet-config.json';
import { 
  auth, db, googleProvider, handleFirestoreError, OperationType 
} from './lib/firebase';
import { 
  signInWithPopup, signInWithEmailAndPassword, createUserWithEmailAndPassword, 
  sendPasswordResetEmail, signOut, onAuthStateChanged 
} from 'firebase/auth';
import { 
  doc, onSnapshot, setDoc, updateDoc, deleteDoc, collection, 
  getDocs, addDoc, query, where, orderBy, writeBatch 
} from 'firebase/firestore';
import { Conversation, Message, Memory, UserProfile, UserSettings, MessageAttachment, VoiceConfig } from './types';
import Sidebar from './components/Sidebar';
import ChatArea from './components/ChatArea';
import InputArea from './components/InputArea';
import VoiceAssistant from './components/VoiceAssistant';
import MemoryPanel from './components/MemoryPanel';
import FileExporter from './components/FileExporter';
import { Sparkles, Brain, Sliders, Menu, X, LogIn } from 'lucide-react';

async function streamGeminiResponse(
  message: string,
  history: { role: string; content: string }[],
  searchEnabled: boolean,
  attachments: any[],
  onChunk: (text: string) => void,
  onCitations?: (chunks: any[]) => void,
  signal?: AbortSignal,
  customApiKey?: string
): Promise<string> {
  try {
    // 1. Attempt Server SSE endpoint first
    const response = await fetch('/api/gemini/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        message,
        history,
        searchEnabled,
        attachments
      }),
      signal
    });

    if (response.ok && response.body) {
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let streamAccumulator = '';

      while (true) {
        if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
        const { value, done } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('data: ')) continue;
          
          const rawJSON = trimmed.slice(6);
          if (rawJSON === '[DONE]') {
            break;
          }

          try {
            const parsed = JSON.parse(rawJSON);
            if (parsed.text) {
              streamAccumulator += parsed.text;
              onChunk(streamAccumulator);
            }
            if (parsed.groundingMetadata?.groundingChunks && onCitations) {
              onCitations(parsed.groundingMetadata.groundingChunks);
            }
          } catch (e) {
            // Buffer fragment processing catch
          }
        }
      }
      return streamAccumulator;
    } else {
      let errorText = `Endpoint response code ${response.status}`;
      try {
        const errorJson = await response.json();
        if (errorJson && errorJson.error) {
          errorText = errorJson.error;
        }
      } catch (_) {}
      
      const serverErr = new Error(errorText);
      (serverErr as any).isServerResponseError = response.status !== 404;
      throw serverErr;
    }
  } catch (err: any) {
    if (err.name === 'AbortError' || err.message === 'Aborted') {
      throw err;
    }

    if (err.isServerResponseError) {
      throw err;
    }

    console.warn("Express backend endpoint failed/404. Initiating client-side Gemini fallback strategy...");
    
    // Resolve fallback API Key (custom user setting key or public environment variable)
    const apiKey = customApiKey || (import.meta as any).env.VITE_GEMINI_API_KEY || "AQ.Ab8RN6JdHLFmJFlOpK3jtpAmZ6nj4SlVLnXE2EHEu8AZAVh3nQ";
    if (!apiKey) {
      throw new Error(
        "Chat is not working because this app is currently hosted on a static web provider (such as Vercel) where the custom Express server is unavailable, and no client-side Gemini API key is configured.\n\n" +
        "To easily fix this and start chatting right now:\n" +
        "1. Open Settings (using the Sliders icon at the bottom of the sidebar).\n" +
        "2. Paste your own Gemini API Key (or configure VITE_GEMINI_API_KEY as an environment variables parameter on your host).\n" +
        "3. Select Close, and start typing your prompt!"
      );
    }

    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build'
        }
      }
    });

    // Build standard generative context contents array
    const contents: any[] = [];
    for (const h of history) {
      // Clean system instructions out of general roles if they are system messages
      if (h.content.includes("IMPORTANT: Remember these long-term preferences")) {
        continue;
      }
      contents.push({
        role: h.role === 'user' ? 'user' : 'model',
        parts: [{ text: h.content }]
      });
    }

    // Capture attachments and append to user turn inline
    const parts: any[] = [];
    if (attachments && Array.isArray(attachments)) {
      for (const att of attachments) {
        let cleanBase = att.base64 || '';
        if (cleanBase && cleanBase.includes(';base64,')) {
          cleanBase = cleanBase.split(';base64,').pop() || '';
        }
        if (cleanBase) {
          parts.push({
            inlineData: {
              data: cleanBase,
              mimeType: att.type
            }
          });
        }
      }
    }
    parts.push({ text: message });
    contents.push({ role: 'user', parts });

    const tools: any[] = [];
    if (searchEnabled) {
      tools.push({ googleSearch: {} });
    }

    // Call Direct Stream using @google/genai SDK with reliable fallback chain
    let responseStream;
    try {
      responseStream = await ai.models.generateContentStream({
        model: 'gemini-3.5-flash',
        contents,
        config: {
          systemInstruction: "You are AEZ Ai, a Claude-level elite AI Assistant built to think step-by-step, explain complex algorithms, read files/PDFs, understand code/diagrams, and analyze screenshots. Format math variables in Markdown and code blocks using standard tags with specified languages. Ground searches where helpful.",
          tools: tools.length > 0 ? tools : undefined
        }
      });
    } catch (error: any) {
      const errorStr = (error.message || String(error)).toLowerCase();
      if (
        errorStr.includes("503") ||
        errorStr.includes("429") ||
        errorStr.includes("unavailable") ||
        errorStr.includes("demand") ||
        errorStr.includes("overloaded") ||
        errorStr.includes("rate limit")
      ) {
        console.warn("Primary client-side 'gemini-3.5-flash' is overloaded or unavailable. Trying fallback 'gemini-flash-latest'...");
        try {
          responseStream = await ai.models.generateContentStream({
            model: 'gemini-flash-latest',
            contents,
            config: {
              systemInstruction: "You are AEZ Ai, a Claude-level elite AI Assistant built to think step-by-step, explain complex algorithms, read files/PDFs, understand code/diagrams, and analyze screenshots. Format math variables in Markdown and code blocks using standard tags with specified languages. Ground searches where helpful.",
              tools: tools.length > 0 ? tools : undefined
            }
          });
        } catch (fallbackError: any) {
          console.warn("Fallback client-side 'gemini-flash-latest' also failed. Falling back to 'gemini-3.1-flash-lite'...");
          responseStream = await ai.models.generateContentStream({
            model: 'gemini-3.1-flash-lite',
            contents,
            config: {
              systemInstruction: "You are AEZ Ai, a Claude-level elite AI Assistant built to think step-by-step, explain complex algorithms, read files/PDFs, understand code/diagrams, and analyze screenshots. Format math variables in Markdown and code blocks using standard tags with specified languages. Ground searches where helpful.",
              tools: tools.length > 0 ? tools : undefined
            }
          });
        }
      } else {
        throw error;
      }
    }

    let streamAccumulator = '';
    for await (const chunk of responseStream) {
      if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
      const text = chunk.text || "";
      streamAccumulator += text;
      onChunk(streamAccumulator);

      if (chunk.candidates?.[0]?.groundingMetadata?.groundingChunks && onCitations) {
        onCitations(chunk.candidates[0].groundingMetadata.groundingChunks);
      }
    }

    return streamAccumulator;
  }
}

export default function App() {
  const [user, setUser] = useState<any>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [settings, setSettings] = useState<UserSettings>({
    userId: '',
    theme: 'dark',
    voiceName: 'Zephyr',
    voiceSpeed: 1.0,
    voicePitch: 1.0
  });

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [memories, setMemories] = useState<Memory[]>([]);

  // Guest-mode states
  const [guestConversations, setGuestConversations] = useState<Conversation[]>([]);
  const [guestMessages, setGuestMessages] = useState<Message[]>([]);
  const [trialCount, setTrialCount] = useState<number>(() => Number(localStorage.getItem('aez_trial_count') || '0'));
  const TRIAL_LIMIT = 10;

  // Local state for UI
  const [isStreaming, setIsStreaming] = useState(false);
  const [currentStreamText, setCurrentStreamText] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchEnabled, setSearchEnabled] = useState(false);
  
  // Modals Visibility
  const [isVoiceOpen, setIsVoiceOpen] = useState(false);
  const [isMemoriesOpen, setIsMemoriesOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false); // Mobile responsive overlay

  // Streaming Controller for stopping/interrupting
  const [abortController, setAbortController] = useState<AbortController | null>(null);
  const [currentCitations, setCurrentCitations] = useState<any[]>([]);

  // 1. Listen to Firebase Authentication Status Changes
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        // Automatically create or verify the User Document in Firestore
        const userRef = doc(db, 'users', currentUser.uid);
        const profileData: UserProfile = {
          uid: currentUser.uid,
          email: currentUser.email || '',
          displayName: currentUser.displayName || currentUser.email?.split('@')[0] || 'User',
          createdAt: new Date().toISOString()
        };
        try {
          await setDoc(userRef, profileData, { merge: true });
        } catch (e) {
          handleFirestoreError(e, OperationType.WRITE, `users/${currentUser.uid}`);
        }

        // Initialize Settings document if not already there
        const settingsRef = doc(db, 'users', currentUser.uid, 'settings', 'info');
        const defaultSettings: UserSettings = {
          userId: currentUser.uid,
          theme: 'dark',
          voiceName: 'Zephyr',
          voiceSpeed: 1.0,
          voicePitch: 1.0
        };
        try {
          await setDoc(settingsRef, defaultSettings, { merge: true });
        } catch (e) {
          handleFirestoreError(e, OperationType.WRITE, `users/${currentUser.uid}/settings/info`);
        }
      } else {
        setUserProfile(null);
        setConversations([]);
        setActiveConversationId(null);
        setMessages([]);
        setMemories([]);
      }
    });

    return () => unsubscribe();
  }, []);

  // 2. Synchronize User Profiles and Settings from Firestore
  useEffect(() => {
    if (!user) return;

    // Listen to profile
    const profileUnsub = onSnapshot(doc(db, 'users', user.uid), (snapshot) => {
      if (snapshot.exists()) {
        setUserProfile(snapshot.data() as UserProfile);
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, `users/${user.uid}`);
    });

    // Listen to user preferences
    const settingsUnsub = onSnapshot(doc(db, 'users', user.uid, 'settings', 'info'), (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data() as UserSettings;
        setSettings(data);
        // Bind Theme Preferences to document html metadata
        if (data.theme === 'light') {
          document.documentElement.classList.remove('dark');
        } else {
          document.documentElement.classList.add('dark');
        }
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, `users/${user.uid}/settings/info`);
    });

    // Listen to user long-term facts memories
    const memoriesQuery = query(collection(db, 'users', user.uid, 'memories'), orderBy('createdAt', 'desc'));
    const memoriesUnsub = onSnapshot(memoriesQuery, (snapshot) => {
      const items: Memory[] = [];
      snapshot.forEach(docSnap => {
        items.push(docSnap.data() as Memory);
      });
      setMemories(items);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, `users/${user.uid}/memories`);
    });

    return () => {
      profileUnsub();
      settingsUnsub();
      memoriesUnsub();
    };
  }, [user]);

  // 3. Sync Conversations belonging to current user
  useEffect(() => {
    if (!user) return;

    const convoQuery = query(
      collection(db, 'conversations'), 
      where('userId', '==', user.uid),
      orderBy('updatedAt', 'desc')
    );

    const unsubscribe = onSnapshot(convoQuery, (snapshot) => {
      const items: Conversation[] = [];
      snapshot.forEach(docSnap => {
        items.push(docSnap.data() as Conversation);
      });
      setConversations(items);

      // Auto-focus the newest conversation if none active
      if (items.length > 0 && !activeConversationId) {
        setActiveConversationId(items[0].id);
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'conversations');
    });

    return () => unsubscribe();
  }, [user, activeConversationId]);

  // 4. Sync Chronological messages for active conversation
  useEffect(() => {
    if (!user || !activeConversationId) {
      setMessages([]);
      return;
    }

    const messagesQuery = query(
      collection(db, 'conversations', activeConversationId, 'messages'),
      where('userId', '==', user.uid)
    );

    const unsubscribe = onSnapshot(messagesQuery, (snapshot) => {
      const msgs: Message[] = [];
      snapshot.forEach(docSnap => {
        msgs.push(docSnap.data() as Message);
      });
      // Sort in-memory chronologically to avoid needing a composite index
      msgs.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
      setMessages(msgs);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, `conversations/${activeConversationId}/messages`);
    });

    return () => unsubscribe();
  }, [user, activeConversationId]);

  // Sync guest data from and to localStorage
  useEffect(() => {
    if (!user) {
      try {
        const storedConvos = localStorage.getItem('aez_guest_convos');
        const storedMessages = localStorage.getItem('aez_guest_messages');
        const storedActiveId = localStorage.getItem('aez_guest_active_id');

        const parsedConvos = storedConvos ? JSON.parse(storedConvos) : [];
        const parsedMsgs = storedMessages ? JSON.parse(storedMessages) : [];

        setGuestConversations(parsedConvos);
        setGuestMessages(parsedMsgs);
        if (storedActiveId) {
          setActiveConversationId(storedActiveId);
        } else if (parsedConvos.length > 0) {
          setActiveConversationId(parsedConvos[0].id);
        }
      } catch (e) {
        console.error("Localstorage guest synchronization failed:", e);
      }
    }
  }, [user]);

  const saveGuestData = (convos: Conversation[], msgs: Message[], activeId: string | null) => {
    localStorage.setItem('aez_guest_convos', JSON.stringify(convos));
    localStorage.setItem('aez_guest_messages', JSON.stringify(msgs));
    if (activeId) {
      localStorage.setItem('aez_guest_active_id', activeId);
    } else {
      localStorage.removeItem('aez_guest_active_id');
    }
  };

  const incrementTrial = () => {
    const nextVal = trialCount + 1;
    setTrialCount(nextVal);
    localStorage.setItem('aez_trial_count', String(nextVal));
    return nextVal;
  };

  // Authentication trigger functions
  const handleSignInWithGoogle = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (e: any) {
      let friendlyMsg = e.message || "Google Sign In failed.";
      if (e.code === 'auth/unauthorized-domain' || friendlyMsg.includes("unauthorized-domain")) {
        friendlyMsg = "Google Sign In failure (" + e.code + "):\n\n" +
          "Your current host domain (like 'immature.vercel.app') is not yet whitelisted in your Firebase project.\n\n" +
          "To fix this, go to your Firebase Console -> Authentication -> Settings tab -> Authorized Domains, and add 'immature.vercel.app' to the list, then refresh this page!";
      }
      throw new Error(friendlyMsg);
    }
  };

  const handleSignInWithEmail = async (email: string, pass: string, isSignUp: boolean, displayName?: string) => {
    try {
      if (isSignUp) {
        const credentials = await createUserWithEmailAndPassword(auth, email, pass);
        // Wait for Auth Listener to setup, append nickname
        if (credentials.user) {
          await setDoc(doc(db, 'users', credentials.user.uid), {
            uid: credentials.user.uid,
            email: email,
            displayName: displayName || email.split('@')[0],
            createdAt: new Date().toISOString()
          }, { merge: true });
        }
      } else {
        await signInWithEmailAndPassword(auth, email, pass);
      }
    } catch (err: any) {
      let friendlyMsg = err.message || "Authentication failed.";
      if (err.code === 'auth/operation-not-allowed' || friendlyMsg.includes('auth/operation-not-allowed') || friendlyMsg.includes('operation-not-allowed')) {
        friendlyMsg = "Email/Password sign-in is disabled in your Firebase console.\n\n" +
          "Please fix this with these steps:\n" +
          "1. Go to Firebase Console -> Authentication -> Sign-in Method.\n" +
          "2. Click 'Add new provider', select 'Email/Password', toggle it to Enabled, and Save.\n" +
          "3. Also go to the Settings tab -> Authorized Domains and ensure 'immature.vercel.app' is added to the Authorized Domains list.";
      }
      throw new Error(friendlyMsg);
    }
  };

  const handleSendResetEmail = async (email: string) => {
    await sendPasswordResetEmail(auth, email);
  };

  const handleSignOut = async () => {
    await signOut(auth);
  };

  // Settings modification
  const handleUpdateSettings = async (updates: Partial<UserSettings>) => {
    if (!user) {
      setSettings(prev => {
        const updated = { ...prev, ...updates };
        if (updated.theme === 'light') {
          document.documentElement.classList.remove('dark');
        } else {
          document.documentElement.classList.add('dark');
        }
        return updated;
      });
      return;
    }
    try {
      const settingsRef = doc(db, 'users', user.uid, 'settings', 'info');
      await updateDoc(settingsRef, updates);
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, `users/${user.uid}/settings/info`);
    }
  };

  // Conversation modification triggers
  const handleNewConversation = async () => {
    if (!user) {
      const newConvoId = 'convo_' + Math.random().toString(36).substring(2, 11);
      const newConvo: Conversation = {
        id: newConvoId,
        userId: 'guest',
        title: 'New conversation',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      const updatedConvos = [newConvo, ...guestConversations];
      setGuestConversations(updatedConvos);
      setActiveConversationId(newConvoId);
      saveGuestData(updatedConvos, guestMessages, newConvoId);
      return;
    }
    try {
      const newConvoId = doc(collection(db, 'conversations')).id;
      const newConvo: Conversation = {
        id: newConvoId,
        userId: user.uid,
        title: 'New conversation',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      await setDoc(doc(db, 'conversations', newConvoId), newConvo);
      setActiveConversationId(newConvoId);
    } catch (e) {
      handleFirestoreError(e, OperationType.CREATE, 'conversations');
    }
  };

  const handleDeleteConversation = async (id: string) => {
    if (!user) {
      const updatedConvos = guestConversations.filter(c => c.id !== id);
      const updatedMessages = guestMessages.filter(m => m.conversationId !== id);
      setGuestConversations(updatedConvos);
      setGuestMessages(updatedMessages);
      const nextActiveId = activeConversationId === id 
        ? (updatedConvos.length > 0 ? updatedConvos[0].id : null) 
        : activeConversationId;
      setActiveConversationId(nextActiveId);
      saveGuestData(updatedConvos, updatedMessages, nextActiveId);
      return;
    }
    try {
      await deleteDoc(doc(db, 'conversations', id));
      if (activeConversationId === id) {
        setActiveConversationId(null);
      }
    } catch (e) {
      handleFirestoreError(e, OperationType.DELETE, `conversations/${id}`);
    }
  };

  // Memories dynamic management controls
  const handleAddMemory = async (content: string, type: 'fact' | 'preference' | 'instruction') => {
    if (!user) return;
    try {
      const memId = doc(collection(db, 'users', user.uid, 'memories')).id;
      const newMem: Memory = {
        id: memId,
        userId: user.uid,
        content,
        type,
        createdAt: new Date().toISOString()
      };
      await setDoc(doc(db, 'users', user.uid, 'memories', memId), newMem);
    } catch (e) {
      handleFirestoreError(e, OperationType.CREATE, `users/${user.uid}/memories`);
    }
  };

  const handleDeleteMemory = async (id: string) => {
    if (!user) return;
    try {
      await deleteDoc(doc(db, 'users', user.uid, 'memories', id));
    } catch (e) {
      handleFirestoreError(e, OperationType.DELETE, `users/${user.uid}/memories/${id}`);
    }
  };

  const handleUpdateMemory = async (id: string, content: string, type: 'fact' | 'preference' | 'instruction') => {
    if (!user) return;
    try {
      const memRef = doc(db, 'users', user.uid, 'memories', id);
      await updateDoc(memRef, { content, type });
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, `users/${user.uid}/memories/${id}`);
    }
  };

  // Stream stop signal
  const handleStopStreaming = () => {
    if (abortController) {
      abortController.abort();
      setIsStreaming(false);
      setAbortController(null);
    }
  };

  // Send textual prompts and files base64 directly to Backend Gemini Proxies
  const handleSendMessage = async (text: string, attachmentsList: MessageAttachment[]) => {
    if (!user) {
      if (trialCount >= TRIAL_LIMIT) {
        alert(`AEZ Guest Trial Limit Reached (${TRIAL_LIMIT}/${TRIAL_LIMIT}). Please sign in or register a new AEZ Ai Account in the sidebar to unlock unlimited high-fidelity conversational access!`);
        return;
      }

      let convoId = activeConversationId;
      let nextConvos = [...guestConversations];
      
      // Auto initiate a new chat thread if type prompt while idle
      if (!convoId) {
        convoId = 'convo_' + Math.random().toString(36).substring(2, 11);
        const newConvo: Conversation = {
          id: convoId,
          userId: 'guest',
          title: text.slice(0, 40) || 'New conversation',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
        nextConvos = [newConvo, ...nextConvos];
        setGuestConversations(nextConvos);
        setActiveConversationId(convoId);
      } else {
        // Auto renaming untitled conversations
        const currentConvo = nextConvos.find(c => c.id === convoId);
        if (currentConvo && currentConvo.title === 'New conversation') {
          currentConvo.title = text.slice(0, 60) || 'Discussion';
          setGuestConversations(nextConvos);
        }
      }

      // Prepare fresh message document Locally
      const userMessageId = 'msg_' + Math.random().toString(36).substring(2, 11);
      const userMessage: Message = {
        id: userMessageId,
        conversationId: convoId,
        userId: 'guest',
        role: 'user',
        content: text,
        createdAt: new Date().toISOString(),
        attachments: attachmentsList.map(item => ({
          name: item.name,
          type: item.type,
          size: item.size,
          base64: item.base64
        }))
      };

      const nextMessages = [...guestMessages, userMessage];
      setGuestMessages(nextMessages);
      saveGuestData(nextConvos, nextMessages, convoId);

      // Increment limits
      incrementTrial();

      // Launch connection to backend SSE API
      setIsStreaming(true);
      setCurrentStreamText('');
      setCurrentCitations([]);
      
      const controller = new AbortController();
      setAbortController(controller);

      // Filter message context historical array
      const historyPayload = nextMessages
        .filter(m => m.conversationId === convoId)
        .slice(-10)
        .map(m => ({
          role: m.role,
          content: m.content
        }));

      try {
        const streamAccumulator = await streamGeminiResponse(
          text,
          historyPayload,
          searchEnabled,
          attachmentsList,
          (chunk) => {
            setCurrentStreamText(chunk);
          },
          (citations) => {
            setCurrentCitations(citations);
          },
          controller.signal,
          settings.geminiApiKey
        );

        // Finish streaming and write AI answer in database securely
        if (streamAccumulator) {
          const aiMessageId = 'msg_' + Math.random().toString(36).substring(2, 11);
          const aiMessage: Message = {
            id: aiMessageId,
            conversationId: convoId,
            userId: 'guest',
            role: 'assistant',
            content: streamAccumulator,
            createdAt: new Date().toISOString()
          };
          const finalMessages = [...nextMessages, aiMessage];
          setGuestMessages(finalMessages);
          saveGuestData(nextConvos, finalMessages, convoId);
        }

      } catch (err: any) {
        if (err.name === 'AbortError') {
          console.log("Streaming interrupted by user action.");
        } else {
          console.error("Critical Stream Interruption: ", err);
        }
      } finally {
        setIsStreaming(false);
        setCurrentStreamText('');
        setAbortController(null);
      }
      return;
    }

    let convoId = activeConversationId;
    
    // Auto initiate a new chat thread if type prompt while idle
    if (!convoId) {
      convoId = doc(collection(db, 'conversations')).id;
      const newConvo: Conversation = {
        id: convoId,
        userId: user.uid,
        title: text.slice(0, 40) || 'New conversation',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      await setDoc(doc(db, 'conversations', convoId), newConvo);
      setActiveConversationId(convoId);
    } else {
      // Auto renaming untitled conversations
      const currentConvo = conversations.find(c => c.id === convoId);
      if (currentConvo && currentConvo.title === 'New conversation') {
        await updateDoc(doc(db, 'conversations', convoId), {
          title: text.slice(0, 60) || 'Discussion'
        });
      }
    }

    // Prepare fresh message document in Firestore (Client)
    const userMessageId = doc(collection(db, 'conversations', convoId, 'messages')).id;
    const userMessage: Message = {
      id: userMessageId,
      conversationId: convoId,
      userId: user.uid,
      role: 'user',
      content: text,
      createdAt: new Date().toISOString(),
      attachments: attachmentsList.map(item => ({
        name: item.name,
        type: item.type,
        size: item.size,
        base64: item.base64
      }))
    };

    await setDoc(doc(db, 'conversations', convoId, 'messages', userMessageId), userMessage);
    await updateDoc(doc(db, 'conversations', convoId), { updatedAt: new Date().toISOString() });

    // Launch connection to backend SSE API
    setIsStreaming(true);
    setCurrentStreamText('');
    setCurrentCitations([]);
    
    const controller = new AbortController();
    setAbortController(controller);

    // Filter message context historical array
    const historyPayload = messages.slice(-10).map(m => ({
      role: m.role,
      content: m.content
    }));

    // Prepend user directive memories into systemic history to build context
    if (memories.length > 0) {
      const serializedMems = memories.map(m => `User Stored ${m.type}: "${m.content}"`).join('\n');
      historyPayload.unshift({
        role: 'user',
        content: `IMPORTANT: Remember these long-term preferences, facts, and directives:\n${serializedMems}\nEnsure your responses adapt cleanly!`
      });
    }

    try {
      const streamAccumulator = await streamGeminiResponse(
        text,
        historyPayload,
        searchEnabled,
        attachmentsList,
        (chunk) => {
          setCurrentStreamText(chunk);
        },
        (citations) => {
          setCurrentCitations(citations);
        },
        controller.signal,
        settings.geminiApiKey
      );

      // Finish streaming and write AI answer in database securely
      if (streamAccumulator) {
        const aiMessageId = doc(collection(db, 'conversations', convoId, 'messages')).id;
        const aiMessage: Message = {
          id: aiMessageId,
          conversationId: convoId,
          userId: user.uid,
          role: 'assistant',
          content: streamAccumulator,
          createdAt: new Date().toISOString()
        };
        await setDoc(doc(db, 'conversations', convoId, 'messages', aiMessageId), aiMessage);
        await updateDoc(doc(db, 'conversations', convoId), { updatedAt: new Date().toISOString() });
      }

    } catch (err: any) {
      if (err.name === 'AbortError') {
        console.log("Streaming interrupted by user action.");
      } else {
        console.error("Critical Stream Interruption: ", err);
      }
    } finally {
      setIsStreaming(false);
      setCurrentStreamText('');
      setAbortController(null);
    }
  };

  // Trigger function to handle direct text uploads from Live Voice modal
  const handleVoiceSendResponse = async (transcribedPrompt: string): Promise<string> => {
    if (!user) {
      if (trialCount >= TRIAL_LIMIT) {
        return `AEZ Guest Trial Limit Reached (${TRIAL_LIMIT}/${TRIAL_LIMIT}). Please sign in or register a new account in the sidebar to continue talking!`;
      }

      let convoId = activeConversationId;
      let nextConvos = [...guestConversations];

      if (!convoId) {
        convoId = 'convo_' + Math.random().toString(36).substring(2, 11);
        const newConvo: Conversation = {
          id: convoId,
          userId: 'guest',
          title: transcribedPrompt.slice(0, 40) || 'New voice chat',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
        nextConvos = [newConvo, ...nextConvos];
        setGuestConversations(nextConvos);
        setActiveConversationId(convoId);
      }

      const userMessageId = 'msg_' + Math.random().toString(36).substring(2, 11);
      const userMsg: Message = {
        id: userMessageId,
        conversationId: convoId,
        userId: 'guest',
        role: 'user',
        content: transcribedPrompt,
        createdAt: new Date().toISOString()
      };
      
      const nextMessages = [...guestMessages, userMsg];
      setGuestMessages(nextMessages);
      saveGuestData(nextConvos, nextMessages, convoId);

      incrementTrial();

      let accumulated = '';
      try {
        accumulated = await streamGeminiResponse(
          transcribedPrompt,
          nextMessages.filter(m => m.conversationId === convoId).slice(-5).map(m => ({ role: m.role, content: m.content })),
          false,
          [],
          (chunk) => {
            accumulated = chunk;
          },
          undefined,
          undefined,
          settings.geminiApiKey
        );
      } catch (err: any) {
        console.error("Voice response failed:", err);
      }

      if (accumulated) {
        const aiMessageId = 'msg_' + Math.random().toString(36).substring(2, 11);
        const aiMessage: Message = {
          id: aiMessageId,
          conversationId: convoId,
          userId: 'guest',
          role: 'assistant',
          content: accumulated,
          createdAt: new Date().toISOString()
        };
        const finalMessages = [...nextMessages, aiMessage];
        setGuestMessages(finalMessages);
        saveGuestData(nextConvos, finalMessages, convoId);
      }

      return accumulated;
    }

    if (!activeConversationId) return "Sign in or trigger conversation first.";

    // Append to Firestore
    const userMessageId = doc(collection(db, 'conversations', activeConversationId, 'messages')).id;
    const userMsg: Message = {
      id: userMessageId,
      conversationId: activeConversationId,
      userId: user.uid,
      role: 'user',
      content: transcribedPrompt,
      createdAt: new Date().toISOString()
    };
    await setDoc(doc(db, 'conversations', activeConversationId, 'messages', userMessageId), userMsg);

    let accumulated = '';
    try {
      accumulated = await streamGeminiResponse(
        transcribedPrompt,
        messages.slice(-5).map(m => ({ role: m.role, content: m.content })),
        false,
        [],
        (chunk) => {
          accumulated = chunk;
        },
        undefined,
        undefined,
        settings.geminiApiKey
      );
    } catch (err: any) {
      console.error("Authenticated User voice chat failed:", err);
    }

    // Save AI
    const aiMessageId = doc(collection(db, 'conversations', activeConversationId, 'messages')).id;
    await setDoc(doc(db, 'conversations', activeConversationId, 'messages', aiMessageId), {
      id: aiMessageId,
      conversationId: activeConversationId,
      userId: user.uid,
      role: 'assistant',
      content: accumulated,
      createdAt: new Date().toISOString()
    });

    return accumulated;
  };

  // Helper values
  const visibleConversations = user ? conversations : guestConversations;
  const visibleMessages = user ? messages : guestMessages.filter(m => m.conversationId === activeConversationId);
  const activeConvo = visibleConversations.find(c => c.id === activeConversationId);

  return (
    <div className={`h-screen w-screen flex overflow-hidden transition-colors ${
      settings.theme === 'light' ? 'bg-white text-neutral-850' : 'bg-[#0A0A0A] text-gray-200'
    }`}>
      
      {/* 1. Left Sidebar Navigation Panel */}
      <div className={`h-full shrink-0 z-30 transition-all ${
        sidebarOpen ? 'fixed inset-y-0 left-0 w-80 shadow-2xlTranslateX(0)' : 'md:translate-x-0 hidden md:block'
      }`}>
        <Sidebar
          conversations={visibleConversations}
          activeId={activeConversationId}
          onSelectConversation={(id) => {
            setActiveConversationId(id);
            setSidebarOpen(false);
          }}
          onNewConversation={() => {
            handleNewConversation();
            setSidebarOpen(false);
          }}
          onDeleteConversation={handleDeleteConversation}
          searchQuery={searchQuery}
          onSearchQueryChange={setSearchQuery}
          user={user}
          userProfile={userProfile}
          settings={settings}
          onUpdateSettings={handleUpdateSettings}
          onSignInWithGoogle={handleSignInWithGoogle}
          onSignInWithEmail={handleSignInWithEmail}
          onSendResetEmail={handleSendResetEmail}
          onSignOut={handleSignOut}
          onOpenMemories={() => setIsMemoriesOpen(true)}
        />
      </div>

      {/* Mobile responsive Sidebar Close Overlay */}
      {sidebarOpen && (
        <div 
          onClick={() => setSidebarOpen(false)}
          className="fixed inset-0 bg-black/50 z-20 md:hidden"
        />
      )}

      {/* 2. Main Area Frame Layout */}
      <div className="flex-1 h-full flex flex-col relative overflow-hidden">
        
        {/* Main Content Header */}
        <header className="h-14 border-b flex items-center justify-between px-4 shrink-0 bg-[#0A0A0A] border-[#262626]">
          <div className="flex items-center gap-3">
            {/* Toggle mobile sidebar */}
            <button
              onClick={() => setSidebarOpen(true)}
              className="p-1.5 rounded-lg -ml-1 text-neutral-400 hover:text-white hover:bg-neutral-900 md:hidden cursor-pointer"
            >
              <Menu size={18} />
            </button>
            
            <div className="min-w-0">
               <h1 className="font-semibold text-xs tracking-tight text-white p-0 m-0 truncate">
                {activeConvo ? activeConvo.title : "AEZ Ai Multimodal Suite"}
              </h1>
              {activeConvo ? (
                <span className="text-[9px] text-gray-500 font-mono">
                  UPDATED: {new Date(activeConvo.updatedAt).toLocaleTimeString()}
                </span>
              ) : (
                <div className="flex items-center gap-1.5 rounded-full border border-[#262626] bg-[#111111] px-2.5 py-0.5 text-[9px] font-medium text-gray-400">
                  <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse"></span>
                  Gemini 3.5 Pro Ready
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Download Export component dropdown */}
            {visibleMessages.length > 0 && (
              <FileExporter
                messages={visibleMessages}
                conversationTitle={activeConvo?.title || "chat_log"}
              />
            )}

            {/* Live Wave Pulsing Audio Levels from Theme spec */}
            <div className="flex h-8 items-center justify-center gap-1 rounded-full border border-[#8B5CF6]/30 bg-[#8B5CF6]/5 px-2.5">
              <div className="h-2.5 w-[2px] bg-[#8B5CF6] rounded-full animate-pulse"></div>
              <div className="h-4 w-[2px] bg-[#8B5CF6] rounded-full animate-pulse" style={{ animationDelay: '75ms' }}></div>
              <div className="h-2 w-[2px] bg-[#8B5CF6] rounded-full animate-pulse" style={{ animationDelay: '150ms' }}></div>
              <div className="h-3.5 w-[2px] bg-[#8B5CF6] rounded-full animate-pulse" style={{ animationDelay: '225ms' }}></div>
              <span className="ml-1 text-[10px] font-bold text-[#8B5CF6] tracking-wider uppercase font-mono">Live</span>
            </div>

            {/* If user not signed in header block */}
            {!user && (
              <div className="flex items-center gap-1.5 p-1 bg-yellow-950/20 border border-yellow-905/35 rounded-lg text-amber-500 text-[10px] uppercase font-mono px-2.5">
                <LogIn size={11} />
                <span>Guest Mode</span>
              </div>
            )}
          </div>
        </header>

        {/* 3. Primary interactive chat thread bubble renderers */}
        <div className="flex-1 overflow-hidden relative">
          <ChatArea
            messages={visibleMessages}
            isStreaming={isStreaming}
            currentStreamText={currentStreamText}
            activeConversationId={activeConversationId}
            userProfile={userProfile}
            onSelectSuggestion={(txt) => {
              if (txt === "Initiate continuous live voice conversation") {
                setIsVoiceOpen(true);
              } else {
                handleSendMessage(txt, []);
              }
            }}
            metadataSources={currentCitations.length > 0 ? currentCitations : undefined}
          />
        </div>

        {/* 4. Bottom Sticky Input console and controllers */}
        <div className="p-4 shrink-0 bg-transparent">
          <InputArea
            onSendMessage={handleSendMessage}
            isStreaming={isStreaming}
            onStopStreaming={handleStopStreaming}
            searchEnabled={searchEnabled}
            onToggleSearch={() => setSearchEnabled(prev => !prev)}
            onOpenVoiceAssistant={() => setIsVoiceOpen(true)}
            isGuest={!user}
            trialCount={trialCount}
            maxTrials={TRIAL_LIMIT}
          />
        </div>

        {/* 5. Sub Module Overlay Windows */}
        <VoiceAssistant
          isOpen={isVoiceOpen}
          onClose={() => setIsVoiceOpen(false)}
          voiceConfig={{
            voiceName: settings.voiceName,
            speed: settings.voiceSpeed,
            pitch: settings.voicePitch
          }}
          onUpdateVoiceConfig={async (cfg) => {
            const updates: Partial<UserSettings> = {};
            if (cfg.voiceName !== undefined) updates.voiceName = cfg.voiceName;
            if (cfg.speed !== undefined) updates.voiceSpeed = cfg.speed;
            if (cfg.pitch !== undefined) updates.voicePitch = cfg.pitch;
            await handleUpdateSettings(updates);
          }}
          onSendTextMessage={handleVoiceSendResponse}
        />

        <MemoryPanel
          isOpen={isMemoriesOpen}
          onClose={() => setIsMemoriesOpen(false)}
          memories={memories}
          onAddMemory={handleAddMemory}
          onDeleteMemory={handleDeleteMemory}
          onUpdateMemory={handleUpdateMemory}
        />
      </div>
    </div>
  );
}
