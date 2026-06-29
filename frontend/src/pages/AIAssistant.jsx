import { useState, useEffect, useRef } from 'react';
import api from '../services/api';
import ReactMarkdown from 'react-markdown';

const SUGGESTED_PROMPTS = [
  'Summarize my fleet health',
  'Which vehicle should I repair first?',
  'Show Honda Amaze',
  'What about its battery?',
  'Compare it with Mazda 3',
  'Which vehicles have battery low and maintenance due?',
  'Why is RPM not updating?',
  'Which vehicle is likely to fail next?',
  'Create work order for Honda Amaze',
  'Generate executive report',
  'Show vehicles offline for more than 3 days',
];

export default function AIAssistant() {
  const [chats, setChats] = useState([]);
  const [currentChat, setCurrentChat] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [typing, setTyping] = useState(false);
  const [vehicles, setVehicles] = useState([]);
  const [selectedVehicle, setSelectedVehicle] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [lastResponse, setLastResponse] = useState(null);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    fetchChats();
    fetchVehicles();
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, typing]);

  const fetchChats = async () => {
    try {
      const res = await api.get('/ai/chats');
      setChats(res.data?.data || []);
    } catch (error) {
      console.error('Error fetching chats:', error);
    }
  };

  const fetchVehicles = async () => {
    try {
      const res = await api.get('/vehicles?limit=50');
      setVehicles(res.data?.data || []);
    } catch (error) {
      console.error('Error fetching vehicles:', error);
    }
  };

  const loadChat = async (chatId) => {
    try {
      setLoading(true);
      const res = await api.get(`/ai/chats/${chatId}`);
      const chat = res.data?.data;

      setCurrentChat(chat || null);
      setMessages(chat?.messages || []);
      setSidebarOpen(false);
    } catch (error) {
      console.error('Error loading chat:', error);
    } finally {
      setLoading(false);
    }
  };

  const startNewChat = () => {
    setCurrentChat(null);
    setMessages([]);
    setSelectedVehicle('');
    setSidebarOpen(false);
    setLastResponse(null);
  };

  const sendMessage = async (messageText = input) => {
    if (!messageText?.trim() || loading) return;

    const userMessage = messageText.trim();

    setInput('');
    setMessages((prev) => [...prev, { role: 'user', content: userMessage }]);
    setLoading(true);
    setTyping(true);

    try {
      const token = localStorage.getItem('accessToken');

      if (!token) {
        localStorage.clear();
        window.location.href = '/login';
        return;
      }

      const res = await api.post(
        '/ai/chat',
        {
          message: userMessage,
          vehicleId: selectedVehicle || null,
          chatId: currentChat?.id || null,
        },
        { timeout: 30000 }
      );

      const responseData = res.data?.data || res.data || {};

      const aiResponse =
        responseData.reply ||
        responseData.response ||
        responseData.message ||
        'I could not generate a response right now. Please try again.';

      const metadata = responseData.metadata || {};

      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: aiResponse,
          confidence: metadata.confidence || 'MEDIUM',
          dataFreshness: metadata.dataFreshness || 'UNKNOWN',
          simulatedNote: metadata.simulatedNote || null,
          suggestedActions: metadata.suggestedActions || [],
        },
      ]);

      setLastResponse(aiResponse);

      if (!currentChat && responseData.chatId) {
        setCurrentChat({ id: responseData.chatId });
        await fetchChats();
      } else {
        await fetchChats();
      }
    } catch (error) {
      console.error('Error sending message:', error);

      if (error.response?.status === 401) {
        localStorage.clear();
        window.location.href = '/login';
        return;
      }

      const rawError =
        error.response?.data?.error ||
        error.response?.data?.message ||
        error.response?.data ||
        error.message ||
        'Unknown error';

      const backendMessage =
        typeof rawError === 'string'
          ? rawError
          : JSON.stringify(rawError, null, 2);

      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: `AI Assistant error: ${backendMessage}\n\nPlease try again after a few seconds.`,
          confidence: 'LOW',
          dataFreshness: 'UNKNOWN',
        },
      ]);
    } finally {
      setTyping(false);
      setLoading(false);
    }
  };

  const regenerateResponse = async () => {
    const lastUserMessage = [...messages].reverse().find((m) => m.role === 'user')?.content;
    if (!lastUserMessage || loading) return;

    setMessages((prev) => {
      const copy = [...prev];
      const lastAssistantIndex = copy.map((m) => m.role).lastIndexOf('assistant');
      if (lastAssistantIndex !== -1) copy.splice(lastAssistantIndex, 1);
      return copy;
    });

    await sendMessage(lastUserMessage);
  };

  const copyResponse = async () => {
    if (!lastResponse) return;
    await navigator.clipboard.writeText(lastResponse);
  };

  const handleFeedback = (feedback) => {
    console.log('Feedback:', feedback);
  };

  const deleteChat = async (chatId, e) => {
    e.stopPropagation();

    try {
      const res = await api.delete(`/ai/chats/${chatId}`);

      if (currentChat?.id === chatId) {
        startNewChat();
      }

      await fetchChats();
    } catch (error) {
      console.error('Error deleting chat:', error);
      
      // Show user-friendly error message
      const errorMessage = error.response?.data?.error || 
                          error.response?.data?.message || 
                          'Failed to delete chat. Please try again.';
      alert(errorMessage);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const handleSuggestedAction = (action) => {
    if (!action) return;

    if (typeof action === 'string') {
      sendMessage(action);
      return;
    }

    if (action.prompt) {
      sendMessage(action.prompt);
      return;
    }

    if (action.label) {
      sendMessage(action.label);
    }
  };

  return (
    <div className="flex h-screen bg-slate-900">
      {sidebarOpen && (
        <div className="w-72 border-r border-slate-700 bg-slate-800 flex flex-col">
          <div className="p-4 border-b border-slate-700">
            <button
              onClick={startNewChat}
              className="w-full rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 transition-colors"
            >
              + New Chat
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4">
            <h3 className="mb-3 text-sm font-semibold text-slate-400">Recent Chats</h3>

            {chats.length === 0 ? (
              <p className="text-sm text-slate-500">No chat history</p>
            ) : (
              <div className="space-y-2">
                {chats.map((chat) => (
                  <div
                    key={chat.id}
                    onClick={() => loadChat(chat.id)}
                    className="group flex cursor-pointer rounded-lg p-3 hover:bg-slate-700 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="truncate text-sm text-white">
                        {chat.title || 'Untitled Chat'}
                      </p>
                      <p className="text-xs text-slate-400">
                        {chat.createdAt ? new Date(chat.createdAt).toLocaleDateString() : ''}
                      </p>
                    </div>

                    <button
                      onClick={(e) => deleteChat(chat.id, e)}
                      className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-400 transition-opacity"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      <div className="flex-1 flex flex-col">
        <div className="flex items-center justify-between border-b border-slate-700 bg-slate-800 p-4">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="text-slate-400 hover:text-white transition-colors"
            >
              ☰
            </button>

            <h1 className="text-xl font-bold text-white">FleetNimble AI Assistant</h1>
          </div>

          <select
            value={selectedVehicle}
            onChange={(e) => setSelectedVehicle(e.target.value)}
            className="rounded-lg border border-slate-600 bg-slate-700 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
          >
            <option value="">All Vehicles</option>
            {vehicles.map((v) => (
              <option key={v.id} value={v.id}>
                {v.make || ''} {v.model || v.name || ''} ({v.plateNumber || v.vin || 'No plate'})
              </option>
            ))}
          </select>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {messages.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center">
              <div className="mb-8 text-center">
                <h2 className="mb-4 text-2xl font-bold text-white">
                  Welcome to FleetNimble AI Assistant
                </h2>
                <p className="text-slate-400">
                  Ask about fleet health, live diagnostics, GPS, alerts, DTC codes, and
                  maintenance.
                </p>
              </div>

              <div className="grid max-w-3xl grid-cols-2 gap-4">
                {SUGGESTED_PROMPTS.map((prompt) => (
                  <button
                    key={prompt}
                    onClick={() => sendMessage(prompt)}
                    disabled={loading}
                    className="rounded-lg border border-slate-600 bg-slate-800 p-4 text-left text-sm text-white hover:border-blue-500 hover:bg-slate-700 transition-all disabled:opacity-50"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="max-w-3xl mx-auto space-y-6">
              {messages.map((message, index) => (
                <div
                  key={index}
                  className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[80%] rounded-2xl px-4 py-3 ${
                      message.role === 'user'
                        ? 'bg-blue-600 text-white'
                        : 'bg-slate-700 text-white'
                    }`}
                  >
                    {message.role === 'assistant' ? (
                      <div className="prose prose-invert prose-sm max-w-none">
                        <ReactMarkdown>{message.content || ''}</ReactMarkdown>

                        {message.simulatedNote && (
                          <div className="mt-3 rounded-lg bg-yellow-900/30 border border-yellow-700/50 px-3 py-2 text-xs text-yellow-300">
                            ⚠️ {message.simulatedNote}
                          </div>
                        )}

                        {index === messages.length - 1 && (
                          <div className="mt-4 border-t border-slate-600 pt-4">
                            <div className="flex items-center justify-between mb-3">
                              <div className="flex flex-wrap items-center gap-2">
                                {message.confidence && (
                                  <span className="inline-flex items-center rounded-full bg-green-900/50 px-2 py-1 text-xs font-medium text-green-400">
                                    Confidence: {message.confidence}
                                  </span>
                                )}

                                {message.dataFreshness && (
                                  <span className="inline-flex items-center rounded-full bg-blue-900/50 px-2 py-1 text-xs font-medium text-blue-400">
                                    {message.dataFreshness}
                                  </span>
                                )}
                              </div>

                              <div className="flex items-center gap-2">
                                <button
                                  onClick={copyResponse}
                                  className="text-slate-400 hover:text-white transition-colors"
                                  title="Copy response"
                                >
                                  📋
                                </button>

                                <button
                                  onClick={regenerateResponse}
                                  disabled={loading}
                                  className="text-slate-400 hover:text-white transition-colors disabled:opacity-50"
                                  title="Regenerate response"
                                >
                                  🔄
                                </button>
                              </div>
                            </div>

                            <div className="flex items-center gap-2 mb-4">
                              <button
                                onClick={() => handleFeedback('up')}
                                className="text-slate-400 hover:text-green-400 transition-colors"
                                title="Helpful"
                              >
                                👍
                              </button>
                              <button
                                onClick={() => handleFeedback('down')}
                                className="text-slate-400 hover:text-red-400 transition-colors"
                                title="Not helpful"
                              >
                                👎
                              </button>
                            </div>

                            <div className="space-y-2">
                              <p className="text-xs text-slate-400">Suggested actions:</p>
                              <div className="flex flex-wrap gap-2">
                                {(message.suggestedActions?.length
                                  ? message.suggestedActions
                                  : [
                                      'Open Diagnostics',
                                      'Open GPS',
                                      'Create Work Order',
                                      'Generate Report',
                                    ]
                                ).map((action, i) => {
                                  const label = typeof action === 'string' ? action : action.label;
                                  return (
                                    <button
                                      key={`${label}-${i}`}
                                      onClick={() => handleSuggestedAction(action)}
                                      className="rounded-lg border border-slate-600 bg-slate-800 px-3 py-1.5 text-xs text-white hover:border-blue-500 hover:bg-slate-700 transition-all"
                                    >
                                      {label}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <p className="whitespace-pre-wrap">{message.content}</p>
                    )}
                  </div>
                </div>
              ))}

              {typing && (
                <div className="flex justify-start">
                  <div className="rounded-2xl bg-slate-700 px-4 py-3 text-white">
                    <div className="flex space-x-2">
                      <div className="h-2 w-2 animate-bounce rounded-full bg-slate-400"></div>
                      <div className="h-2 w-2 animate-bounce rounded-full bg-slate-400 delay-100"></div>
                      <div className="h-2 w-2 animate-bounce rounded-full bg-slate-400 delay-200"></div>
                    </div>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        <div className="border-t border-slate-700 bg-slate-800 p-4">
          <div className="max-w-3xl mx-auto">
            <div className="flex gap-2">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyPress}
                placeholder="Ask about your fleet..."
                disabled={loading}
                rows={1}
                className="flex-1 resize-none rounded-lg border border-slate-600 bg-slate-700 px-4 py-3 text-white placeholder-slate-400 focus:border-blue-500 focus:outline-none disabled:opacity-50"
              />

              <button
                onClick={() => sendMessage()}
                disabled={loading || !input.trim()}
                className="rounded-lg bg-blue-600 px-6 py-3 text-white hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:hover:bg-blue-600"
              >
                {loading ? 'Sending...' : 'Send'}
              </button>
            </div>

            <p className="mt-2 text-xs text-slate-500">
              FleetNimble AI Assistant uses your fleet data. For serious issues, consult a
              qualified mechanic.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}