import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import ReactMarkdown from 'react-markdown';

const SUGGESTED_PROMPTS = [
  "Summarize my fleet health",
  "Why is this vehicle offline?",
  "Explain latest DTC codes",
  "Which vehicles have low battery?",
  "What maintenance is needed?",
  "Show today's GPS/trip summary",
];

export default function AIAssistant() {
  const navigate = useNavigate();
  const [chats, setChats] = useState([]);
  const [currentChat, setCurrentChat] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [vehicles, setVehicles] = useState([]);
  const [selectedVehicle, setSelectedVehicle] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const messagesEndRef = useRef(null);

  // Fetch chats and vehicles on load
  useEffect(() => {
    fetchChats();
    fetchVehicles();
  }, []);

  // Auto-scroll to bottom of messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const fetchChats = async () => {
    try {
      const res = await api.get('/ai/chats');
      setChats(res.data.data);
    } catch (error) {
      console.error('Error fetching chats:', error);
    }
  };

  const fetchVehicles = async () => {
    try {
      const res = await api.get('/vehicles?limit=50');
      setVehicles(res.data.data || []);
    } catch (error) {
      console.error('Error fetching vehicles:', error);
    }
  };

  const loadChat = async (chatId) => {
    try {
      setLoading(true);
      const res = await api.get(`/ai/chats/${chatId}`);
      setCurrentChat(res.data.data);
      setMessages(res.data.data.messages);
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
  };

  const sendMessage = async (messageText = input, useStream = true) => {
    if (!messageText.trim()) return;

    const userMessage = messageText;
    setInput('');
    setMessages((prev) => [...prev, { role: 'user', content: userMessage }]);
    setLoading(true);

    try {
      if (useStream) {
        // Streaming response
        const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:5000'}/api/ai/chat`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('token')}`,
          },
          body: JSON.stringify({
            message: userMessage,
            vehicleId: selectedVehicle || null,
            chatId: currentChat?.id || null,
            stream: true,
          }),
        });

        if (!response.ok) {
          throw new Error('Failed to send message');
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let aiResponse = '';
        
        // Add empty assistant message that will be updated with chunks
        setMessages((prev) => [...prev, { role: 'assistant', content: '' }]);
        
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value);
          const lines = chunk.split('\n').filter(line => line.trim() !== '');

          for (const line of lines) {
            if (line === 'data: [DONE]') continue;
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6));
                if (data.chunk) {
                  aiResponse += data.chunk;
                  setMessages((prev) => {
                    const newMessages = [...prev];
                    newMessages[newMessages.length - 1] = { role: 'assistant', content: aiResponse };
                    return newMessages;
                  });
                }
                if (data.error) {
                  throw new Error(data.error);
                }
              } catch (e) {
                // Skip invalid JSON
              }
            }
          }
        }

        if (!currentChat) {
          setCurrentChat({ id: await getChatIdFromResponse() });
          await fetchChats();
        }
      } else {
        // Non-streaming response
        const res = await api.post('/ai/chat', {
          message: userMessage,
          vehicleId: selectedVehicle || null,
          chatId: currentChat?.id || null,
        });

        const aiResponse = res.data.data.response;
        setMessages((prev) => [...prev, { role: 'assistant', content: aiResponse }]);

        if (!currentChat) {
          setCurrentChat({ id: res.data.data.chatId });
          await fetchChats();
        }
      }
    } catch (error) {
      console.error('Error sending message:', error);
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: 'Sorry, I encountered an error. Please try again.' },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const getChatIdFromResponse = async () => {
    // Fetch the latest chat to get the ID
    const res = await api.get('/ai/chats');
    return res.data.data[0]?.id;
  };

  const deleteChat = async (chatId, e) => {
    e.stopPropagation();
    try {
      await api.delete(`/ai/chats/${chatId}`);
      if (currentChat?.id === chatId) {
        startNewChat();
      }
      await fetchChats();
    } catch (error) {
      console.error('Error deleting chat:', error);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const handleSuggestedPrompt = (prompt) => {
    sendMessage(prompt);
  };

  return (
    <div className="flex h-screen bg-slate-900">
      {/* Sidebar - Chat History */}
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
                      <p className="truncate text-sm text-white">{chat.title}</p>
                      <p className="text-xs text-slate-400">
                        {new Date(chat.createdAt).toLocaleDateString()}
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

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
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
          <div className="flex items-center gap-4">
            {/* Vehicle Selector */}
            <select
              value={selectedVehicle}
              onChange={(e) => setSelectedVehicle(e.target.value)}
              className="rounded-lg border border-slate-600 bg-slate-700 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
            >
              <option value="">All Vehicles</option>
              {vehicles.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.make} {v.model} ({v.plateNumber || v.vin || 'No plate'})
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Messages Area */}
        <div className="flex-1 overflow-y-auto p-4">
          {messages.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center">
              <div className="mb-8 text-center">
                <h2 className="mb-4 text-2xl font-bold text-white">
                  Welcome to FleetNimble AI Assistant
                </h2>
                <p className="text-slate-400">
                  Ask me anything about your fleet health, vehicle diagnostics, GPS status, alerts, DTC codes, and maintenance needs.
                </p>
              </div>

              {/* Suggested Prompts */}
              <div className="grid max-w-3xl grid-cols-2 gap-4">
                {SUGGESTED_PROMPTS.map((prompt) => (
                  <button
                    key={prompt}
                    onClick={() => handleSuggestedPrompt(prompt)}
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
                        <ReactMarkdown>{message.content}</ReactMarkdown>
                      </div>
                    ) : (
                      <p className="whitespace-pre-wrap">{message.content}</p>
                    )}
                  </div>
                </div>
              ))}
              {loading && (
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

        {/* Input Area */}
        <div className="border-t border-slate-700 bg-slate-800 p-4">
          <div className="max-w-3xl mx-auto">
            <div className="flex gap-2">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyPress={handleKeyPress}
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
                Send
              </button>
            </div>
            <p className="mt-2 text-xs text-slate-500">
              FleetNimble AI Assistant uses your fleet data to provide accurate answers.
              For serious issues, always consult a qualified mechanic.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
