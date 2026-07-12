import { useState, useRef, useEffect, useCallback } from 'react';
import api from '../services/api';

function normalizeText(value) {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map(normalizeText).join("\n");
  if (typeof value === "object") {
    return value.text || value.message || value.reply || value.content || JSON.stringify(value, null, 2);
  }
  return String(value);
}

const ORB_STATES = {
  idle: {
    label: 'Idle',
    color: 'from-slate-400 to-slate-600',
    shadow: 'shadow-slate-500/30',
    ringColor: 'border-slate-500/30',
    icon: 'M12 9v6m3-3H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z',
    animation: '',
  },
  listening: {
    label: 'Listening',
    color: 'from-green-400 to-emerald-600',
    shadow: 'shadow-green-500/50',
    ringColor: 'border-green-500/30',
    icon: 'M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z',
    animation: 'animate-receptionist-listening',
  },
  thinking: {
    label: 'Thinking',
    color: 'from-amber-400 to-orange-600',
    shadow: 'shadow-amber-500/50',
    ringColor: 'border-amber-500/30',
    icon: 'M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z',
    animation: 'animate-receptionist-thinking',
  },
  speaking: {
    label: 'Speaking',
    color: 'from-cyan-400 to-blue-600',
    shadow: 'shadow-cyan-500/50',
    ringColor: 'border-cyan-500/30',
    icon: 'M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z',
    animation: 'animate-receptionist-speaking',
  },
  scheduling: {
    label: 'Scheduling',
    color: 'from-violet-400 to-purple-600',
    shadow: 'shadow-violet-500/50',
    ringColor: 'border-violet-500/30',
    icon: 'M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5',
    animation: 'animate-receptionist-pulse',
  },
  escalating: {
    label: 'Escalating',
    color: 'from-red-400 to-rose-600',
    shadow: 'shadow-red-500/50',
    ringColor: 'border-red-500/30',
    icon: 'M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z',
    animation: 'animate-receptionist-alert',
  },
  ended: {
    label: 'Call Ended',
    color: 'from-slate-500 to-slate-700',
    shadow: 'shadow-slate-500/30',
    ringColor: 'border-slate-500/30',
    icon: 'M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5m8.25 3v6.75m0 0l-3-3m3 3l3-3M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z',
    animation: '',
  },
};

const STATUS_INDICATORS = [
  { key: 'phoneOnline', label: 'Phone Online', check: async () => { const r = await api.get('/ai-receptionist/health'); return { online: r.data.status === 'ok' }; } },
  { key: 'realtimeConnected', label: 'Realtime', check: async () => { const r = await api.get('/ai-receptionist/health'); return { online: r.data.realtimeConfigured && r.data.mediaStreamEnabled }; } },
  { key: 'databaseConnected', label: 'Database', check: async () => { const r = await api.get('/health/ready'); return { online: r.data.database === 'connected' }; } },
  { key: 'businessTools', label: 'Business Tools', check: async () => { const r = await api.get('/ai-receptionist/health'); return { online: r.data.businessToolsEnabled }; } },
];

function formatDuration(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

export default function AIPhoneConsole({ showToast }) {
  const [sessionId, setSessionId] = useState(null);
  const [stage, setStage] = useState('idle');
  const [messages, setMessages] = useState([]);
  const [reply, setReply] = useState('');
  const [extractedData, setExtractedData] = useState({});
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [suggestedReplies, setSuggestedReplies] = useState([]);
  const [requiresConfirmation, setRequiresConfirmation] = useState(false);
  const [pendingAction, setPendingAction] = useState(null);
  const [isComplete, setIsComplete] = useState(false);
  const [textInput, setTextInput] = useState('');
  const [voiceSupported, setVoiceSupported] = useState(true);
  const [callDuration, setCallDuration] = useState(0);
  const [callActive, setCallActive] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [actionLog, setActionLog] = useState([]);
  const [statuses, setStatuses] = useState({});
  const [statusLoading, setStatusLoading] = useState(true);

  const recognitionRef = useRef(null);
  const synthRef = useRef(window.speechSynthesis);
  const messagesEndRef = useRef(null);
  const durationIntervalRef = useRef(null);
  const statusIntervalRef = useRef(null);

  useEffect(() => {
    const hasSR = 'SpeechRecognition' in window || 'webkitSpeechRecognition' in window;
    const hasSS = 'speechSynthesis' in window;
    setVoiceSupported(hasSR && hasSS);
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, reply]);

  useEffect(() => {
    async function checkStatuses() {
      const results = {};
      await Promise.allSettled(
        STATUS_INDICATORS.map(async (indicator) => {
          try { const r = await indicator.check(); results[indicator.key] = { ...r, label: indicator.label }; }
          catch { results[indicator.key] = { online: false, label: indicator.label }; }
        })
      );
      setStatuses(results);
      setStatusLoading(false);
    }
    checkStatuses();
    statusIntervalRef.current = setInterval(checkStatuses, 30000);
    return () => clearInterval(statusIntervalRef.current);
  }, []);

  useEffect(() => {
    if (callActive && !durationIntervalRef.current) {
      durationIntervalRef.current = setInterval(() => {
        setCallDuration(d => d + 1);
      }, 1000);
    } else if (!callActive && durationIntervalRef.current) {
      clearInterval(durationIntervalRef.current);
      durationIntervalRef.current = null;
    }
    return () => { if (durationIntervalRef.current) clearInterval(durationIntervalRef.current); };
  }, [callActive]);

  const getOrbState = useCallback(() => {
    if (stage === 'idle' || !stage) return ORB_STATES.idle;
    if (isSpeaking) return ORB_STATES.speaking;
    if (isListening) return ORB_STATES.listening;
    if (isThinking) return ORB_STATES.thinking;
    if (stage === 'scheduling' || stage === 'confirmed' || stage === 'complete') return ORB_STATES.scheduling;
    if (stage === 'escalated' || stage === 'escalating') return ORB_STATES.escalating;
    if (isComplete || stage === 'ended') return ORB_STATES.ended;
    return ORB_STATES.speaking;
  }, [stage, isListening, isSpeaking, isThinking, isComplete]);

  const addMessage = useCallback((role, content) => {
    if (!content) return;
    setMessages(prev => [...prev, { role, content, timestamp: new Date().toISOString() }]);
  }, []);

  const addAction = useCallback((action, status, detail) => {
    setActionLog(prev => [...prev, { action, status, detail, timestamp: new Date().toISOString() }]);
  }, []);

  const speakResponse = useCallback((text) => {
    if (!synthRef.current || !text) return;
    setIsSpeaking(true);
    synthRef.current.cancel();
    const safeText = typeof text === 'string' ? text : String(text || '');
    if (!safeText.trim()) { setIsSpeaking(false); return; }
    const clean = safeText.replace(/[*_`#\[\]]/g, '');
    const utterance = new SpeechSynthesisUtterance(clean);
    utterance.rate = 1.0;
    utterance.pitch = 1.0;
    utterance.volume = 1.0;
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);
    synthRef.current.speak(utterance);
  }, []);

  const cancelSpeech = useCallback(() => {
    if (synthRef.current) {
      synthRef.current.cancel();
      setIsSpeaking(false);
    }
  }, []);

  const startConversation = useCallback(async () => {
    try {
      cancelSpeech();
      setMessages([]);
      setReply('');
      setExtractedData({});
      setSuggestedReplies([]);
      setRequiresConfirmation(false);
      setPendingAction(null);
      setIsComplete(false);
      setIsThinking(true);
      setStage('starting');
      setCallActive(true);
      setCallDuration(0);
      setActionLog([]);

      const res = await api.post('/ai-receptionist/agent/start');
      const data = res.data;

      setSessionId(data.sessionId);
      setStage(data.conversationStage || 'greeting');
      const greeting = normalizeText(data.reply || data.greeting || '');
      setReply(greeting);
      setSuggestedReplies(data.suggestedReplies || []);
      setIsThinking(false);

      if (greeting) {
        addMessage('assistant', greeting);
        setTimeout(() => speakResponse(greeting), 300);
      }
    } catch (err) {
      console.error('Session start error:', err);
      setIsThinking(false);
      setCallActive(false);
      const status = err.response?.status;
      let errMsg;
      if (status === 503) {
        errMsg = err.response?.data?.message || 'AI Receptionist is currently disabled.';
      } else if (status === 429) {
        errMsg = 'Too many AI messages. Please wait a moment and try again.';
      } else {
        errMsg = err.response?.data?.message || err.response?.data?.error || 'Failed to start conversation. Please try again.';
      }
      setStage('error');
      setReply(errMsg);
      showToast?.(errMsg, 'error');
    }
  }, [addMessage, speakResponse, cancelSpeech, showToast]);

  const sendMessage = useCallback(async (text) => {
    const trimmed = (text || '').trim();
    if (!trimmed) {
      showToast?.("I couldn't hear anything. Please try again.", 'error');
      setReply("I couldn't hear anything. Please try again.");
      return;
    }

    let sid = sessionId;
    if (!sid) {
      await startConversation();
      sid = sessionId;
      if (!sid) { showToast?.('Failed to create session.', 'error'); return; }
    }

    if (isThinking) return;
    setIsThinking(true);
    cancelSpeech();

    addMessage('user', trimmed);
    setReply('');

    try {
      const res = await api.post('/ai-receptionist/agent/message', { sessionId: sid, message: trimmed, mode: 'voice' });
      const data = res.data;

      setStage(data.conversationStage || '');
      const replyText = normalizeText(data.reply || '');
      setReply(replyText);
      setExtractedData(data.extractedData || {});
      setSuggestedReplies(data.suggestedReplies || []);
      setRequiresConfirmation(!!data.requiresConfirmation);
      setPendingAction(data.pendingAction || null);
      setIsComplete(!!data.isComplete);
      setIsThinking(false);

      if (data.actionLog) {
        setActionLog(prev => [...prev, ...data.actionLog]);
      }

      if (replyText) {
        addMessage('assistant', replyText);
        setTimeout(() => speakResponse(replyText), 300);
      }
    } catch (err) {
      console.error('Message error:', err);
      setIsThinking(false);
      const status = err.response?.status;
      const errData = err.response?.data || {};
      let errMsg;
      if (status === 503) {
        errMsg = errData.message || 'AI Receptionist is currently disabled.';
      } else if (status === 429) {
        errMsg = 'Too many AI messages. Please wait a moment and try again.';
      } else if (errData.code === 'SESSION_EXPIRED') {
        errMsg = errData.message || 'This session expired. Please start a new conversation.';
        setSessionId(null);
      } else {
        errMsg = errData.message || errData.error || 'I encountered an error. Please try again.';
      }
      setReply(errMsg);
      addMessage('assistant', errMsg);
    }
  }, [sessionId, isThinking, addMessage, cancelSpeech, showToast, startConversation]);

  const sendConfirmation = useCallback(async (confirmed) => {
    if (!sessionId || isThinking) return;
    setIsThinking(true);
    cancelSpeech();

    const msg = confirmed ? 'Yes, please proceed' : 'No, let me change something';
    addMessage('user', msg);

    try {
      const res = await api.post('/ai-receptionist/agent/confirm', { sessionId, action: confirmed ? pendingAction : null });
      const data = res.data;

      setStage(data.conversationStage || '');
      const replyText = normalizeText(data.reply || '');
      setReply(replyText);
      setExtractedData(data.extractedData || {});
      setSuggestedReplies(data.suggestedReplies || []);
      setRequiresConfirmation(!!data.requiresConfirmation);
      setPendingAction(data.pendingAction || null);
      setIsComplete(!!data.isComplete);
      setIsThinking(false);

      if (data.actionLog) {
        setActionLog(prev => [...prev, ...data.actionLog]);
      }

      if (replyText) {
        addMessage('assistant', replyText);
        if (data.isComplete) showToast?.('Action completed successfully!', 'success');
        setTimeout(() => speakResponse(replyText), 300);
      }
    } catch (err) {
      console.error('Confirmation error:', err);
      setIsThinking(false);
      const status = err.response?.status;
      const errData = err.response?.data || {};
      let errMsg;
      if (status === 503) {
        errMsg = errData.message || 'AI Receptionist is currently disabled.';
      } else if (status === 429) {
        errMsg = 'Too many AI messages. Please wait a moment and try again.';
      } else if (errData.code === 'SESSION_EXPIRED') {
        errMsg = errData.message || 'This session expired. Please start a new conversation.';
        setSessionId(null);
      } else {
        errMsg = errData.message || 'I encountered an error processing your confirmation. Please try again.';
      }
      setReply(errMsg);
      addMessage('assistant', errMsg);
    }
  }, [sessionId, isThinking, pendingAction, addMessage, cancelSpeech, showToast]);

  const startVoiceInput = useCallback(() => {
    if (!voiceSupported) {
      showToast?.('Voice input is not supported in this browser. Please use text input.', 'error');
      return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) { showToast?.('Speech recognition not available.', 'error'); return; }

    try {
      cancelSpeech();
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.lang = 'en-US';

      recognition.onstart = () => setIsListening(true);

      recognition.onresult = (event) => {
        const results = event.results;
        const last = results[results.length - 1];
        if (last.isFinal) {
          const transcript = Array.from(results).map(r => r[0].transcript).join(' ').trim();
          setIsListening(false);
          recognition.stop();
          if (transcript) { sendMessage(transcript); }
          else { showToast?.("I couldn't hear anything. Please try again.", 'error'); setIsListening(false); }
        }
      };

      recognition.onerror = (event) => {
        console.error('Speech recognition error:', event.error);
        setIsListening(false);
        if (event.error === 'not-allowed') { showToast?.('Microphone access denied. Please use text input.', 'error'); }
        else if (event.error === 'no-speech') { showToast?.('No speech detected. Please try again.', 'error'); }
        else { showToast?.('Could not hear clearly. Please try again or use text.', 'error'); }
      };

      recognition.onend = () => setIsListening(false);
      recognition.start();
    } catch (err) {
      console.error('Voice input error:', err);
      setIsListening(false);
      showToast?.('Voice input error. Please use text input.', 'error');
    }
  }, [voiceSupported, cancelSpeech, sendMessage, showToast]);

  const handleTextSubmit = (e) => {
    e.preventDefault();
    if (!textInput.trim() || isThinking) return;
    sendMessage(textInput.trim());
    setTextInput('');
  };

  const handleEndSession = async () => {
    cancelSpeech();
    if (sessionId) {
      try { await api.post('/ai-receptionist/agent/end', { sessionId }); } catch {}
    }
    setSessionId(null);
    setStage('ended');
    setMessages([]);
    setReply('');
    setExtractedData({});
    setIsComplete(false);
    setSuggestedReplies([]);
    setCallActive(false);
  };

  const orbState = getOrbState();

  return (
    <div className="flex flex-col gap-4">
      {/* Status Bar */}
      <div className="flex items-center gap-3 flex-wrap rounded-lg border border-slate-700 bg-slate-900/80 px-4 py-2">
        <div className="flex items-center gap-2 flex-1 flex-wrap">
          {STATUS_INDICATORS.map((ind) => {
            const s = statuses[ind.key];
            const online = s?.online;
            return (
              <div key={ind.key} className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs transition-colors ${
                statusLoading ? 'bg-slate-800/50 text-slate-500' :
                online ? 'bg-green-900/20 text-green-300' : 'bg-red-900/20 text-red-300'
              }`}>
                <div className={`h-1.5 w-1.5 rounded-full ${statusLoading ? 'bg-slate-600' : online ? 'bg-green-400' : 'bg-red-400'}`} />
                <span>{ind.label}</span>
              </div>
            );
          })}
        </div>
        <div className="flex items-center gap-2">
          <div className={`h-2 w-2 rounded-full ${callActive ? 'bg-green-400 animate-pulse' : 'bg-slate-600'}`} />
          <span className="text-xs font-mono text-slate-400">
            {callActive ? formatDuration(callDuration) : '--:--'}
          </span>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex flex-col lg:flex-row gap-4">
        {/* Left - Orb and Agent */}
        <div className="flex-1 flex flex-col items-center gap-4">
          {/* Animated Orb */}
          <div className="relative w-52 h-52 flex items-center justify-center">
            {/* Outer animated rings */}
            <div className={`absolute inset-0 rounded-full border-2 ${orbState.ringColor} ${orbState.animation} ${callActive ? 'opacity-100' : 'opacity-30'}`} />
            <div className={`absolute inset-3 rounded-full border border-slate-600/30 ${orbState.animation}`} style={{ animationDelay: '0.15s' }} />
            <div className={`absolute inset-6 rounded-full border border-slate-500/20 ${orbState.animation}`} style={{ animationDelay: '0.3s' }} />

            {/* Main orb */}
            <div className={`relative z-10 w-36 h-36 rounded-full bg-gradient-to-br ${orbState.color} shadow-lg ${orbState.shadow} flex items-center justify-center transition-all duration-500 ${
              callActive ? 'scale-100' : 'scale-90'
            }`}>
              <svg className={`h-14 w-14 text-white ${orbState.animation ? 'opacity-90' : 'opacity-70'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d={orbState.icon} />
              </svg>
            </div>

            {/* State label */}
            <div className="absolute -bottom-6 left-1/2 -translate-x-1/2">
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full bg-slate-800/80 border border-slate-700 ${
                orbState === ORB_STATES.listening ? 'text-green-300' :
                orbState === ORB_STATES.speaking ? 'text-cyan-300' :
                orbState === ORB_STATES.thinking ? 'text-amber-300' :
                orbState === ORB_STATES.scheduling ? 'text-violet-300' :
                orbState === ORB_STATES.escalating ? 'text-red-300' :
                orbState === ORB_STATES.ended ? 'text-slate-400' :
                'text-slate-400'
              }`}>
                {orbState.label}
              </span>
            </div>
          </div>

          {/* Reply / Current AI message */}
          {reply && (
            <div className="w-full max-w-lg rounded-lg border border-cyan-800/40 bg-slate-800/80 p-4">
              <p className="text-sm text-slate-100 leading-relaxed whitespace-pre-line">{reply}</p>
            </div>
          )}

          {/* Confirmation buttons */}
          {requiresConfirmation && (
            <div className="flex justify-center gap-4">
              <button onClick={() => sendConfirmation(true)} disabled={isThinking} className="rounded-lg bg-green-600 px-6 py-2.5 text-sm font-medium text-white hover:bg-green-500 disabled:opacity-50 transition-colors">
                Yes, Confirm
              </button>
              <button onClick={() => sendConfirmation(false)} disabled={isThinking} className="rounded-lg border border-slate-600 px-6 py-2.5 text-sm font-medium text-slate-300 hover:bg-slate-700 disabled:opacity-50 transition-colors">
                No, Change
              </button>
            </div>
          )}

          {/* Suggested replies */}
          {suggestedReplies.length > 0 && !requiresConfirmation && (
            <div className="flex flex-wrap gap-2 justify-center">
              {suggestedReplies.map((suggestion, i) => (
                <button key={i} onClick={() => sendMessage(suggestion)} disabled={isThinking} className="rounded-full border border-cyan-700/50 px-4 py-1.5 text-xs text-cyan-300 hover:bg-cyan-900/30 disabled:opacity-50 transition-colors">
                  {suggestion}
                </button>
              ))}
            </div>
          )}

          {/* Text input */}
          <form onSubmit={handleTextSubmit} className="w-full max-w-lg flex gap-2">
            <input
              type="text"
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
              placeholder={isListening ? 'Listening...' : isComplete ? 'Conversation ended' : 'Type your message...'}
              disabled={isListening || isThinking || isComplete}
              className="input flex-1 disabled:opacity-50"
            />
            <button type="button" onClick={startVoiceInput} disabled={isThinking || isComplete || !voiceSupported} className={`rounded-lg p-2.5 transition-colors ${isListening ? 'bg-green-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'} disabled:opacity-50`} title="Voice input">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" />
              </svg>
            </button>
            <button type="submit" disabled={!textInput.trim() || isThinking || isListening || isComplete} className="btn-primary bg-cyan-600 hover:bg-cyan-700 disabled:opacity-50 px-4">
              Send
            </button>
          </form>

          {/* Call controls */}
          {stage !== 'idle' && stage !== 'ended' && (
            <div className="flex items-center gap-3">
              <button onClick={handleEndSession} className="flex items-center gap-1.5 rounded-lg bg-red-700 px-4 py-2 text-xs font-medium text-white hover:bg-red-600 transition-colors">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                </svg>
                End Call
              </button>
              <button onClick={() => setIsMuted(!isMuted)} className={`flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-medium transition-colors ${isMuted ? 'bg-amber-700 text-white hover:bg-amber-600' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}>
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  {isMuted ? (
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3zM3 3l18 18" />
                  ) : (
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" />
                  )}
                </svg>
                {isMuted ? 'Muted' : 'Mute'}
              </button>
              <button className="flex items-center gap-1.5 rounded-lg bg-slate-700 px-4 py-2 text-xs font-medium text-slate-300 hover:bg-slate-600 transition-colors" title="Transfer call">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 8.511c.884.284 1.5 1.128 1.5 2.097v4.286c0 1.136-.847 2.1-1.98 2.193-.34.027-.68.052-1.02.072v3.091l-3-3c-1.354 0-2.694-.055-4.02-.163a2.115 2.115 0 01-.825-.242m9.345-8.334a2.126 2.126 0 00-.476-.095 48.64 48.64 0 00-8.048 0c-1.131.094-1.976 1.057-1.976 2.192v4.286c0 .837.46 1.58 1.155 1.951m9.345-8.334V6.637c0-1.621-1.152-3.026-2.76-3.235A48.455 48.455 0 0011.25 3c-2.115 0-4.198.137-6.24.402-1.608.209-2.76 1.614-2.76 3.235v6.226c0 1.621 1.152 3.026 2.76 3.235.577.075 1.157.14 1.74.194V21l4.155-4.155" />
                </svg>
                Transfer
              </button>
            </div>
          )}

          {/* Start new call */}
          {stage === 'idle' || stage === 'ended' ? (
            <button onClick={startConversation} className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-green-600 to-emerald-600 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-green-500/25 hover:from-green-500 hover:to-emerald-500 transition-all">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z" />
              </svg>
              Start New Call
            </button>
          ) : isComplete && (
            <button onClick={startConversation} className="rounded-lg bg-cyan-600 px-4 py-2 text-sm font-medium text-white hover:bg-cyan-500 transition-colors">
              Start New Conversation
            </button>
          )}
        </div>

        {/* Right Panels */}
        <div className="w-full lg:w-72 space-y-4">
          {/* Collected Details */}
          <div className="rounded-lg border border-slate-700 bg-slate-900/80 p-3">
            <div className="flex items-center gap-2 mb-2">
              <svg className="h-4 w-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15a2.25 2.25 0 012.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z" />
              </svg>
              <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider">Collected Details</span>
            </div>
            {Object.keys(extractedData).some(k => extractedData[k]) ? (
              <div className="space-y-1.5 text-xs">
                {extractedData.callerName && <div className="flex justify-between"><span className="text-slate-500">Name</span><span className="text-slate-200 text-right">{extractedData.callerName}</span></div>}
                {extractedData.phone && <div className="flex justify-between"><span className="text-slate-500">Phone</span><span className="text-slate-200 text-right">{extractedData.phone}</span></div>}
                {extractedData.email && <div className="flex justify-between"><span className="text-slate-500">Email</span><span className="text-slate-200 text-right">{extractedData.email}</span></div>}
                {extractedData.company && <div className="flex justify-between"><span className="text-slate-500">Company</span><span className="text-slate-200 text-right">{extractedData.company}</span></div>}
                {extractedData.fleetSize && <div className="flex justify-between"><span className="text-slate-500">Fleet Size</span><span className="text-slate-200 text-right">{extractedData.fleetSize}</span></div>}
                {extractedData.preferredDate && <div className="flex justify-between"><span className="text-slate-500">Date</span><span className="text-slate-200 text-right">{extractedData.preferredDate}</span></div>}
                {extractedData.preferredTime && <div className="flex justify-between"><span className="text-slate-500">Time</span><span className="text-slate-200 text-right">{extractedData.preferredTime}</span></div>}
                {extractedData.meetingPurpose && <div className="flex flex-col"><span className="text-slate-500">Purpose</span><span className="text-slate-200">{extractedData.meetingPurpose}</span></div>}
                {extractedData.issue && <div className="flex flex-col"><span className="text-slate-500">Issue</span><span className="text-slate-200">{extractedData.issue}</span></div>}
                {extractedData.urgency && <div className="flex justify-between"><span className="text-slate-500">Urgency</span><span className={`text-right font-medium ${extractedData.urgency === 'CRITICAL' ? 'text-red-400' : extractedData.urgency === 'HIGH' ? 'text-orange-400' : 'text-slate-200'}`}>{extractedData.urgency}</span></div>}
              </div>
            ) : (
              <p className="text-xs text-slate-600 py-2 text-center">No details collected yet</p>
            )}
          </div>

          {/* Action Log */}
          <div className="rounded-lg border border-slate-700 bg-slate-900/80 p-3">
            <div className="flex items-center gap-2 mb-2">
              <svg className="h-4 w-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider">Actions</span>
            </div>
            {actionLog.length > 0 ? (
              <div className="space-y-1.5 max-h-40 overflow-y-auto">
                {actionLog.map((a, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    <div className={`h-1.5 w-1.5 rounded-full flex-shrink-0 ${
                      a.status === 'completed' || a.status === 'success' ? 'bg-green-400' :
                      a.status === 'failed' || a.status === 'error' ? 'bg-red-400' :
                      'bg-amber-400'
                    }`} />
                    <span className="text-slate-400 flex-1">{a.action}</span>
                    {a.detail && <span className="text-slate-500">{a.detail}</span>}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-600 py-2 text-center">No actions yet</p>
            )}
          </div>

          {/* Live Call Panel */}
          <div className="rounded-lg border border-slate-700 bg-slate-900/80 p-3">
            <div className="flex items-center gap-2 mb-2">
              <svg className="h-4 w-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 3.75v4.5m0-4.5h-4.5m4.5 0l-6 6m3 12c-8.284 0-15-6.716-15-15V4.5A2.25 2.25 0 014.5 2.25h1.372c.516 0 .966.351 1.091.852l1.106 4.423c.11.44-.054.902-.417 1.173l-1.293.97a1.062 1.062 0 00-.38 1.21 12.035 12.035 0 007.143 7.143c.441.162.928-.004 1.21-.38l.97-1.293a1.125 1.125 0 011.173-.417l4.423 1.106c.5.125.852.575.852 1.091V19.5a2.25 2.25 0 01-2.25 2.25h-2.25z" />
              </svg>
              <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider">Call Panel</span>
            </div>
            <div className="space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-500">Status</span>
                <span className={`font-medium ${callActive ? 'text-green-400' : 'text-slate-400'}`}>{callActive ? 'Active' : 'Inactive'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Duration</span>
                <span className="text-slate-200 font-mono">{callActive ? formatDuration(callDuration) : '--:--'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Audio</span>
                <span className={isMuted ? 'text-amber-400' : 'text-green-400'}>{isMuted ? 'Muted' : 'Active'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Session</span>
                <span className="text-slate-200 font-mono text-[10px]">{sessionId ? sessionId.substring(0, 12) + '...' : '--'}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Live Transcript */}
      <div className="rounded-lg border border-slate-700 bg-slate-900/80 p-3">
        <div className="flex items-center gap-2 mb-2">
          <svg className="h-4 w-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 8.511c.884.284 1.5 1.128 1.5 2.097v4.286c0 1.136-.847 2.1-1.98 2.193-.34.027-.68.052-1.02.072v3.091l-3-3c-1.354 0-2.694-.055-4.02-.163a2.115 2.115 0 01-.825-.242m9.345-8.334a2.126 2.126 0 00-.476-.095 48.64 48.64 0 00-8.048 0c-1.131.094-1.976 1.057-1.976 2.192v4.286c0 .837.46 1.58 1.155 1.951m9.345-8.334V6.637c0-1.621-1.152-3.026-2.76-3.235A48.455 48.455 0 0011.25 3c-2.115 0-4.198.137-6.24.402-1.608.209-2.76 1.614-2.76 3.235v6.226c0 1.621 1.152 3.026 2.76 3.235.577.075 1.157.14 1.74.194V21l4.155-4.155" />
          </svg>
          <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
            Live Transcript
            {callActive && <span className="ml-2 text-green-400 animate-pulse">●</span>}
          </span>
          <span className="text-xs text-slate-500 ml-auto">{messages.length} messages</span>
        </div>
        <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1">
          {messages.length === 0 ? (
            <p className="text-xs text-slate-600 py-4 text-center">Start a conversation to see the transcript</p>
          ) : (
            messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[75%] rounded-xl px-3 py-2 text-xs ${
                  msg.role === 'user'
                    ? 'bg-cyan-600/20 text-cyan-200 border border-cyan-700/30'
                    : 'bg-slate-700/50 text-slate-300 border border-slate-600/30'
                }`}>
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span className="text-[10px] font-medium opacity-60">{msg.role === 'user' ? 'You' : 'Receptionist'}</span>
                    <span className="text-[10px] opacity-40">{new Date(msg.timestamp).toLocaleTimeString()}</span>
                  </div>
                  <p className="leading-relaxed">{normalizeText(msg.content)}</p>
                </div>
              </div>
            ))
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Thinking indicator */}
      {isThinking && (
        <div className="flex justify-center py-1">
          <div className="flex space-x-1.5">
            <div className="h-2 w-2 animate-bounce rounded-full bg-cyan-400" />
            <div className="h-2 w-2 animate-bounce rounded-full bg-cyan-400" style={{ animationDelay: '0.1s' }} />
            <div className="h-2 w-2 animate-bounce rounded-full bg-cyan-400" style={{ animationDelay: '0.2s' }} />
          </div>
        </div>
      )}

      {/* Voice support warning */}
      {!voiceSupported && (
        <p className="text-center text-xs text-amber-400">Voice input not supported. Please use text input.</p>
      )}
    </div>
  );
}
