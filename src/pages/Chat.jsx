import { useState, useRef, useEffect } from "react";
import { useAuth } from '../context/AuthProvider';
import { auth, supabase } from '../services/supabaseClient';

// Markdown & Styling Imports
import ReactMarkdown from "react-markdown";
import remarkGfm from 'remark-gfm';
import CodeBlock from '../components/common/CodeBlock';

// Icons
import { LuCircleArrowRight, LuCircleStop, LuEye, LuEyeOff, LuMessageSquare } from "react-icons/lu";

// Components
import AnalysisCard from "../components/common/AnalysisCard";
import Sidebar from "../components/chat/Sidebar";

export default function MultiChat() {
  // --- STATE MANAGEMENT ---
  const [sessions, setSessions] = useState([]);
  const [folders, setFolders] = useState([]);
  const [activeSession, setActiveSession] = useState(null);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [showRealFeedback, setShowRealFeedback] = useState(true);

  // Analysis Data: { [messageId]: AnalysisData }
  const [analyses, setAnalyses] = useState({});

  const { user } = useAuth();
  const containerRef = useRef(null);
  const streamReaderRef = useRef(null);
  const abortControllerRef = useRef(null);
  const channelsRef = useRef([]);
  const inputTimeoutRef = useRef(null);
  const tempToRealIdRef = useRef({});
  const analysisPollRef = useRef([]);
  const streamBufferRef = useRef({ content: "", id: null, sessionId: null, rafId: null });
  const scrollRafRef = useRef(null);

  // Poll for analysis of a specific bot message until it appears
  const pollForAnalysis = (messageId) => {
    let attempts = 0;
    const maxAttempts = 20; // 20 × 3s = 60s max
    const interval = setInterval(async () => {
      attempts++;
      // Check current state via the setter to avoid stale closure
      let alreadyHave = false;
      setAnalyses(prev => {
        if (prev[messageId]) alreadyHave = true;
        return prev; // no change
      });
      if (alreadyHave) {
        clearInterval(interval);
        analysisPollRef.current = analysisPollRef.current.filter(i => i !== interval);
        return;
      }
      try {
        const { data } = await supabase
          .from('chat_analysis')
          .select('*')
          .eq('message_id', messageId)
          .maybeSingle();
        if (data) {
          setAnalyses(prev => ({ ...prev, [data.message_id]: data }));
          clearInterval(interval);
          analysisPollRef.current = analysisPollRef.current.filter(i => i !== interval);
        }
      } catch (e) {
        console.warn('Analysis poll error:', e);
      }
      if (attempts >= maxAttempts) {
        clearInterval(interval);
        analysisPollRef.current = analysisPollRef.current.filter(i => i !== interval);
      }
    }, 3000);
    analysisPollRef.current.push(interval);
  };

  // --- 1. DATA LOADING & AUTO-SELECT LOGIC ---
  useEffect(() => {
    if (!user) return;

    const loadData = async () => {
      // A. Load Folders
      const { data: fData } = await supabase.from('chat_folders').select('*').eq('user_id', user.id).order('created_at');
      if (fData) setFolders(fData);

      // B. Load Sessions
      const { data: sData } = await supabase
        .from('chat_sessions')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      let loadedSessions = [];

      if (sData) {
        // C. Load Messages
        loadedSessions = await Promise.all(sData.map(async (s) => {
          const { data: mData } = await supabase
            .from('chat_messages')
            .select('*')
            .eq('session_id', s.id)
            .order('created_at', { ascending: true });
          return { ...s, messages: mData || [] };
        }));

        setSessions(loadedSessions);
      }

      // --- AUTO-SELECT / AUTO-CREATE LOGIC ---
      if (loadedSessions.length > 0) {
        // If sessions exist but none is active -> select the first (newest)
        if (!activeSession) {
          setActiveSession(loadedSessions[0].id);
        }
      } else {
        // If NO sessions exist -> auto-create one
        const { data: newSession } = await supabase
          .from('chat_sessions')
          .insert({ user_id: user.id, title: "New Chat" })
          .select()
          .single();

        if (newSession) {
          const newSessionObj = { ...newSession, messages: [] };
          setSessions([newSessionObj]);
          setActiveSession(newSessionObj.id);
        }
      }
      // -------------------------------------------

      // D. Load Analyses
      const { data: aData } = await supabase.from('chat_analysis').select('*').eq('user_id', user.id);
      if (aData) {
        const analysisMap = {};
        aData.forEach(a => { analysisMap[a.message_id] = a; });
        setAnalyses(analysisMap);
      }
    };

    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]); // activeSession removed to prevent loop

  // --- 2. REALTIME LISTENERS ---
  useEffect(() => {
    if (!user) return;

    // A. MESSAGES
    const msgChannel = supabase.channel('chat-updates')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages' }, payload => {
        const newMsg = payload.new;

        setSessions(prev => prev.map(s => {
          if (s.id !== newMsg.session_id) return s;

          // Already present by real ID → skip
          if (s.messages.find(m => m.id === newMsg.id)) return s;

          // Try to find a temp placeholder with matching role + content
          const tempIdx = s.messages.findIndex(m =>
            (m.id.toString().startsWith('temp-bot') || m.id.toString().startsWith('temp-user'))
            && m.role === newMsg.role
            && m.content === newMsg.content
          );

          if (tempIdx !== -1) {
            const oldTempId = s.messages[tempIdx].id;
            const updated = [...s.messages];
            updated[tempIdx] = newMsg;

            // Keep a mapping so analyses can still be resolved
            tempToRealIdRef.current[oldTempId] = newMsg.id;
            setAnalyses(a => {
              if (a[oldTempId]) {
                const { [oldTempId]: val, ...rest } = a;
                return { ...rest, [newMsg.id]: val };
              }
              return a;
            });

            return { ...s, messages: updated };
          }

          // Genuinely new message (e.g. from another device / tab)
          return { ...s, messages: [...s.messages, newMsg] };
        }));
      })
      .subscribe();
    channelsRef.current.push(msgChannel);

    // B. ANALYSES
    const analysisChannel = supabase.channel('analysis-updates')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_analysis' }, payload => {
        const newAnalysis = payload.new;
        setAnalyses(prev => ({ ...prev, [newAnalysis.message_id]: newAnalysis }));
      })
      .subscribe();
    channelsRef.current.push(analysisChannel);

    // C. SESSIONS
    const sessionsChannel = supabase.channel('session-updates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_sessions' }, payload => {
        if (payload.eventType === 'INSERT') {
          const newSession = { ...payload.new, messages: [] };
          setSessions(prev => {
            if (prev.find(s => s.id === newSession.id)) return prev;
            return [newSession, ...prev]; // Add new session at the top
          });
        }
        else if (payload.eventType === 'UPDATE') {
          setSessions(prev => prev.map(s => s.id === payload.new.id ? { ...s, ...payload.new, messages: s.messages } : s));
        }
        else if (payload.eventType === 'DELETE') {
          setSessions(prev => prev.filter(s => s.id !== payload.old.id));
          if (activeSession === payload.old.id) setActiveSession(null);
        }
      })
      .subscribe();
    channelsRef.current.push(sessionsChannel);

    // D. FOLDERS
    const folderChannel = supabase.channel('folder-updates-global')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_folders' }, payload => {
        if (payload.eventType === 'INSERT') {
          setFolders(prev => {
            if (prev.find(f => f.id === payload.new.id)) return prev;
            return [...prev, payload.new];
          });
        }
        else if (payload.eventType === 'DELETE') {
          setFolders(prev => prev.filter(f => f.id !== payload.old.id));
          setSessions(prev => prev.map(s => s.folder_id === payload.old.id ? { ...s, folder_id: null } : s));
        }
        else if (payload.eventType === 'UPDATE') {
          setFolders(prev => prev.map(f => f.id === payload.new.id ? payload.new : f));
        }
      })
      .subscribe();
    channelsRef.current.push(folderChannel);

    return () => {
      // Cleanup all channels
      channelsRef.current.forEach(channel => {
        try {
          supabase.removeChannel(channel);
        } catch (error) {
          console.warn('Error removing channel:', error);
        }
      });
      channelsRef.current = [];

      // Clear input timeout
      if (inputTimeoutRef.current) {
        clearTimeout(inputTimeoutRef.current);
      }

      // NOTE: We intentionally do NOT abort active stream requests here.
      // Aborting on unmount kills the backend stream, preventing the bot
      // message and analysis from being saved to the database. The stream
      // completes in the background; when the user navigates back,
      // loadData() fetches the persisted messages and analyses.
      // Explicit abort only happens via the Stop button or when the user
      // sends a new message (sendMessage aborts any prior request).

      // Clear analysis poll intervals
      analysisPollRef.current.forEach(i => clearInterval(i));
      analysisPollRef.current = [];
    };
  }, [user, activeSession]);


  // --- 3. AUTO SCROLL (throttled) ---
  const scrollToBottom = () => {
    if (scrollRafRef.current) return; // already scheduled
    scrollRafRef.current = requestAnimationFrame(() => {
      if (containerRef.current) {
        containerRef.current.scrollTo({ top: containerRef.current.scrollHeight, behavior: "smooth" });
      }
      scrollRafRef.current = null;
    });
  };

  useEffect(() => {
    scrollToBottom();
  }, [sessions, analyses, activeSession, loading]);


  // --- 4. ACTION HANDLERS ---

  const handleCreateSession = async () => {
    const { data } = await supabase
      .from('chat_sessions')
      .insert({ user_id: user.id, title: "New Chat" })
      .select()
      .single();

    if (data) {
      const newSessionObj = { ...data, messages: [] };
      setSessions(prev => [newSessionObj, ...prev]);
      setActiveSession(data.id);
    }
  };

  const handleCreateFolder = async (name) => {
    const { data } = await supabase
      .from('chat_folders')
      .insert({ user_id: user.id, name: name })
      .select()
      .single();
    if (data) setFolders(prev => [...prev, data]);
  };

  const handleDeleteFolder = async (id) => {
    setFolders(prev => prev.filter(f => f.id !== id));
    setSessions(prev => prev.map(s => s.folder_id === id ? { ...s, folder_id: null } : s));
    await supabase.from('chat_sessions').update({ folder_id: null }).eq('folder_id', id);
    await supabase.from('chat_folders').delete().eq('id', id);
  };

  const handleRenameSession = async (id, newTitle) => {
    setSessions(prev => prev.map(s => s.id === id ? { ...s, title: newTitle } : s));
    await supabase.from('chat_sessions').update({ title: newTitle }).eq('id', id);
  };

  const handleDeleteSession = async (id) => {
    const remainingSessions = sessions.filter(s => s.id !== id);
    setSessions(remainingSessions);

    // Auto-select logic on delete
    if (activeSession === id) {
      if (remainingSessions.length > 0) {
        setActiveSession(remainingSessions[0].id);
      } else {
        setActiveSession(null);
        handleCreateSession();
      }
    }

    await supabase.from('chat_sessions').delete().eq('id', id);
  };

  const handleMoveSession = async (sessionId, folderId) => {
    setSessions(prev => prev.map(s => s.id === sessionId ? { ...s, folder_id: folderId } : s));
    await supabase.from('chat_sessions').update({ folder_id: folderId }).eq('id', sessionId);
  };


  // --- 5. STREAMING LOGIC ---
  const sendMessage = async () => {
    if (!input.trim()) return;

    if (!activeSession) {
      alert("Please select or create a chat first.");
      return;
    }

    const text = input;
    setInput("");
    setLoading(true);

    // --- AUTO RENAMING LOGIC START ---
    // Check if this is the very first message in the session
    const currentSession = sessions.find(s => s.id === activeSession);
    const isFirstMessage = currentSession && currentSession.messages.length === 0;

    if (isFirstMessage) {
      // Generate title from the first 30 characters of the message
      let newTitle = text.trim();
      if (newTitle.length > 30) {
        newTitle = newTitle.substring(0, 30) + "...";
      }

      // 1. Update locally for instant feedback
      setSessions(prev => prev.map(s => s.id === activeSession ? { ...s, title: newTitle } : s));

      // 2. Save to DB (async, not awaited)
      supabase.from('chat_sessions').update({ title: newTitle }).eq('id', activeSession).then();
    }
    // --- AUTO RENAMING LOGIC END ---

    const tempUserMsgId = `temp-user-${Date.now()}`;
    const tempBotMsgId = `temp-bot-${Date.now()}`;
    const timestamp = new Date().toISOString();

    setSessions(prev => prev.map(s => {
      if (s.id === activeSession) {
        return {
          ...s,
          messages: [
            ...s.messages,
            { id: tempUserMsgId, role: 'user', content: text, created_at: timestamp, session_id: activeSession },
            { id: tempBotMsgId, role: 'bot', content: "", created_at: timestamp, session_id: activeSession }
          ]
        };
      }
      return s;
    }));

    setTimeout(() => {
      if (containerRef.current) containerRef.current.scrollTo({ top: containerRef.current.scrollHeight, behavior: "smooth" });
    }, 10);

    let flushInterval = null;

    try {
      // Cancel any existing request
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      // Create new AbortController for this request
      abortControllerRef.current = new AbortController();

      const { session } = await auth.getSession();
      if (!session?.access_token) {
        throw new Error('You must be signed in to send messages.');
      }

      const response = await fetch(`${import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000'}/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ session_id: activeSession, text: text }),
        signal: abortControllerRef.current.signal
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const reader = response.body.getReader();
      streamReaderRef.current = reader;
      const decoder = new TextDecoder();
      let botContent = "";
      let currentSessionId = activeSession;

      // Throttled flush: accumulates tokens and renders at ~30fps
      const flushBuffer = () => {
        const buf = streamBufferRef.current;
        if (!buf.id || buf.content === "") return;
        const contentSnapshot = buf.content;
        const idSnapshot = buf.id;
        const sidSnapshot = buf.sessionId;
        setSessions(prev => prev.map(s => {
          if (s.id === sidSnapshot) {
            return { ...s, messages: s.messages.map(m => m.id === idSnapshot ? { ...m, content: contentSnapshot } : m) };
          }
          return s;
        }));
      };

      // Start a render loop that flushes every 30ms
      flushInterval = setInterval(flushBuffer, 30);

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split("\n").filter(line => line.trim() !== "");

        for (const line of lines) {
          try {
            const json = JSON.parse(line);
            if (json.type === "session_init") {
              currentSessionId = json.session_id;
              if (!activeSession) setActiveSession(json.session_id);
            }
            else if (json.type === "user_msg_id" && json.message_id) {
              // Replace the temp user ID with the real DB ID
              setSessions(prev => prev.map(s => {
                if (s.id === currentSessionId) {
                  return {
                    ...s,
                    messages: s.messages.map(m =>
                      m.id === tempUserMsgId ? { ...m, id: json.message_id } : m
                    )
                  };
                }
                return s;
              }));
              tempToRealIdRef.current[tempUserMsgId] = json.message_id;
            }
            else if (json.type === "token") {
              botContent += json.content;
              // Buffer the content — the interval will flush it to state
              streamBufferRef.current.content = botContent;
              streamBufferRef.current.id = tempBotMsgId;
              streamBufferRef.current.sessionId = currentSessionId;
            }
            else if (json.type === "done" && json.message_id) {
              // Flush any remaining buffered content BEFORE swapping the ID
              const buf = streamBufferRef.current;
              if (buf.id === tempBotMsgId && buf.content) {
                const preFlushContent = buf.content;
                setSessions(prev => prev.map(s => {
                  if (s.id === currentSessionId) {
                    return { ...s, messages: s.messages.map(m => m.id === tempBotMsgId ? { ...m, content: preFlushContent } : m) };
                  }
                  return s;
                }));
              }

              // Now replace the temp bot ID with the real DB ID
              setSessions(prev => prev.map(s => {
                if (s.id === currentSessionId) {
                  return {
                    ...s,
                    messages: s.messages.map(m =>
                      m.id === tempBotMsgId ? { ...m, id: json.message_id } : m
                    )
                  };
                }
                return s;
              }));

              // Update the buffer ref so the final flush in `finally` targets the correct ID
              streamBufferRef.current.id = json.message_id;

              tempToRealIdRef.current[tempBotMsgId] = json.message_id;
              // Start polling for the analysis of this bot message
              pollForAnalysis(json.message_id);
            }
          } catch (e) { console.error("Parse Error", e); }
        }
      }
    } catch (err) {
      clearInterval(flushInterval);
      streamBufferRef.current = { content: "", id: null, sessionId: null, rafId: null };
      console.error("Stream Error", err);
      if (err.name !== 'AbortError') {
        // Show error message to user for non-cancelled requests
        setSessions(prev => prev.map(s => {
          if (s.id === activeSession) {
            const errorMsg = {
              id: `error-${Date.now()}`,
              role: 'bot',
              content: `❌ **Error**: ${err.message || 'Failed to get response. Please try again.'}`,
              created_at: new Date().toISOString(),
              session_id: s.id
            };
            return { ...s, messages: [...s.messages.filter(m => !m.id.toString().startsWith('temp-')), errorMsg] };
          }
          return s;
        }));
      }
    } finally {
      // Final flush to make sure last tokens are rendered
      clearInterval(flushInterval);
      const buf = streamBufferRef.current;
      if (buf.id && buf.content) {
        const finalContent = buf.content;
        const finalId = buf.id;
        const finalSid = buf.sessionId;
        setSessions(prev => prev.map(s => {
          if (s.id === finalSid) {
            return { ...s, messages: s.messages.map(m => m.id === finalId ? { ...m, content: finalContent } : m) };
          }
          return s;
        }));
      }
      streamBufferRef.current = { content: "", id: null, sessionId: null, rafId: null };
      setLoading(false);
      streamReaderRef.current = null;
      abortControllerRef.current = null;
    }
  };

  const handleStopGeneration = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    if (streamReaderRef.current) {
      streamReaderRef.current.cancel();
    }
    setLoading(false);
  };

  // --- RENDER ---
  const activeSessionData = sessions.find(s => s.id === activeSession);
  const activeMessages = activeSessionData?.messages || [];
  const currentTitle = activeSessionData?.title || "Chat";
  const currentFolder = folders.find(f => f.id === activeSessionData?.folder_id);

  return (
    <div className="flex h-screen bg-gray-50 text-gray-900 font-sans overflow-hidden">

      <Sidebar
        user={user}
        sessions={sessions}
        folders={folders}
        activeSession={activeSession}
        onSelectSession={setActiveSession}
        onCreateSession={handleCreateSession}
        onCreateFolder={handleCreateFolder}
        onDeleteFolder={handleDeleteFolder}
        onRenameSession={handleRenameSession}
        onDeleteSession={handleDeleteSession}
        onMoveSession={handleMoveSession}
      />

      <div className="flex-1 flex flex-col h-full relative min-w-0">

        {/* HEADER */}
        <div className="bg-white border-b border-gray-200 h-16 px-6 flex justify-between items-center shadow-sm z-10 shrink-0">
          <h2 className="font-semibold text-lg text-gray-800 truncate max-w-md flex items-center gap-2">
            {currentTitle}
            <span className="text-xs text-gray-400 font-normal border border-gray-200 px-2 py-0.5 rounded bg-gray-50 flex items-center gap-1">
              {currentFolder ? <><span className="opacity-50">/</span> {currentFolder.name}</> : "General"}
            </span>
          </h2>

          <button
            onClick={() => setShowRealFeedback(!showRealFeedback)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold transition-all uppercase tracking-wide ${showRealFeedback
              ? "bg-black text-white shadow-md ring-2 ring-black ring-offset-1"
              : "bg-gray-100 text-gray-500 hover:bg-gray-200"
              }`}
          >
            {showRealFeedback ? <LuEye size={14} /> : <LuEyeOff size={14} />}
            <span>Real-Feedback</span>
          </button>
        </div>

        {/* MESSAGES */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-8 scroll-smooth" ref={containerRef}>

          {!activeSession && (
            <div className="h-full flex flex-col items-center justify-center text-gray-300">
              <LuMessageSquare size={64} className="mb-4 opacity-20" />
              <p className="text-lg">Start your first conversation.</p>
            </div>
          )}

          {activeMessages.map((m) => (
            <div key={m.id} className={`flex w-full group ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`flex flex-col gap-2 max-w-[90%] lg:max-w-[75%]`}>

                {/* BUBBLE */}
                <div className={`rounded-2xl px-5 py-4 shadow-sm text-sm sm:text-base leading-relaxed break-words ${m.role === 'user'
                  ? 'bg-black text-white rounded-br-none'
                  : 'bg-white text-gray-800 border border-gray-100 rounded-bl-none'
                  }`}>

                  {/* GENERATING ANIMATION */}
                  {m.role === 'bot' && m.content === "" && loading ? (
                    <div className="flex items-center gap-3 py-2">
                      <div className="flex gap-1.5">
                        <span className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-bounce"></span>
                        <span className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-bounce delay-75"></span>
                        <span className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-bounce delay-150"></span>
                      </div>
                      <span className="text-xs text-gray-400 font-medium tracking-wide">AI generating...</span>
                    </div>
                  ) : (
                    /* RICH MARKDOWN CONTENT */
                    <div className="prose prose-sm sm:prose-base max-w-none
                        dark:prose-invert
                        prose-p:my-2 prose-p:leading-relaxed
                        prose-headings:font-semibold prose-headings:text-gray-900
                        prose-pre:p-0 prose-pre:bg-transparent prose-pre:m-0 prose-pre:border-none prose-pre:shadow-none
                        prose-a:text-blue-600 prose-a:no-underline hover:prose-a:underline
                        prose-ul:my-2 prose-li:my-0.5
                        prose-table:border prose-table:border-gray-200 prose-table:shadow-sm prose-table:rounded-lg
                        prose-th:bg-gray-50 prose-th:p-3 prose-td:p-3
                    ">
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        components={{
                          code: CodeBlock
                        }}
                      >
                        {m.content}
                      </ReactMarkdown>
                    </div>
                  )}

                </div>

                {/* ANALYSIS CARD */}
                {m.role === 'bot' && showRealFeedback && (analyses[m.id] || analyses[tempToRealIdRef.current[m.id]]) && (
                  <div className="animate-in fade-in slide-in-from-top-2 duration-500 origin-top">
                    <AnalysisCard analysis={analyses[m.id] || analyses[tempToRealIdRef.current[m.id]]} />
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* INPUT */}
        <div className="p-4 bg-white border-t border-gray-100 shrink-0">
          <div className="max-w-4xl mx-auto relative flex items-end gap-3">
            <textarea
              className="flex-1 bg-gray-50 hover:bg-gray-100 text-gray-800 placeholder-gray-400 rounded-2xl px-6 py-4 focus:outline-none focus:ring-2 focus:ring-black/10 focus:bg-white transition-all border border-transparent focus:border-gray-200 disabled:opacity-50 resize-none min-h-[56px] max-h-[200px] overflow-y-auto"
              placeholder={activeSession ? "Type a message..." : "Loading..."}
              value={input}
              rows={1}
              onChange={e => {
                const value = e.target.value;
                setInput(value);

                // Auto-resize textarea
                e.target.style.height = 'auto';
                e.target.style.height = Math.min(e.target.scrollHeight, 200) + 'px';

                // Clear existing timeout
                if (inputTimeoutRef.current) {
                  clearTimeout(inputTimeoutRef.current);
                }

                // Debounce for typing indicator (future enhancement)
                inputTimeoutRef.current = setTimeout(() => {
                  // Could add typing indicator logic here
                }, 150);
              }}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  if (inputTimeoutRef.current) {
                    clearTimeout(inputTimeoutRef.current);
                  }
                  sendMessage();
                  // Reset textarea height after sending
                  e.target.style.height = 'auto';
                }
              }}
              disabled={loading || !activeSession}
              autoFocus
            />
            <button
              onClick={loading ? handleStopGeneration : sendMessage}
              disabled={(!input.trim() && !loading) || !activeSession}
              className={`p-4 rounded-full transition-all shadow-md active:scale-95 flex items-center justify-center ${loading
                ? "bg-red-500 hover:bg-red-600 text-white"
                : "bg-black hover:bg-gray-800 text-white disabled:opacity-50 disabled:cursor-not-allowed"
                }`}
            >
              {loading ? <LuCircleStop size={24} /> : <LuCircleArrowRight size={24} />}
            </button>
          </div>
          <div className="text-center mt-3 text-[10px] text-gray-400 uppercase tracking-widest">
            AI can make mistakes. Please verify important information.
          </div>
        </div>

      </div>
    </div>
  );
}
