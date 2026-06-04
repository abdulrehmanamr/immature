import express from "express";
import path from "path";
import http from "http";
import { WebSocketServer, WebSocket } from "ws";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

// Initialize Express
const app = express();
const PORT = 3000;

// Set up json parser with large limits to support uploading PDFs/large images
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

// Lazy init of GoogleGenAI
let aiInstance: GoogleGenAI | null = null;
function getGeminiClient(): GoogleGenAI {
  if (!aiInstance) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY environment variable is missing.");
    }
    aiInstance = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });
  }
  return aiInstance;
}

// 1. Regular AI Chat & Search Grounding API
app.post("/api/gemini/chat", async (req, res) => {
  try {
    const ai = getGeminiClient();
    const { message, history, searchEnabled, attachments } = req.body;

    if (!message) {
      return res.status(400).json({ error: "Message is required" });
    }

    // Build the parts payload
    const parts: any[] = [];

    // Add attachments as inlineData
    if (attachments && Array.isArray(attachments)) {
      for (const attachment of attachments) {
        if (attachment.base64) {
          // Extract cleaner base64 (removing headings like "data:image/png;base64,")
          let cleanBase64 = attachment.base64;
          if (cleanBase64.includes(";base64,")) {
            cleanBase64 = cleanBase64.split(";base64,").pop() || "";
          }
          parts.push({
            inlineData: {
              data: cleanBase64,
              mimeType: attachment.type,
            },
          });
        }
      }
    }

    // Add main text prompt
    parts.push({ text: message });

    // Format chat contents
    const contents: any[] = [];
    if (history && Array.isArray(history)) {
      for (const h of history) {
        contents.push({
          role: h.role === "user" ? "user" : "model",
          parts: [{ text: h.content }],
        });
      }
    }

    // Add the current prompt turn
    contents.push({
      role: "user",
      parts,
    });

    const tools: any[] = [];
    if (searchEnabled) {
      tools.push({ googleSearch: {} });
    }

    // Call Gemini API Stream
    const responseStream = await ai.models.generateContentStream({
      model: "gemini-3.5-flash",
      contents,
      config: {
        systemInstruction: "You are AEZ Ai, a Claude-level elite AI Assistant built to think step-by-step, explain complex algorithms, read files/PDFs, understand code/diagrams, and analyze screenshots. Format math variables in Markdown and code blocks using standard tags with specified languages. Ground searches where helpful.",
        tools: tools.length > 0 ? tools : undefined,
      },
    });

    // Set headers for SSE
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    let groundingMetadata: any = null;

    for await (const chunk of responseStream) {
      const text = chunk.text || "";
      // Save grounding details if they appear
      if (chunk.candidates?.[0]?.groundingMetadata) {
        groundingMetadata = chunk.candidates[0].groundingMetadata;
      }
      res.write(`data: ${JSON.stringify({ text })}\n\n`);
    }

    if (groundingMetadata) {
      res.write(`data: ${JSON.stringify({ groundingMetadata })}\n\n`);
    }

    res.write("data: [DONE]\n\n");
    res.end();
  } catch (error: any) {
    console.error("Error in chat endpoint:", error);
    res.status(500).json({ error: error.message || "Internal Server Error" });
  }
});

// 2. Text-To-Speech API using gemini-3.1-flash-tts-preview
app.post("/api/gemini/tts", async (req, res) => {
  try {
    const ai = getGeminiClient();
    const { text, voiceName } = req.body;

    if (!text) {
      return res.status(400).json({ error: "Text is required" });
    }

    const voice = voiceName || "Zephyr"; // Puck, Charon, Kore, Fenrir, Zephyr

    const response = await ai.models.generateContent({
      model: "gemini-3.1-flash-tts-preview",
      contents: [{ parts: [{ text: `Please speak: ${text}` }] }],
      config: {
        responseModalities: ["AUDIO"],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: voice },
          },
        },
      },
    });

    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (base64Audio) {
      return res.json({ audio: base64Audio });
    } else {
      return res.status(500).json({ error: "No voice audio synthesized by the AI model." });
    }
  } catch (error: any) {
    console.error("Error in TTS endpoint:", error);
    res.status(500).json({ error: error.message || "Failed to synthesize speech." });
  }
});

// 3. Create HTTP Server to attach Websockets safely
const server = http.createServer(app);

// Initialize Websocket Server
const wss = new WebSocketServer({ noServer: true });

wss.on("connection", async (clientWs: WebSocket) => {
  console.log("WebSocket client connected to live voice bridge.");
  let liveSession: any = null;

  try {
    const ai = getGeminiClient();

    // Connect to the Gemini Live API
    liveSession = await ai.live.connect({
      model: "gemini-3.1-flash-live-preview",
      callbacks: {
        onmessage: (message: any) => {
          // Model output audio chunk
          const audio = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
          if (audio) {
            clientWs.send(JSON.stringify({ audio }));
          }

          // Model transcriptions (input or output)
          // We can send these forward to improve the user UI experience
          if (message.serverContent?.modelTurn?.parts?.[0]?.text) {
            clientWs.send(JSON.stringify({ text: message.serverContent.modelTurn.parts[0].text }));
          }

          if (message.serverContent?.interrupted) {
            clientWs.send(JSON.stringify({ interrupted: true }));
          }
        },
      },
      config: {
        responseModalities: ["AUDIO" as any],
        speechConfig: {
          voiceConfig: { prebuiltVoiceConfig: { voiceName: "Zephyr" } }, // Zephyr, Puck, Charon, Kore, Fenrir
        },
        systemInstruction: "You are AEZ Ai in continuous voice conversation mode. Rely on spoken language guidelines. Keep responses short, concise, natural, and helpful.",
      },
    });

    // Feed client microphone chunks to Gemini Live
    clientWs.on("message", (rawBytes) => {
      try {
        const payload = JSON.parse(rawBytes.toString());
        if (payload.audio) {
          liveSession.sendRealtimeInput({
            audio: {
              data: payload.audio,
              mimeType: "audio/pcm;rate=16000",
            },
          });
        }
      } catch (e) {
        // ignore JSON errors or empty pings
      }
    });

    clientWs.on("close", () => {
      console.log("WebSocket connection closed, closing Gemini live session.");
      if (liveSession) {
        try {
          // Clean up live session
          liveSession.close();
        } catch (e) {
          // already closed
        }
      }
    });

  } catch (err: any) {
    console.error("Live WebSockets error:", err);
    clientWs.send(JSON.stringify({ error: err.message }));
    clientWs.close();
  }
});

// Bridge request upgrades to the WebSocket paths
server.on("upgrade", (request, socket, head) => {
  const pathname = new URL(request.url || "", `http://${request.headers.host}`).pathname;
  if (pathname === "/api/live") {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit("connection", ws, request);
    });
  } else {
    // Let normal connection proceed
  }
});

// Setup Vite Dev Server / Static Ingress
async function setupViteMiddleware() {
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
    console.log("Vite dev server mounted on Express.");
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
    console.log("Serving build files in production mode.");
  }

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Server listening on port http://0.0.0.0:${PORT}`);
  });
}

setupViteMiddleware();
