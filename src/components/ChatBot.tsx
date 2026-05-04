'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';

interface ChatMessage {
  id: string;
  role: 'user' | 'bot';
  content: string;
  timestamp: Date;
}

interface ChatBotProps {
  onBotFilter?: (query: string | null) => void;
  activeBotFilter?: string | null;
}

export default function ChatBot({ onBotFilter, activeBotFilter }: ChatBotProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'bot',
      content: '🤖 Olá! Sou o **AgentBot CousinServices**.\n\nAgora estou mais inteligente! Posso comparar lotes, detectar leilões urgentes e gerar relatórios PDF.\n\nComandos principais:\n▸ `/buscar [cidade]` — Filtra o dashboard\n▸ `/comparar #1 #2` — Análise lado a lado\n▸ `/urgente` — Leilões nos próximos 3 dias\n▸ `/exportar` — Gera PDF executivo\n\nDigite `/ajuda` para ver todos os comandos.',
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [pulseCount, setPulseCount] = useState(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  useEffect(() => {
    if (isOpen) inputRef.current?.focus();
  }, [isOpen]);

  // Pulse animation for new filter
  useEffect(() => {
    if (activeBotFilter) setPulseCount(3);
  }, [activeBotFilter]);

  useEffect(() => {
    if (pulseCount > 0) {
      const t = setTimeout(() => setPulseCount(p => p - 1), 600);
      return () => clearTimeout(t);
    }
  }, [pulseCount]);

  // Proactive Urgency Alert
  useEffect(() => {
    const checkUrgency = async () => {
      try {
        const res = await fetch('/api/bot', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: '/urgente' }),
        });
        const data = await res.json();
        if (data.response && !data.response.includes('Nenhum leilão')) {
          setMessages(prev => [...prev, {
            id: `alert-${Date.now()}`,
            role: 'bot',
            content: `🚨 **ALERTA DE OPORTUNIDADE**\nIdentifiquei leilões terminando em breve! Confira digitando \`/urgente\`.`,
            timestamp: new Date(),
          }]);
          setPulseCount(5); // Make the button pulse more to attract attention
        }
      } catch (e) { console.error('Urgency check failed', e); }
    };
    // Delay slightly to not conflict with welcome message
    const timer = setTimeout(checkUrgency, 3000);
    return () => clearTimeout(timer);
  }, []);

  const sendMessage = async () => {
    if (!input.trim() || isLoading) return;

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: input.trim(),
      timestamp: new Date(),
    };

    const userInput = input.trim();
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);

    try {
      const res = await fetch('/api/bot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userInput }),
      });
      const data = await res.json();

      setMessages(prev => [...prev, {
        id: `bot-${Date.now()}`,
        role: 'bot',
        content: data.response || '❌ Sem resposta.',
        timestamp: new Date(),
      }]);

      // Bot → Dashboard integration
      if (onBotFilter) {
        const lower = userInput.toLowerCase();
        if (lower.startsWith('/buscar ')) {
          const query = userInput.substring(8).trim();
          onBotFilter(query);

          // Add integration feedback message
          setMessages(prev => [...prev, {
            id: `sync-${Date.now()}`,
            role: 'bot',
            content: `🔗 Dashboard sincronizado! Os cards agora mostram apenas resultados para "${query}".`,
            timestamp: new Date(),
          }]);
        } else if (lower === '/limpar' || lower === '/todos' || lower === '/reset') {
          onBotFilter(null);
          setMessages(prev => [...prev, {
            id: `sync-${Date.now()}`,
            role: 'bot',
            content: '🔗 Filtro do dashboard removido. Mostrando todos os terrenos.',
            timestamp: new Date(),
          }]);
        }

        // Natural language city detection for dashboard filter
        if (!lower.startsWith('/')) {
          const cityPatterns = [
            /(?:terrenos?|oportunidades?|leilões?)\s+(?:em|de|no|na|perto)\s+(.+)/i,
            /(?:buscar?|procurar?|encontrar?)\s+(.+)/i,
          ];
          for (const pattern of cityPatterns) {
            const match = lower.match(pattern);
            if (match) {
              onBotFilter(match[1].trim());
              setMessages(prev => [...prev, {
                id: `sync-${Date.now()}`,
                role: 'bot',
                content: `🔗 Dashboard filtrado por "${match[1].trim()}"`,
                timestamp: new Date(),
              }]);
              break;
            }
          }
        }
      }
    } catch {
      setMessages(prev => [...prev, {
        id: `err-${Date.now()}`,
        role: 'bot',
        content: '❌ Erro ao processar. Tente novamente.',
        timestamp: new Date(),
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const quickCommands = [
    '/top 5', 
    '/urgente', 
    '/comparar #1 #2', 
    '/resumo', 
    '/exportar', 
    '/historico',
    '/buscar São Paulo'
  ];

  return (
    <>
      {/* Floating trigger button */}
      <button
        id="chat-trigger"
        onClick={() => setIsOpen(!isOpen)}
        style={{
          position: 'fixed',
          bottom: '24px',
          right: '24px',
          width: '60px',
          height: '60px',
          borderRadius: '50%',
          background: 'linear-gradient(135deg, #00FFA3, #00D185)',
          border: 'none',
          color: 'black',
          fontSize: '26px',
          cursor: 'pointer',
          boxShadow: pulseCount > 0
            ? '0 4px 20px rgba(0, 255, 163, 0.6), 0 0 30px rgba(0, 255, 163, 0.4)'
            : '0 4px 20px rgba(0, 255, 163, 0.4)',
          zIndex: 9999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'all 0.3s ease',
          transform: isOpen ? 'rotate(45deg) scale(0.9)' : pulseCount > 0 ? 'scale(1.1)' : 'scale(1)',
        }}
      >
        {isOpen ? '✕' : '🤖'}
      </button>

      {/* Chat panel */}
      {isOpen && (
        <div style={{
          position: 'fixed',
          bottom: '96px',
          right: '24px',
          width: '420px',
          maxWidth: 'calc(100vw - 48px)',
          height: '580px',
          maxHeight: 'calc(100vh - 120px)',
          background: '#05080F',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          borderRadius: '16px',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          zIndex: 9998,
          boxShadow: '0 8px 40px rgba(0,0,0,0.9), 0 0 30px rgba(0, 255, 163, 0.08)',
          animation: 'chatSlideUp 0.3s ease',
        }}>
          {/* Header */}
          <div style={{
            padding: '16px 20px',
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
            background: 'rgba(5, 8, 15, 0.8)',
            backdropFilter: 'blur(10px)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{
                width: '36px', height: '36px', borderRadius: '10px',
                background: 'linear-gradient(135deg, #10B981, #059669)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '18px',
              }}>🤖</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '14px', fontWeight: 700, color: '#F1F5F9' }}>AgentBot CousinServices</div>
                <div style={{ fontSize: '11px', color: '#64748B', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#10B981', display: 'inline-block' }} />
                  Online — Conectado ao Dashboard
                </div>
              </div>
              {activeBotFilter && (
                <span style={{
                  padding: '3px 8px',
                  borderRadius: '6px',
                  background: 'rgba(16,185,129,0.15)',
                  border: '1px solid rgba(16,185,129,0.3)',
                  color: '#10B981',
                  fontSize: '10px',
                  fontFamily: "'JetBrains Mono', monospace",
                }}>
                  🔗 {activeBotFilter}
                </span>
              )}
            </div>
          </div>

          {/* Messages */}
          <div style={{
            flex: 1,
            overflowY: 'auto',
            padding: '16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
          }}>
            {messages.map(msg => (
              <div key={msg.id} style={{
                alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                maxWidth: '90%',
              }}>
                <div style={{
                  padding: '10px 14px',
                  borderRadius: msg.role === 'user' ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
                  background: msg.role === 'user'
                    ? 'linear-gradient(135deg, #00FFA3, #00D185)'
                    : msg.id.startsWith('sync-')
                      ? 'rgba(0, 255, 163, 0.08)'
                      : 'rgba(15, 25, 45, 0.8)',
                  border: msg.role === 'user'
                    ? 'none'
                    : msg.id.startsWith('sync-')
                      ? '1px solid rgba(0, 255, 163, 0.2)'
                      : '1px solid rgba(255, 255, 255, 0.08)',
                  color: msg.id.startsWith('sync-') ? '#00FFA3' : '#FFFFFF',
                  fontSize: msg.id.startsWith('sync-') ? '11px' : '13px',
                  lineHeight: '1.5',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  fontFamily: msg.content.includes('R$') || msg.content.includes('%')
                    ? "'JetBrains Mono', monospace" : 'inherit',
                }}>
                  {msg.content}
                </div>
                <div style={{
                  fontSize: '10px',
                  color: '#475569',
                  marginTop: '4px',
                  textAlign: msg.role === 'user' ? 'right' : 'left',
                }}>
                  {msg.timestamp.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
            ))}
            {isLoading && (
              <div style={{
                alignSelf: 'flex-start',
                padding: '12px 16px',
                borderRadius: '14px 14px 14px 4px',
                background: 'rgba(30,41,59,0.8)',
                border: '1px solid rgba(148,163,184,0.08)',
                color: '#94A3B8',
                fontSize: '13px',
              }}>
                <span style={{ animation: 'pulse 1.5s infinite' }}>🔍 Analisando dados...</span>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Quick commands */}
          <div style={{
            padding: '6px 16px',
            display: 'flex',
            gap: '6px',
            flexWrap: 'wrap',
            borderTop: '1px solid rgba(148,163,184,0.06)',
          }}>
            {quickCommands.map(cmd => (
              <button key={cmd} onClick={() => { setInput(cmd); inputRef.current?.focus(); }}
                style={{
                  padding: '4px 10px',
                  borderRadius: '12px',
                  border: '1px solid rgba(148,163,184,0.12)',
                  background: 'rgba(30,41,59,0.5)',
                  color: '#94A3B8',
                  fontSize: '11px',
                  cursor: 'pointer',
                  fontFamily: "'JetBrains Mono', monospace",
                  transition: 'all 0.2s',
                }}
                onMouseEnter={e => { (e.target as HTMLElement).style.borderColor = '#10B981'; (e.target as HTMLElement).style.color = '#10B981'; }}
                onMouseLeave={e => { (e.target as HTMLElement).style.borderColor = 'rgba(148,163,184,0.12)'; (e.target as HTMLElement).style.color = '#94A3B8'; }}
              >
                {cmd}
              </button>
            ))}
            {activeBotFilter && (
              <button onClick={() => { setInput('/limpar'); inputRef.current?.focus(); }}
                style={{
                  padding: '4px 10px',
                  borderRadius: '12px',
                  border: '1px solid rgba(239,68,68,0.3)',
                  background: 'rgba(239,68,68,0.1)',
                  color: '#EF4444',
                  fontSize: '11px',
                  cursor: 'pointer',
                  fontFamily: "'JetBrains Mono', monospace",
                  transition: 'all 0.2s',
                }}
              >
                /limpar filtro
              </button>
            )}
          </div>

          {/* Input */}
          <div style={{
            padding: '12px 16px',
            borderTop: '1px solid rgba(148,163,184,0.08)',
            display: 'flex',
            gap: '8px',
          }}>
            <input
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Digite /ajuda ou faça uma pergunta..."
              disabled={isLoading}
              style={{
                flex: 1,
                padding: '10px 14px',
                borderRadius: '10px',
                border: '1px solid rgba(148,163,184,0.12)',
                background: 'rgba(15,23,42,0.8)',
                color: '#F1F5F9',
                fontSize: '13px',
                fontFamily: 'inherit',
                outline: 'none',
                transition: 'border-color 0.2s',
              }}
              onFocus={e => (e.target as HTMLInputElement).style.borderColor = '#10B981'}
              onBlur={e => (e.target as HTMLInputElement).style.borderColor = 'rgba(148,163,184,0.12)'}
            />
            <button
              onClick={sendMessage}
              disabled={isLoading || !input.trim()}
              style={{
                padding: '10px 16px',
                borderRadius: '10px',
                border: 'none',
                background: input.trim() ? 'linear-gradient(135deg, #10B981, #059669)' : 'rgba(30,41,59,0.5)',
                color: 'white',
                fontSize: '14px',
                cursor: input.trim() ? 'pointer' : 'default',
                transition: 'all 0.2s',
                opacity: input.trim() ? 1 : 0.5,
              }}
            >
              ➤
            </button>
          </div>
        </div>
      )}

      <style>{`
        @keyframes chatSlideUp {
          from { opacity: 0; transform: translateY(20px) scale(0.95); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
      `}</style>
    </>
  );
}
