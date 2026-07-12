import { useState, useRef, useEffect, useCallback } from 'react';
import api from '../services/api';
import { normalizeDisplayText } from '../utils/normalizeDisplayText';

export default function VoiceReceptionistAgent({ showToast }) {
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
  const [micPermission, setMicPermission] = useState(null);

  const recognitionRef = useRef(null);
  const synthRef = useRef(window.speechSynthesis);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    const hasSR = 'SpeechRecognition' in window || 'webkitSpeechRecognition' in window;
    const hasSS = 'speechSynthesis' in window;
    setVoiceSupported(hasSR && hasSS);
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, reply]);

  const addMessage = useCallback((role, content) => {
    if (!content) return;
    setMessages(prev => [...prev, { role, content, timestamp: new Date().toISOString() }]);
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

      const res = await api.post('/ai-receptionist/agent/start');
      const data = res.data;

      console.log('Agent start response:', data);

      setSessionId(data.sessionId);
      setStage(data.conversationStage || 'greeting');
      const greeting = normalizeDisplayText(data.reply || data.greeting || '');
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
      console.log('No sessionId, starting conversation first...');
      await startConversation();
      sid = sessionId;
      if (!sid) {
        showToast?.('Failed to create session. Please try again.', 'error');
        return;
      }
    }

    if (isThinking) return;
    setIsThinking(true);
    cancelSpeech();

    addMessage('user', trimmed);
    setReply('');

    const payload = { sessionId: sid, message: trimmed, mode: 'voice' };
    console.log('VOICE_AGENT_SEND', payload);

    try {
      const res = await api.post('/ai-receptionist/agent/message', payload);
      const data = res.data;

      console.log('VOICE_AGENT_RESPONSE', data);

      setStage(data.conversationStage || '');
      const replyText = normalizeDisplayText(data.reply || '');
      setReply(replyText);
      setExtractedData(data.extractedData || {});
      setSuggestedReplies(data.suggestedReplies || []);
      setRequiresConfirmation(!!data.requiresConfirmation);
      setPendingAction(data.pendingAction || null);
      setIsComplete(!!data.isComplete);
      setIsThinking(false);

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
      const res = await api.post('/ai-receptionist/agent/confirm', {
        sessionId,
        action: confirmed ? pendingAction : null,
      });
      const data = res.data;

      console.log('Agent confirm response:', data);

      setStage(data.conversationStage || '');
      const replyText = normalizeDisplayText(data.reply || '');
      setReply(replyText);
      setExtractedData(data.extractedData || {});
      setSuggestedReplies(data.suggestedReplies || []);
      setRequiresConfirmation(!!data.requiresConfirmation);
      setPendingAction(data.pendingAction || null);
      setIsComplete(!!data.isComplete);
      setIsThinking(false);

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
    if (!SpeechRecognition) {
      showToast?.('Speech recognition not available.', 'error');
      return;
    }

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
          if (transcript) {
            sendMessage(transcript);
          } else {
            showToast?.("I couldn't hear anything. Please try again.", 'error');
            setIsListening(false);
          }
        }
      };

      recognition.onerror = (event) => {
        console.error('Speech recognition error:', event.error);
        setIsListening(false);
        if (event.error === 'not-allowed') {
          setMicPermission('denied');
          showToast?.('Microphone access denied. Please use text input.', 'error');
        } else if (event.error === 'no-speech') {
          showToast?.('No speech detected. Please try again.', 'error');
        } else {
          showToast?.('Could not hear clearly. Please try again or use text.', 'error');
        }
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

  const handleSuggestedReply = (reply) => sendMessage(reply);

  const handleEndSession = async () => {
    cancelSpeech();
    if (sessionId) {
      try {
        await api.post('/ai-receptionist/agent/end', { sessionId });
      } catch {}
    }
    setSessionId(null);
    setStage('idle');
    setMessages([]);
    setReply('');
    setExtractedData({});
    setIsComplete(false);
    setSuggestedReplies([]);
  };

  if (stage === 'idle') {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <div className="mb-6 rounded-full bg-gradient-to-br from-cyan-500/20 to-blue-600/20 p-8">
          <svg className="h-16 w-16 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" />
          </svg>
        </div>
        <h3 className="text-xl font-semibold text-white mb-2">Talk to FleetNimble AI Receptionist</h3>
        <p className="text-sm text-slate-400 text-center max-w-md mb-8">
          Voice-first receptionist that speaks with customers, answers FleetNimble questions, collects details, and schedules appointments automatically.
        </p>
        <button
          onClick={startConversation}
          className="flex items-center gap-3 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 px-8 py-4 text-lg font-semibold text-white shadow-lg shadow-cyan-500/25 hover:from-cyan-500 hover:to-blue-500 transition-all"
        >
          <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z" />
          </svg>
          Start Voice Conversation
        </button>
        {!voiceSupported && (
          <p className="mt-4 text-xs text-amber-400">
            Voice features not fully supported in this browser. Text mode will be used.
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`h-3 w-3 rounded-full ${isListening ? 'bg-green-500 animate-pulse' : isSpeaking ? 'bg-cyan-500 animate-pulse' : isThinking ? 'bg-amber-500 animate-pulse' : 'bg-slate-500'}`} />
          <span className="text-sm text-slate-400">
            {isListening ? 'Listening...' : isSpeaking ? 'Speaking...' : isThinking ? 'Thinking...' : 'Ready'}
          </span>
        </div>
        <button onClick={handleEndSession} className="rounded-lg border border-slate-600 px-3 py-1.5 text-xs text-slate-400 hover:text-white hover:border-slate-500 transition-colors">
          End Conversation
        </button>
      </div>

      <div className="flex justify-center py-4">
        <button
          onClick={isListening ? undefined : startVoiceInput}
          disabled={isThinking || isComplete}
          className={`rounded-full p-6 transition-all ${
            isListening
              ? 'bg-green-500 shadow-lg shadow-green-500/50 scale-110'
              : 'bg-slate-700 hover:bg-slate-600 hover:scale-105'
          } disabled:opacity-50 disabled:cursor-not-allowed`}
        >
          <svg className={`h-10 w-10 ${isListening ? 'text-white' : 'text-slate-300'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" />
          </svg>
        </button>
      </div>

      {reply && (
        <div className="card border border-cyan-800/40 bg-slate-800/80">
          <p className="text-sm text-slate-100 leading-relaxed whitespace-pre-line">{reply}</p>
        </div>
      )}

      {messages.length > 1 && (
        <div className="max-h-48 overflow-y-auto space-y-2 rounded-lg border border-slate-700 bg-slate-900/50 p-3">
          <p className="text-xs font-medium text-slate-500 mb-2">Conversation History</p>
          {messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[85%] rounded-xl px-3 py-2 text-xs ${
                msg.role === 'user' ? 'bg-cyan-600/30 text-cyan-200' : 'bg-slate-700/50 text-slate-300'
              }`}>
                {normalizeDisplayText(msg.content).substring(0, 200)}
              </div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>
      )}

      {Object.keys(extractedData).some(k => extractedData[k]) && (
        <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-3">
          <p className="mb-1.5 text-xs font-semibold text-slate-400 uppercase tracking-wider">Collected Details</p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-slate-300">
            {extractedData.callerName && <span><span className="text-slate-500">Name:</span> {extractedData.callerName}</span>}
            {extractedData.phone && <span><span className="text-slate-500">Phone:</span> {extractedData.phone}</span>}
            {extractedData.email && <span><span className="text-slate-500">Email:</span> {extractedData.email}</span>}
            {extractedData.company && <span><span className="text-slate-500">Company:</span> {extractedData.company}</span>}
            {extractedData.fleetSize && <span><span className="text-slate-500">Fleet:</span> {extractedData.fleetSize} vehicles</span>}
            {extractedData.preferredDate && <span><span className="text-slate-500">Date:</span> {extractedData.preferredDate}</span>}
            {extractedData.preferredTime && <span><span className="text-slate-500">Time:</span> {extractedData.preferredTime}</span>}
            {extractedData.meetingPurpose && <span className="col-span-2"><span className="text-slate-500">Purpose:</span> {extractedData.meetingPurpose}</span>}
            {extractedData.issue && <span className="col-span-2"><span className="text-slate-500">Issue:</span> {extractedData.issue}</span>}
            {extractedData.urgency && <span><span className="text-slate-500">Urgency:</span> {extractedData.urgency}</span>}
          </div>
        </div>
      )}

      {requiresConfirmation && (
        <div className="flex justify-center gap-4">
          <button
            onClick={() => sendConfirmation(true)}
            disabled={isThinking}
            className="rounded-lg bg-green-600 px-6 py-2.5 text-sm font-medium text-white hover:bg-green-500 disabled:opacity-50 transition-colors"
          >
            Yes, Confirm
          </button>
          <button
            onClick={() => sendConfirmation(false)}
            disabled={isThinking}
            className="rounded-lg border border-slate-600 px-6 py-2.5 text-sm font-medium text-slate-300 hover:bg-slate-700 disabled:opacity-50 transition-colors"
          >
            No, Change
          </button>
        </div>
      )}

      {suggestedReplies.length > 0 && !requiresConfirmation && (
        <div className="flex flex-wrap gap-2 justify-center">
          {suggestedReplies.map((suggestion, i) => (
            <button
              key={i}
              onClick={() => handleSuggestedReply(suggestion)}
              disabled={isThinking}
              className="rounded-full border border-cyan-700/50 px-4 py-1.5 text-xs text-cyan-300 hover:bg-cyan-900/30 disabled:opacity-50 transition-colors"
            >
              {suggestion}
            </button>
          ))}
        </div>
      )}

      {isThinking && (
        <div className="flex justify-center py-2">
          <div className="flex space-x-2">
            <div className="h-2 w-2 animate-bounce rounded-full bg-cyan-400" />
            <div className="h-2 w-2 animate-bounce rounded-full bg-cyan-400 delay-100" />
            <div className="h-2 w-2 animate-bounce rounded-full bg-cyan-400 delay-200" />
          </div>
        </div>
      )}

      <form onSubmit={handleTextSubmit} className="flex gap-2">
        <input
          type="text"
          value={textInput}
          onChange={(e) => setTextInput(e.target.value)}
          placeholder={isListening ? 'Listening...' : isComplete ? 'Conversation ended' : 'Type your message...'}
          disabled={isListening || isThinking || isComplete}
          className="input flex-1 disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={!textInput.trim() || isThinking || isListening || isComplete}
          className="btn-primary bg-cyan-600 hover:bg-cyan-700 disabled:opacity-50 px-4"
        >
          Send
        </button>
      </form>

      {isComplete && (
        <div className="flex justify-center pt-2">
          <button
            onClick={startConversation}
            className="rounded-lg bg-cyan-600 px-6 py-2.5 text-sm font-medium text-white hover:bg-cyan-500 transition-colors"
          >
            Start New Conversation
          </button>
        </div>
      )}

      {!voiceSupported && (
        <p className="text-center text-xs text-amber-400">Voice input not supported. Please use text input.</p>
      )}
    </div>
  );
}
