import React, { useState, useRef, useEffect } from 'react';

interface ChatMessage {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  time: string;
}

interface AiSupportChatProps {
  brand?: 'loadsnexus' | 'shippingwish';
  onOpenCarrierCheckout?: () => void;
  onOpenBrokerPost?: () => void;
}

export const AiSupportChat: React.FC<AiSupportChatProps> = ({
  brand = 'loadsnexus',
  onOpenCarrierCheckout,
  onOpenBrokerPost
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      sender: 'assistant',
      text: brand === 'loadsnexus'
        ? "👋 Hi! I'm Jordan, your 24/7 LoadsNexus™ Freight Copilot. Need help finding spot freight, unlocking direct broker phone numbers, or posting freight for free?"
        : "👋 Hi! I'm Alex with Shipping Wish 24/7 Dispatch. Looking to keep your trucks moving at $7,500+ gross with our 7-Day $0 Free Trial?",
      time: 'Just now'
    }
  ]);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (isOpen) {
      scrollToBottom();
    }
  }, [messages, isOpen]);

  const handleSend = async (textToSend?: string) => {
    const text = (textToSend || input).trim();
    if (!text || isLoading) return;

    const userMsg: ChatMessage = {
      id: `${Date.now()}-user`,
      sender: 'user',
      text,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    setMessages((prev) => [...prev, userMsg]);
    if (!textToSend) setInput('');
    setIsLoading(true);

    try {
      const historyPayload = messages.slice(-6).map((m) => ({
        role: m.sender,
        content: m.text
      }));

      const res = await fetch('/api/chat/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          brand,
          history: historyPayload
        })
      });

      const data = await res.json();
      const replyText = data?.reply || "Thank you. Our dispatch desk is available toll-free at +1 (800) 580-3101.";

      const aiMsg: ChatMessage = {
        id: `${Date.now()}-ai`,
        sender: 'assistant',
        text: replyText,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };

      setMessages((prev) => [...prev, aiMsg]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: `${Date.now()}-err`,
          sender: 'assistant',
          text: "I'm connecting with our dispatch desk. Please feel free to call our toll-free line anytime at +1 (800) 580-3101.",
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const quickPrompts = brand === 'loadsnexus'
    ? [
        'How does the $19 pass work?',
        'How to post freight for free?',
        'How do you stop double-brokering?',
        'What equipment is supported?'
      ]
    : [
        'How does 7-day free trial work?',
        'What are your weekly gross rates?',
        'Do you take a percentage cut?',
        'What back-office work is included?'
      ];

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end">
      {/* Expanded Chat Window */}
      {isOpen && (
        <div className="w-[92vw] sm:w-[380px] h-[520px] max-h-[80vh] bg-white border border-slate-200/90 rounded-2xl shadow-2xl flex flex-col overflow-hidden mb-3.5 animate-in fade-in slide-in-from-bottom-5 duration-200">
          {/* Header */}
          <div className="p-4 bg-gradient-to-r from-slate-900 to-blue-950 text-white flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2.5">
              <div className="relative">
                <div className="w-8 h-8 rounded-full bg-blue-600 text-white font-black text-xs flex items-center justify-center shadow-sm">
                  {brand === 'loadsnexus' ? 'LN' : 'SW'}
                </div>
                <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-slate-900"></span>
              </div>
              <div>
                <h4 className="font-display font-extrabold text-xs sm:text-sm tracking-tight text-white leading-tight">
                  {brand === 'loadsnexus' ? 'LoadsNexus™ AI Copilot' : 'Shipping Wish AI Dispatch'}
                </h4>
                <div className="flex items-center gap-1.5 text-[10px] text-emerald-400 font-medium">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                  <span>Online · 24/7 Support Desk</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1">
              <a
                href="tel:+18005803101"
                className="px-2 py-1 bg-white/10 hover:bg-white/20 text-white text-[10px] font-bold rounded-lg transition-colors flex items-center gap-1"
                title="Call Toll-Free Desk"
              >
                <span>📞</span>
                <span className="hidden sm:inline">Call</span>
              </a>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="w-7 h-7 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 flex items-center justify-center text-xs transition-colors"
                aria-label="Close Chat"
              >
                ✕
              </button>
            </div>
          </div>

          {/* Messages Container */}
          <div className="flex-1 p-3.5 overflow-y-auto space-y-3 bg-slate-50/60 text-xs">
            {messages.map((m) => {
              const isUser = m.sender === 'user';
              return (
                <div
                  key={m.id}
                  className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}
                >
                  <div
                    className={`max-w-[85%] rounded-2xl p-3 leading-relaxed ${
                      isUser
                        ? 'bg-blue-600 text-white rounded-br-xs shadow-xs'
                        : 'bg-white border border-slate-200 text-slate-800 rounded-bl-xs shadow-xs'
                    }`}
                  >
                    <p className="whitespace-pre-line">{m.text}</p>
                  </div>
                  <span className="text-[9px] text-slate-400 mt-1 px-1">{m.time}</span>
                </div>
              );
            })}

            {isLoading && (
              <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-2xl p-3 w-20 text-slate-400 shadow-xs">
                <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce"></span>
                <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce [animation-delay:0.2s]"></span>
                <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce [animation-delay:0.4s]"></span>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Quick Platform Actions */}
          {(onOpenCarrierCheckout || onOpenBrokerPost) && (
            <div className="px-3 py-1.5 bg-slate-100/80 border-t border-slate-200/80 flex items-center gap-2 shrink-0">
              {onOpenCarrierCheckout && (
                <button
                  type="button"
                  onClick={() => {
                    onOpenCarrierCheckout();
                    setIsOpen(false);
                  }}
                  className="flex-1 py-1 px-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-[10px] font-bold transition-colors text-center shadow-2xs"
                >
                  ⚡ $19 Carrier Pass
                </button>
              )}
              {onOpenBrokerPost && (
                <button
                  type="button"
                  onClick={() => {
                    onOpenBrokerPost();
                    setIsOpen(false);
                  }}
                  className="flex-1 py-1 px-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-[10px] font-bold transition-colors text-center shadow-2xs"
                >
                  📦 Post Freight (Free)
                </button>
              )}
            </div>
          )}

          {/* Quick Prompts Chips */}
          <div className="px-3 py-2 bg-white border-t border-slate-100 flex items-center gap-1.5 overflow-x-auto no-scrollbar shrink-0">
            {quickPrompts.map((q, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => handleSend(q)}
                className="px-2.5 py-1 rounded-full bg-slate-100 hover:bg-blue-50 hover:text-blue-700 text-slate-600 text-[10px] font-bold whitespace-nowrap transition-colors border border-slate-200"
              >
                {q}
              </button>
            ))}
          </div>

          {/* Input Bar */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSend();
            }}
            className="p-2.5 bg-white border-t border-slate-200 flex items-center gap-2 shrink-0"
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask anything about freight, rates or dispatch..."
              className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 outline-none focus:bg-white focus:border-blue-600 transition-colors"
            />
            <button
              type="submit"
              disabled={isLoading || !input.trim()}
              className="px-3 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-all shadow-xs shrink-0"
            >
              Send
            </button>
          </form>
        </div>
      )}

      {/* Floating Launcher Trigger */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="group relative flex items-center gap-2 px-4 py-3 rounded-full bg-gradient-to-r from-blue-700 to-indigo-600 hover:from-blue-600 hover:to-indigo-500 text-white font-extrabold text-xs shadow-xl shadow-blue-600/30 hover:shadow-2xl transition-all duration-200 active:scale-95"
        aria-label="Open 24/7 AI Freight Chat"
      >
        <span className="relative flex h-2.5 w-2.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
        </span>
        <span className="text-sm">💬</span>
        <span className="tracking-tight hidden sm:inline">AI Freight Support</span>
      </button>
    </div>
  );
};
