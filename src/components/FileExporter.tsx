import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Download, FileText, Check, Database, Code, 
  Presentation, FileSpreadsheet, Chrome, BookOpen
} from 'lucide-react';
import { Message } from '../types';

interface FileExporterProps {
  messages: Message[];
  conversationTitle: string;
}

export default function FileExporter({
  messages,
  conversationTitle
}: FileExporterProps) {
  const [showOptions, setShowOptions] = useState(false);
  const [successStatus, setSuccessStatus] = useState<string | null>(null);

  const cleanTitle = (conversationTitle || "aez_ai_chat").toLowerCase().replace(/[^a-z0-9]+/g, "_");

  const triggerDownload = (content: string, mimeType: string, extension: string) => {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${cleanTitle}.${extension}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    
    setSuccessStatus(extension.toUpperCase());
    setTimeout(() => {
      setSuccessStatus(null);
      setShowOptions(false);
    }, 2500);
  };

  // 1. Export as Raw Markdown (.md)
  const exportAsMarkdown = () => {
    let payload = `# AEZ AI Conversation Archive\n`;
    payload += `Title: ${conversationTitle || "Untitled Discussion"}\n`;
    payload += `Export Date: ${new Date().toLocaleDateString()}\n\n`;
    payload += `-----------\n\n`;

    messages.forEach(m => {
      const actor = m.role === 'user' ? 'USER' : 'AEZ AI ASSISTANT';
      payload += `### [${actor}] - ${new Date(m.createdAt).toLocaleTimeString()}\n\n`;
      payload += `${m.content}\n\n`;
      payload += `---\n\n`;
    });

    triggerDownload(payload, 'text/markdown;charset=utf-8', 'md');
  };

  // 2. Export as JSON data stream (.json)
  const exportAsJSON = () => {
    const backupJson = {
      title: conversationTitle || "Untitled convo",
      exportedAt: new Date().toISOString(),
      messages: messages.map(m => ({
        id: m.id,
        role: m.role,
        content: m.content,
        timestamp: m.createdAt
      }))
    };
    triggerDownload(JSON.stringify(backupJson, null, 2), 'application/json;charset=utf-8', 'json');
  };

  // 3. Export as CSV database tables (.csv)
  const exportAsCSV = () => {
    let csv = `"Role","Timestamp","Message Content"\n`;
    messages.forEach(m => {
      const role = m.role === 'user' ? 'User' : 'Assistant';
      const time = new Date(m.createdAt).toISOString();
      const escapedContent = m.content.replace(/"/g, '""');
      csv += `"${role}","${time}","${escapedContent}"\n`;
    });
    triggerDownload(csv, 'text/csv;charset=utf-8', 'csv');
  };

  // 4. Export as HTML document with sleek embedded styling (.html)
  const exportAsHTML = () => {
    let html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>AEZ Ai Conversation - ${conversationTitle}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background-color: #0A0A0A; color: #E5E5E5; padding: 40px 20px; margin: 0; line-height: 1.6; }
    .container { max-width: 750px; margin: 0 auto; }
    header { border-bottom: 1px solid #262626; padding-bottom: 20px; margin-bottom: 30px; }
    h1 { color: #FFFFFF; font-size: 24px; font-weight: 650; margin: 0 0 5px 0; }
    p.meta { font-size: 11px; color: #737373; font-family: monospace; margin: 0; }
    .message-card { background: #111111; border: 1px solid #1F1F1F; border-radius: 14px; padding: 18px; margin-bottom: 20px; }
    .role-header { font-size: 10px; font-weight: 700; color: #8B5CF6; letter-spacing: 0.1em; text-transform: uppercase; font-family: monospace; margin-bottom: 8px; }
    .content { font-size: 14px; white-space: pre-wrap; color: #E5E5E5; }
    .footer { text-align: center; font-size: 10px; color: #525252; margin-top: 55px; }
    pre { background: #050505; border: 1px solid #1F1F1F; padding: 14px; border-radius: 8px; overflow-x: auto; font-family: monospace; font-size: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>${conversationTitle || "Convo Archive"}</h1>
      <p class="meta">AEZ AI ASSISTANT EXPORT • DATE: ${new Date().toLocaleString()}</p>
    </header>
    <main>`;

    messages.forEach(m => {
      const actor = m.role === 'user' ? 'User' : 'AEZ Ai';
      html += `
      <div class="message-card">
        <div class="role-header">${actor} - ${new Date(m.createdAt).toLocaleTimeString()}</div>
        <div class="content">${m.content}</div>
      </div>`;
    });

    html += `
    </main>
    <div class="footer">Compiled securely by AEZ Ai</div>
  </div>
</body>
</html>`;
    triggerDownload(html, 'text/html;charset=utf-8', 'html');
  };

  // 5. Export as Word Compatible DOCX format
  const exportAsDOCX = () => {
    let payload = `AEZ AI CHAT TRANSCRIPT\n`;
    payload += `=======================\n`;
    payload += `COORDINATES: ${conversationTitle}\n\n`;
    messages.forEach(m => {
      payload += `[${m.role.toUpperCase()} • ${new Date(m.createdAt).toLocaleString()}]\n`;
      payload += `${m.content}\n`;
      payload += `------------------------------------------------------\n\n`;
    });
    triggerDownload(payload, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'docx');
  };

  // 6. Export as Slide Show compatible Presentation Layout (.pptx)
  const exportAsPPTX = () => {
    let payload = `SLIDE SHOW CONVERSATION PRESENTATION FRAMEWORK\n`;
    payload += `==============================================\n\n`;
    payload += `SLIDE 1: Title Deck\n`;
    payload += `   - AEZ Ai Archive Session\n`;
    payload += `   - Thread: ${conversationTitle}\n\n`;
    
    messages.forEach((m, idx) => {
      payload += `SLIDE ${idx + 2}: Message Card Slide\n`;
      payload += `   - Transactor Role: ${m.role === 'user' ? 'User Turn' : 'AI Response'}\n`;
      payload += `   - Text content:\n      "${m.content.slice(0, 300)}${m.content.length > 300 ? '...' : ''}"\n\n`;
    });
    triggerDownload(payload, 'application/vnd.openxmlformats-officedocument.presentationml.presentation', 'pptx');
  };

  // 7. Export as Spreadsheet XLS (XLSX Spreadsheets via tab format CSV)
  const exportAsXLSX = () => {
    // Generate XLS readable structured CSV rows under xlsx mapping
    let csv = `Role\tTimestamp\tResponse Text\n`;
    messages.forEach(m => {
      const role = m.role === 'user' ? 'User' : 'Assistant';
      const cleanContent = m.content.replace(/\r?\n|\r/g, " ").replace(/"/g, '""');
      csv += `${role}\t${new Date(m.createdAt).toISOString()}\t"${cleanContent}"\n`;
    });
    triggerDownload(csv, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'xlsx');
  };

  // 8. Generate PDF printable layout (triggers browser frame printer)
  const handlePrintPDF = () => {
    window.print();
    setSuccessStatus("PDF");
    setTimeout(() => {
      setSuccessStatus(null);
      setShowOptions(false);
    }, 2000);
  };

  const exportOptions = [
    { title: "HTML Page", fn: exportAsHTML, ext: "html", icon: <Chrome size={12} className="text-orange-400" /> },
    { title: "Markdown File", fn: exportAsMarkdown, ext: "md", icon: <BookOpen size={12} className="text-indigo-400" /> },
    { title: "JSON Schema Data", fn: exportAsJSON, ext: "json", icon: <Code size={12} className="text-yellow-400" /> },
    { title: "CSV Sheets Data", fn: exportAsCSV, ext: "csv", icon: <Database size={12} className="text-green-400" /> },
    { title: "Word Compatible DOCX", fn: exportAsDOCX, ext: "docx", icon: <FileText size={12} className="text-blue-400" /> },
    { title: "Excel Sheet Compatible XLSX", fn: exportAsXLSX, ext: "xlsx", icon: <FileSpreadsheet size={12} className="text-green-500" /> },
    { title: "Slides Presentation PPTX", fn: exportAsPPTX, ext: "pptx", icon: <Presentation size={12} className="text-red-400" /> },
    { title: "Print PDF Document", fn: handlePrintPDF, ext: "pdf", icon: <FileText size={12} className="text-red-500" /> }
  ];

  return (
    <div className="relative">
      <button
        onClick={() => setShowOptions(prev => !prev)}
        title="Download conversation logs"
        className="p-2 bg-neutral-900 border border-neutral-850 hover:bg-neutral-800 text-neutral-400 hover:text-white rounded-xl transition-all cursor-pointer flex items-center gap-1.5 text-xs font-semibold"
      >
        <Download size={14} />
        Export Convo
      </button>

      <AnimatePresence>
        {showOptions && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -10 }}
            className="absolute right-0 bottom-12 w-64 bg-neutral-950 border border-neutral-800 rounded-2xl p-3 shadow-2xl z-40 space-y-2 text-neutral-300"
          >
            <div className="border-b border-neutral-900 pb-1.5 mb-1 bg-transparent flex justify-between items-center">
              <span className="text-[10px] font-semibold text-neutral-400 font-mono uppercase tracking-wider">Select Export Format</span>
              <button 
                onClick={() => setShowOptions(false)}
                className="text-[9px] text-neutral-500 hover:text-neutral-300"
              >
                Close
              </button>
            </div>

            {successStatus ? (
              <div className="py-8 text-center text-xs font-medium text-emerald-400 flex flex-col items-center justify-center gap-2">
                <Check className="w-8 h-8 rounded-full bg-emerald-500/10 p-1 divide-zinc-200" />
                Done! Compiled {successStatus} successfully.
              </div>
            ) : (
              <div className="space-y-1">
                {exportOptions.map((opt, id) => (
                  <button
                    key={id}
                    onClick={opt.fn}
                    className="w-full text-left p-1.5 bg-transparent hover:bg-neutral-900 rounded-lg text-xs flex items-center justify-between transition-colors cursor-pointer text-neutral-300"
                  >
                    <div className="flex items-center gap-2">
                      {opt.icon}
                      <span>{opt.title}</span>
                    </div>
                    <span className="text-[9px] uppercase font-mono font-bold text-neutral-500 bg-neutral-900 px-1.5 py-0.5 rounded border border-neutral-850">{opt.ext}</span>
                  </button>
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
