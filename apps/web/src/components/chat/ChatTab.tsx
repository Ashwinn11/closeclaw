import React, { useState, useEffect, useRef } from 'react';
import { useGateway } from '../../context/GatewayContext';
import { Send, MessageCircle, StopCircle, Copy, Loader2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import './ChatTab.css';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

// Sentinel strings must stay in sync with OpenClaw's buildInboundUserContextPrefix
const INBOUND_META_SENTINELS = [
  'Conversation info (untrusted metadata):',
  'Sender (untrusted metadata):',
  'Thread starter (untrusted, for context):',
  'Replied message (untrusted, for context):',
  'Forwarded message context (untrusted metadata):',
  'Chat history since last reply (untrusted, for context):',
];

// Envelope channel labels from OpenClaw's chat-envelope.ts
const ENVELOPE_CHANNELS = [
  'WebChat', 'WhatsApp', 'Telegram', 'Signal', 'Slack', 'Discord',
  'Google Chat', 'iMessage', 'Teams', 'Matrix', 'Zalo', 'Zalo Personal', 'BlueBubbles',
];

function cleanMessageText(text: string): { cleanText: string, sender: string | null } {
  let sender = null;
  let cleanText = text;

  // ── Extract sender before stripping (mirrors OpenClaw Conversation info block) ──
  const convoIdx = cleanText.indexOf('Conversation info (untrusted metadata):');
  if (convoIdx !== -1) {
    const jsonStart = cleanText.indexOf('```json', convoIdx);
    const jsonEnd = cleanText.indexOf('\n```', jsonStart + 7);
    if (jsonStart !== -1 && jsonEnd !== -1) {
      try {
        const parsed = JSON.parse(cleanText.slice(jsonStart + 7, jsonEnd).trim());
        sender = parsed.sender || null;
      } catch { /* ignore */ }
    }
  }

  // ── Strip metadata blocks: line-by-line state machine (mirrors strip-inbound-meta.ts) ──
  if (INBOUND_META_SENTINELS.some(s => cleanText.includes(s))) {
    const lines = cleanText.split('\n');
    const result: string[] = [];
    let inBlock = false;
    let inFence = false;

    for (const line of lines) {
      if (!inBlock && INBOUND_META_SENTINELS.some(s => line.startsWith(s))) {
        inBlock = true; inFence = false; continue;
      }
      if (inBlock) {
        if (!inFence && line.trim() === '```json') { inFence = true; continue; }
        if (inFence) {
          if (line.trim() === '```') { inBlock = false; inFence = false; }
          continue;
        }
        if (line.trim() === '') continue; // blank separator between consecutive blocks
        inBlock = false; // unexpected non-blank line — treat as user content
      }
      result.push(line);
    }
    cleanText = result.join('\n').replace(/^\n+/, '');
  }

  // ── Strip [message_id: ...] hint lines (mirrors stripMessageIdHints) ──────────
  if (cleanText.includes('[message_id:')) {
    cleanText = cleanText.split('\n')
      .filter(line => !/^\s*\[message_id:\s*[^\]]+\]\s*$/i.test(line))
      .join('\n');
  }

  // ── Strip inline directives (mirrors directive-tags.ts) ──────────────────────
  cleanText = cleanText.replace(/\[\[\s*audio_as_voice\s*\]\]/gi, '');
  cleanText = cleanText.replace(/\[\[\s*(?:reply_to_current|reply_to\s*:\s*([^\]\n]+))\s*\]\]/gi, '');

  // ── Strip envelope prefix from start of message (mirrors stripEnvelope) ──────
  // Only strip from the very beginning, same as OpenClaw's text.slice(match[0].length)
  cleanText = cleanText.replace(/^\[([^\]]+)\]\s*/, (match, header) => {
    const isDate = /\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(header);
    const isChannel = ENVELOPE_CHANNELS.some(ch => header === ch || header.startsWith(ch + ' '));
    return (isDate || isChannel) ? '' : match;
  });

  return { cleanText: cleanText.trim(), sender };
}

export const ChatTab: React.FC = () => {
  const { status, rpc, subscribe } = useGateway();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [runId, setRunId] = useState<string | null>(null);
  const [stream, setStream] = useState<string | null>(null);
  const [copiedText, setCopiedText] = useState<string | null>(null);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  // Dedup Gateway chat events — Gateway broadcasts every event twice:
  // once via broadcast() to all WS clients and once via nodeSendToSession().
  // Both copies arrive with identical runId+seq. Track seen keys to drop the duplicate.
  const seenEventKeys = useRef(new Set<string>());
  
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };
  
  useEffect(() => {
    scrollToBottom();
  }, [messages, stream]);

  useEffect(() => {
    if (status !== 'connected') return;

    let mounted = true;
    
    const loadHistory = async () => {
      setLoading(true);
      try {
        const res: any = await rpc("chat.history", { sessionKey: "main", limit: 200 });
        if (!mounted) return;
        
        const history: Message[] = [];
        let lastUserWasControlUi = true;

        if (res?.messages && Array.isArray(res.messages)) {
          res.messages.forEach((m: any) => {
            let effectiveRole = m.role || 'unknown';
            const hasToolId = typeof m.toolCallId === "string" || typeof m.tool_call_id === "string";
            const hasToolName = typeof m.toolName === "string" || typeof m.tool_name === "string";
            const hasToolContent = Array.isArray(m.content) && m.content.some((item: any) => 
               item.type?.toLowerCase() === "toolresult" || item.type?.toLowerCase() === "tool_result"
            );
            if (hasToolId || hasToolContent || hasToolName) {
               effectiveRole = "toolResult";
            }
            const isInterSession = m.provenance?.kind === "inter_session";

            if ((effectiveRole === 'user' || effectiveRole === 'assistant') && !isInterSession) {
              let text = '';
              if (Array.isArray(m.content)) {
                 m.content.forEach((b: any) => {
                   if (b.type === 'text' && typeof b.text === 'string') {
                     text += b.text;
                   }
                   if (b.type === 'image' && b.source?.data) {
                     text += '\n[Image Attachment]\n';
                   }
                 });
              } else if (typeof m.content === 'string') {
                 text = m.content;
              }
              if (text) {
                const { cleanText, sender } = cleanMessageText(text);
                
                if (effectiveRole === 'user') {
                  const isControlUi = sender === 'openclaw-control-ui' || sender === null;
                  lastUserWasControlUi = isControlUi;
                  if (isControlUi && cleanText) {
                    history.push({
                      role: 'user',
                      content: cleanText,
                      timestamp: m.timestamp || Date.now()
                    });
                  }
                } else if (effectiveRole === 'assistant') {
                  if (lastUserWasControlUi && cleanText) {
                    history.push({
                      role: 'assistant',
                      content: cleanText,
                      timestamp: m.timestamp || Date.now()
                    });
                  }
                }
              }
            }
          });
        }
        setMessages(history);
      } catch (err) {
        console.error("Failed to load chat history", err);
      } finally {
        if (mounted) setLoading(false);
      }
    };
    
    loadHistory();
    
    const unsubscribe = subscribe(["chat"], (_event, payload: any) => {
       if (payload?.sessionKey !== "agent:main:main") return;

       // Deduplicate: Gateway emits each event via broadcast() AND nodeSendToSession()
       const eventKey = `${payload.runId}:${payload.seq}`;
       if (seenEventKeys.current.has(eventKey)) return;
       seenEventKeys.current.add(eventKey);

       if (payload.state === "delta") {
          const msgObj = payload.message || {};
          let rawText = '';
          if (Array.isArray(msgObj.content)) {
             msgObj.content.forEach((b: any) => {
               if (b.type === "text" && typeof b.text === "string") rawText += b.text;
             });
          } else if (typeof msgObj.content === "string") {
             rawText = msgObj.content;
          } else if (typeof msgObj === "string") {
             rawText = msgObj;
          }
          
          if (rawText) {
            const { cleanText } = cleanMessageText(rawText);
            setStream(cleanText || null);
          }
       } else if (payload.state === "final" || payload.state === "aborted" || payload.state === "error") {
          setStream(prev => {
             const messageObj: any = payload.message || {};
             const isInterSession = messageObj.provenance?.kind === "inter_session";
             if (isInterSession) return null;

             if (prev) {
                const { cleanText } = cleanMessageText(prev);
                setMessages(m => [
                  ...m, 
                  { role: 'assistant', content: cleanText, timestamp: Date.now() }
                ]);
             } else if (payload.message) {
               let text = '';
               if (Array.isArray(payload.message.content)) {
                 payload.message.content.forEach((b: any) => {
                   if (b.type === 'text' && b.text) text += b.text;
                 });
               } else if (typeof payload.message === 'string') {
                 text = payload.message;
               }
               if (text) {
                 const { cleanText } = cleanMessageText(text);
                 setMessages(m => [
                   ...m,
                   { role: 'assistant', content: cleanText, timestamp: Date.now() }
                 ]);
               }
             } else if (payload.state === "error") {
                setMessages(m => [
                  ...m, 
                  { role: 'assistant', content: `Error: ${payload.errorMessage || 'Unknown error'}`, timestamp: Date.now() }
                ]);
             }
             return null;
          });
          // Evict all keys for this run to keep the Set bounded
          if (payload.runId) {
             const prefix = `${payload.runId}:`;
             for (const k of seenEventKeys.current) {
                if (k.startsWith(prefix)) seenEventKeys.current.delete(k);
             }
          }
          setRunId(null);
          setSending(false);
       }
    });

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, [status, rpc, subscribe]);

  const handleSend = async () => {
    if (!input.trim() || sending) return;
    
    const text = input.trim();
    setInput('');
    setSending(true);
    const tempId = Date.now().toString();
    setRunId(tempId);
    setMessages(prev => [...prev, { role: 'user', content: text, timestamp: Date.now() }]);
    
    try {
       await rpc("chat.send", { 
         sessionKey: "main", 
         message: text, 
         deliver: false,
         idempotencyKey: tempId
       });
    } catch (err) {
       console.error("Send failed", err);
       setMessages(prev => [...prev, { role: 'assistant', content: `Error: ${err}`, timestamp: Date.now() }]);
       setSending(false);
       setRunId(null);
    }
  };

  const handleAbort = async () => {
    if (!runId) return;
    try {
      await rpc("chat.abort", { sessionKey: "main", runId });
    } catch (err) {
      console.error("Abort failed", err);
    }
  };
  
  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedText("Copied!");
    setTimeout(() => setCopiedText(null), 2000);
  };
  
  if (status !== 'connected') {
     return (
       <div className="chat-tab">
         <div className="chat-empty-state">
           <div className="chat-empty-icon" style={{ opacity: 0.5 }}>
             <MessageCircle size={32} />
           </div>
           <h3>Not Connected</h3>
           <p>Your agent is offline or provisioning.</p>
         </div>
       </div>
     );
  }

  return (
    <div className="chat-tab cursor-default">
      {copiedText && <div className="copied-toast">{copiedText}</div>}
      
      {loading ? (
        <div className="chat-empty-state">
           <Loader2 size={32} className="spin" style={{ color: 'var(--text-secondary)' }} />
           <p>Loading conversation...</p>
        </div>
      ) : messages.length === 0 && !stream ? (
        <div className="chat-empty-state">
           <div className="chat-empty-icon">
             <MessageCircle size={32} />
           </div>
           <h3>Start a Conversation</h3>
           <p>Send a message directly to your OpenClaw agent.</p>
        </div>
      ) : (
        <div className="chat-messages-container">
          {messages.map((msg, idx) => (
             <div key={idx} className={`chat-bubble-wrapper ${msg.role}`}>
                <div 
                  className="chat-bubble" 
                  onClick={() => handleCopy(msg.content)}
                  title="Tap to copy"
                >
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                </div>
                <div className="chat-timestamp">
                   <span>{new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                   <span className="chat-copy-hint"><Copy size={10} style={{marginRight: '3px'}}/>Copy</span>
                </div>
             </div>
          ))}
          
          {stream && (
             <div className="chat-bubble-wrapper assistant">
                <div className="chat-bubble">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{stream}</ReactMarkdown>
                </div>
             </div>
          )}
          
          {sending && !stream && (
            <div className="chat-bubble-wrapper assistant">
                <div className="chat-bubble">
                  <div className="typing-indicator">
                    <div className="typing-dot" />
                    <div className="typing-dot" />
                    <div className="typing-dot" />
                  </div>
                </div>
            </div>
          )}
          
          <div ref={messagesEndRef} />
        </div>
      )}

      <div className="chat-input-container">
         <textarea
           className="chat-input"
           placeholder="Message your agent..."
           value={input}
           onChange={(e) => setInput(e.target.value)}
           onKeyDown={(e) => {
             if (e.key === 'Enter' && !e.shiftKey) {
               e.preventDefault();
               handleSend();
             }
           }}
           disabled={sending}
           rows={1}
         />
         {sending ? (
           <button className="chat-send-btn chat-abort-btn" onClick={handleAbort} title="Stop generation">
             <StopCircle size={20} />
           </button>
         ) : (
           <button className="chat-send-btn" onClick={handleSend} disabled={!input.trim()}>
             <Send size={18} />
           </button>
         )}
      </div>
    </div>
  );
};
