'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import * as ScrollArea from '@radix-ui/react-scroll-area';
import { Bot, RefreshCw, Send, Tag, User } from 'lucide-react';
import { createBrowserClient, CLIENT_ID } from '@/lib/supabase';
import { formatDate } from '@/lib/formatters';
import type { AiInsight, AskNorthStarRequest, AskNorthStarResponse } from '@/types';

// ─── Types ────────────────────────────────────────────────────────────────────

type InsightFilter = 'all' | 'quarterly_report' | 'chat' | 'analysis';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  isError?: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTimestamp(date: Date): string {
  return date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function insightTypeColor(type: string): {
  bg: string;
  text: string;
  border: string;
  label: string;
} {
  switch (type) {
    case 'quarterly_report':
      return {
        bg: 'rgba(255,170,0,0.1)',
        text: '#ffaa00',
        border: 'rgba(255,170,0,0.3)',
        label: 'QTR REPORT',
      };
    case 'chat':
      return {
        bg: 'rgba(0,255,136,0.1)',
        text: '#00ff88',
        border: 'rgba(0,255,136,0.3)',
        label: 'CHAT',
      };
    case 'analysis':
      return {
        bg: 'rgba(99,179,237,0.1)',
        text: '#63b3ed',
        border: 'rgba(99,179,237,0.3)',
        label: 'ANALYSIS',
      };
    default:
      return {
        bg: 'rgba(136,136,136,0.1)',
        text: '#888',
        border: 'rgba(136,136,136,0.3)',
        label: type.toUpperCase(),
      };
  }
}

/**
 * Render AI response text with lightweight markdown-ish formatting.
 * Lines starting with ## become bold headers.
 * **text** becomes bold.
 * Lines starting with - become bullet items.
 */
function FormattedAIText({ content }: { content: string }) {
  const lines = content.split('\n');

  return (
    <span>
      {lines.map((line, i) => {
        const isLast = i === lines.length - 1;
        const nl = isLast ? null : <br />;

        // ## Header
        if (line.startsWith('## ')) {
          return (
            <span key={i}>
              <strong style={{ color: '#ffaa00', fontFamily: 'inherit' }}>
                {line.slice(3)}
              </strong>
              {nl}
            </span>
          );
        }

        // - Bullet item
        if (line.startsWith('- ')) {
          return (
            <span key={i} style={{ display: 'flex', gap: '0.4rem', alignItems: 'flex-start' }}>
              <span style={{ color: '#ffaa00', flexShrink: 0 }}>›</span>
              <span>{renderInline(line.slice(2))}</span>
              {nl}
            </span>
          );
        }

        // Normal line (may contain **bold**)
        return (
          <span key={i}>
            {renderInline(line)}
            {nl}
          </span>
        );
      })}
    </span>
  );
}

/** Render inline **bold** segments within a line */
function renderInline(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    }
    return <span key={i}>{part}</span>;
  });
}

// ─── Skeleton placeholders ────────────────────────────────────────────────────

function InsightSkeleton() {
  return (
    <div
      style={{
        borderBottom: '1px solid #2a2a2a',
        padding: '12px 16px',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      <div style={{ display: 'flex', gap: 8 }}>
        <div className="skeleton" style={{ height: 18, width: 80, borderRadius: 2 }} />
        <div className="skeleton" style={{ height: 18, width: 60, borderRadius: 2 }} />
      </div>
      <div className="skeleton" style={{ height: 12, width: '60%', borderRadius: 2 }} />
      <div className="skeleton" style={{ height: 14, width: '100%', borderRadius: 2 }} />
      <div className="skeleton" style={{ height: 14, width: '85%', borderRadius: 2 }} />
    </div>
  );
}

// ─── Insight Card ─────────────────────────────────────────────────────────────

function InsightCard({ insight }: { insight: AiInsight }) {
  const [expanded, setExpanded] = useState(false);
  const colors = insightTypeColor(insight.insight_type);

  return (
    <div
      style={{
        borderBottom: '1px solid #2a2a2a',
        padding: '12px 16px',
        cursor: 'pointer',
        transition: 'background 0.15s',
      }}
      onClick={() => setExpanded((v) => !v)}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLDivElement).style.background = '#1a1a1a';
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLDivElement).style.background = 'transparent';
      }}
    >
      {/* Top row: badge + date */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <span
          style={{
            background: colors.bg,
            color: colors.text,
            border: `1px solid ${colors.border}`,
            fontSize: 10,
            fontFamily: 'JetBrains Mono, monospace',
            fontWeight: 600,
            letterSpacing: '0.08em',
            padding: '1px 6px',
            borderRadius: 2,
          }}
        >
          {colors.label}
        </span>
        <span
          style={{
            fontSize: 10,
            fontFamily: 'JetBrains Mono, monospace',
            color: '#888',
          }}
        >
          {formatDate(insight.session_date, 'medium')}
        </span>
      </div>

      {/* Topic */}
      <div
        style={{
          fontSize: 10,
          fontFamily: 'JetBrains Mono, monospace',
          color: '#888',
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          marginBottom: 6,
        }}
      >
        {insight.topic}
      </div>

      {/* Insight text — truncated or expanded */}
      <div
        style={{
          fontSize: 13,
          color: '#e8e8e8',
          lineHeight: 1.55,
          overflow: 'hidden',
          display: '-webkit-box',
          WebkitLineClamp: expanded ? 'unset' : 3,
          WebkitBoxOrient: 'vertical',
        } as React.CSSProperties}
      >
        {insight.insight}
      </div>

      {/* Expand hint */}
      {!expanded && insight.insight.length > 200 && (
        <div style={{ fontSize: 10, color: '#555', fontFamily: 'JetBrains Mono, monospace', marginTop: 4 }}>
          [click to expand]
        </div>
      )}

      {/* Tags */}
      {insight.tags && insight.tags.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 8 }}>
          {insight.tags.map((tag) => (
            <span
              key={tag}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 3,
                background: 'rgba(42,42,42,0.8)',
                border: '1px solid #2a2a2a',
                borderRadius: 2,
                padding: '1px 6px',
                fontSize: 10,
                color: '#888',
                fontFamily: 'JetBrains Mono, monospace',
              }}
            >
              <Tag size={9} />
              {tag}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Chat Bubble ──────────────────────────────────────────────────────────────

function ChatBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user';

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: isUser ? 'flex-end' : 'flex-start',
        marginBottom: 16,
      }}
    >
      {/* Role label + timestamp */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          marginBottom: 4,
          flexDirection: isUser ? 'row-reverse' : 'row',
        }}
      >
        <span
          style={{
            width: 20,
            height: 20,
            borderRadius: 2,
            background: isUser ? 'rgba(0,255,136,0.15)' : 'rgba(255,170,0,0.15)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          {isUser
            ? <User size={11} color="#00ff88" />
            : <Bot size={11} color="#ffaa00" />
          }
        </span>
        <span
          style={{
            fontSize: 9,
            fontFamily: 'JetBrains Mono, monospace',
            color: isUser ? '#00ff88' : '#ffaa00',
            letterSpacing: '0.1em',
            fontWeight: 600,
          }}
        >
          {isUser ? 'YOU' : 'NORTH STAR'}
        </span>
        <span
          style={{
            fontSize: 9,
            fontFamily: 'JetBrains Mono, monospace',
            color: '#555',
          }}
        >
          {formatTimestamp(message.timestamp)}
        </span>
      </div>

      {/* Bubble */}
      <div
        style={{
          maxWidth: '88%',
          padding: '10px 14px',
          background: isUser ? 'rgba(0,255,136,0.05)' : 'rgba(255,170,0,0.05)',
          borderLeft: `2px solid ${isUser ? '#00ff88' : '#ffaa00'}`,
          borderTop: '1px solid #2a2a2a',
          borderRight: '1px solid #2a2a2a',
          borderBottom: '1px solid #2a2a2a',
          borderRadius: '0 2px 2px 2px',
          fontSize: 13,
          lineHeight: 1.6,
          color: message.isError ? '#ff4444' : '#e8e8e8',
          fontFamily: isUser ? 'inherit' : 'JetBrains Mono, monospace',
        }}
      >
        {isUser ? (
          message.content
        ) : (
          <FormattedAIText content={message.content} />
        )}
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function AIInsightsFeed() {
  // ── Insights state ──
  const [insights, setInsights] = useState<AiInsight[]>([]);
  const [insightsLoading, setInsightsLoading] = useState(true);
  const [insightsError, setInsightsError] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<InsightFilter>('all');

  // ── Chat state ──
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'greeting',
      role: 'assistant',
      content:
        'North Star Command Center online. How can I assist with your financial intelligence today?',
      timestamp: new Date(),
    },
  ]);
  const [inputValue, setInputValue] = useState('');
  const [chatLoading, setChatLoading] = useState(false);

  // ── Refs ──
  const chatBottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // ─── Fetch insights ─────────────────────────────────────────────────────────

  const fetchInsights = useCallback(async () => {
    setInsightsLoading(true);
    setInsightsError(null);

    try {
      const supabase = createBrowserClient();
      const { data, error } = await supabase
        .schema('north_star')
        .from('ai_insights')
        .select('*')
        .eq('client_id', CLIENT_ID)
        .order('session_date', { ascending: false })
        .limit(50);

      if (error) throw error;
      setInsights(data ?? []);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to load insights';
      setInsightsError(message);
    } finally {
      setInsightsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchInsights();
  }, [fetchInsights]);

  // ─── Auto-scroll chat to bottom ─────────────────────────────────────────────

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, chatLoading]);

  // ─── Auto-resize textarea ───────────────────────────────────────────────────

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputValue(e.target.value);
    const el = e.target;
    el.style.height = 'auto';
    const maxHeight = 80; // ~3 lines
    el.style.height = `${Math.min(el.scrollHeight, maxHeight)}px`;
  };

  // ─── Submit chat ────────────────────────────────────────────────────────────

  const submitQuestion = useCallback(async () => {
    const question = inputValue.trim();
    if (!question || chatLoading) return;

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: question,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputValue('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
    setChatLoading(true);

    try {
      const body: AskNorthStarRequest = { question };
      const res = await fetch('/api/ask-northstar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => 'Unknown error');
        throw new Error(`${res.status}: ${errText}`);
      }

      const data: AskNorthStarResponse = await res.json();

      const aiMsg: ChatMessage = {
        id: `ai-${Date.now()}`,
        role: 'assistant',
        content: data.answer,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, aiMsg]);
    } catch (err: unknown) {
      const errorContent =
        err instanceof Error
          ? `Error: ${err.message}`
          : 'An unexpected error occurred. Please try again.';

      const errMsg: ChatMessage = {
        id: `err-${Date.now()}`,
        role: 'assistant',
        content: errorContent,
        timestamp: new Date(),
        isError: true,
      };
      setMessages((prev) => [...prev, errMsg]);
    } finally {
      setChatLoading(false);
    }
  }, [inputValue, chatLoading]);

  // ─── Keyboard handler ───────────────────────────────────────────────────────

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      submitQuestion();
    }
  };

  // ─── Filtered insights ──────────────────────────────────────────────────────

  const filteredInsights =
    activeFilter === 'all'
      ? insights
      : insights.filter((i) => i.insight_type === activeFilter);

  // ─── Filter tab config ──────────────────────────────────────────────────────

  const filterTabs: { id: InsightFilter; label: string }[] = [
    { id: 'all', label: 'ALL' },
    { id: 'quarterly_report', label: 'QUARTERLY' },
    { id: 'chat', label: 'CHAT' },
    { id: 'analysis', label: 'ANALYSIS' },
  ];

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr',
        gap: 16,
      }}
      className="ai-insights-feed"
    >
      <style>{`
        @media (min-width: 1024px) {
          .ai-insights-feed {
            grid-template-columns: 3fr 2fr !important;
          }
        }
      `}</style>

      {/* ── Left Column: Insights Timeline ─────────────────────────────────── */}
      <div
        className="terminal-card"
        style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}
      >
        {/* Header */}
        <div className="panel-header">
          <div>
            <div className="panel-title">NORTH STAR INTELLIGENCE FEED</div>
          </div>
          <button
            onClick={fetchInsights}
            disabled={insightsLoading}
            style={{
              background: 'none',
              border: '1px solid #2a2a2a',
              borderRadius: 2,
              padding: '4px 8px',
              cursor: insightsLoading ? 'not-allowed' : 'pointer',
              color: '#888',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              fontSize: 10,
              fontFamily: 'JetBrains Mono, monospace',
              transition: 'color 0.15s, border-color 0.15s',
            }}
            onMouseEnter={(e) => {
              if (!insightsLoading) {
                (e.currentTarget as HTMLButtonElement).style.color = '#00ff88';
                (e.currentTarget as HTMLButtonElement).style.borderColor = '#00ff88';
              }
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.color = '#888';
              (e.currentTarget as HTMLButtonElement).style.borderColor = '#2a2a2a';
            }}
            aria-label="Refresh insights"
          >
            <RefreshCw
              size={11}
              style={{
                animation: insightsLoading ? 'spin 1s linear infinite' : 'none',
              }}
            />
            REFRESH
          </button>
        </div>

        {/* Filter bar */}
        <div
          style={{
            padding: '8px 16px',
            borderBottom: '1px solid #2a2a2a',
            display: 'flex',
            gap: 4,
          }}
        >
          {filterTabs.map((tab) => {
            const isActive = activeFilter === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveFilter(tab.id)}
                style={{
                  background: isActive ? 'rgba(0,255,136,0.1)' : 'none',
                  border: `1px solid ${isActive ? 'rgba(0,255,136,0.4)' : '#2a2a2a'}`,
                  borderRadius: 2,
                  padding: '3px 8px',
                  cursor: 'pointer',
                  color: isActive ? '#00ff88' : '#888',
                  fontSize: 10,
                  fontFamily: 'JetBrains Mono, monospace',
                  letterSpacing: '0.06em',
                  transition: 'all 0.15s',
                }}
              >
                {tab.label}
                {tab.id !== 'all' && (
                  <span style={{ marginLeft: 4, opacity: 0.6 }}>
                    ({insights.filter((i) => i.insight_type === tab.id).length})
                  </span>
                )}
                {tab.id === 'all' && (
                  <span style={{ marginLeft: 4, opacity: 0.6 }}>
                    ({insights.length})
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Scroll area */}
        <ScrollArea.Root style={{ flex: 1, overflow: 'hidden' }}>
          <ScrollArea.Viewport style={{ height: '100%', maxHeight: 600 }}>
            {insightsError ? (
              <div
                style={{
                  padding: '24px 16px',
                  textAlign: 'center',
                  color: '#ff4444',
                  fontSize: 12,
                  fontFamily: 'JetBrains Mono, monospace',
                }}
              >
                <div style={{ marginBottom: 8 }}>ERROR LOADING INSIGHTS</div>
                <div style={{ color: '#888', fontSize: 11 }}>{insightsError}</div>
                <button
                  onClick={fetchInsights}
                  style={{
                    marginTop: 12,
                    background: 'none',
                    border: '1px solid #ff4444',
                    borderRadius: 2,
                    padding: '4px 12px',
                    color: '#ff4444',
                    fontSize: 10,
                    fontFamily: 'JetBrains Mono, monospace',
                    cursor: 'pointer',
                  }}
                >
                  RETRY
                </button>
              </div>
            ) : insightsLoading ? (
              Array.from({ length: 5 }).map((_, i) => <InsightSkeleton key={i} />)
            ) : filteredInsights.length === 0 ? (
              <div
                style={{
                  padding: '40px 16px',
                  textAlign: 'center',
                  color: '#555',
                  fontSize: 11,
                  fontFamily: 'JetBrains Mono, monospace',
                }}
              >
                NO INSIGHTS FOUND
                {activeFilter !== 'all' && (
                  <div style={{ marginTop: 4, fontSize: 10 }}>
                    FOR FILTER: {activeFilter.toUpperCase()}
                  </div>
                )}
              </div>
            ) : (
              filteredInsights.map((insight) => (
                <InsightCard key={insight.id} insight={insight} />
              ))
            )}
          </ScrollArea.Viewport>
          <ScrollArea.Scrollbar
            orientation="vertical"
            style={{
              display: 'flex',
              userSelect: 'none',
              touchAction: 'none',
              padding: '2px',
              background: '#111',
              width: 8,
            }}
          >
            <ScrollArea.Thumb
              style={{
                flex: 1,
                background: '#2a2a2a',
                borderRadius: 2,
                position: 'relative',
              }}
            />
          </ScrollArea.Scrollbar>
        </ScrollArea.Root>
      </div>

      {/* ── Right Column: Ask North Star Chat ──────────────────────────────── */}
      <div
        className="terminal-card"
        style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}
      >
        {/* Header */}
        <div className="panel-header">
          <div>
            <div className="panel-title">ASK NORTH STAR</div>
            <div
              style={{
                fontSize: 10,
                color: '#888',
                fontFamily: 'JetBrains Mono, monospace',
                marginTop: 2,
              }}
            >
              Direct line to your CFO AI
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: '#00ff88',
                boxShadow: '0 0 6px #00ff88',
              }}
              className="alert-blink"
            />
            <span
              style={{
                fontSize: 9,
                color: '#00ff88',
                fontFamily: 'JetBrains Mono, monospace',
                letterSpacing: '0.1em',
              }}
            >
              ONLINE
            </span>
          </div>
        </div>

        {/* Message history */}
        <ScrollArea.Root style={{ flex: 1, overflow: 'hidden' }}>
          <ScrollArea.Viewport
            style={{
              height: '100%',
              maxHeight: 500,
              padding: '16px',
            }}
          >
            {messages.map((msg) => (
              <ChatBubble key={msg.id} message={msg} />
            ))}

            {/* Loading indicator */}
            {chatLoading && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  marginBottom: 16,
                  gap: 8,
                }}
              >
                <span
                  style={{
                    width: 20,
                    height: 20,
                    borderRadius: 2,
                    background: 'rgba(255,170,0,0.15)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  <Bot size={11} color="#ffaa00" />
                </span>
                <div
                  style={{
                    padding: '10px 14px',
                    background: 'rgba(255,170,0,0.05)',
                    border: '1px solid #2a2a2a',
                    borderLeft: '2px solid #ffaa00',
                    borderRadius: '0 2px 2px 2px',
                    fontSize: 11,
                    fontFamily: 'JetBrains Mono, monospace',
                    color: '#ffaa00',
                    letterSpacing: '0.1em',
                  }}
                  className="alert-blink"
                >
                  ANALYZING...
                </div>
              </div>
            )}

            <div ref={chatBottomRef} />
          </ScrollArea.Viewport>
          <ScrollArea.Scrollbar
            orientation="vertical"
            style={{
              display: 'flex',
              userSelect: 'none',
              touchAction: 'none',
              padding: '2px',
              background: '#111',
              width: 8,
            }}
          >
            <ScrollArea.Thumb
              style={{
                flex: 1,
                background: '#2a2a2a',
                borderRadius: 2,
                position: 'relative',
              }}
            />
          </ScrollArea.Scrollbar>
        </ScrollArea.Root>

        {/* Input area */}
        <div
          style={{
            borderTop: '1px solid #2a2a2a',
            padding: '12px 16px',
            display: 'flex',
            gap: 8,
            alignItems: 'flex-end',
            background: '#111',
          }}
        >
          <textarea
            ref={textareaRef}
            value={inputValue}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            disabled={chatLoading}
            placeholder="Ask about your finances..."
            rows={1}
            style={{
              flex: 1,
              background: '#0a0a0a',
              border: '1px solid #2a2a2a',
              borderRadius: 2,
              padding: '8px 12px',
              color: chatLoading ? '#555' : '#e8e8e8',
              fontSize: 13,
              fontFamily: 'Inter, system-ui, sans-serif',
              resize: 'none',
              outline: 'none',
              lineHeight: 1.5,
              minHeight: 36,
              maxHeight: 80,
              overflow: 'auto',
              transition: 'border-color 0.15s',
              cursor: chatLoading ? 'not-allowed' : 'text',
            }}
            onFocus={(e) => {
              if (!chatLoading) {
                e.currentTarget.style.borderColor = '#00ff88';
              }
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = '#2a2a2a';
            }}
          />
          <button
            onClick={submitQuestion}
            disabled={chatLoading || !inputValue.trim()}
            title="Send (Ctrl+Enter)"
            style={{
              background:
                chatLoading || !inputValue.trim()
                  ? 'rgba(0,255,136,0.05)'
                  : 'rgba(0,255,136,0.15)',
              border: `1px solid ${chatLoading || !inputValue.trim() ? '#2a2a2a' : 'rgba(0,255,136,0.5)'}`,
              borderRadius: 2,
              padding: '8px 12px',
              cursor:
                chatLoading || !inputValue.trim() ? 'not-allowed' : 'pointer',
              color:
                chatLoading || !inputValue.trim() ? '#555' : '#00ff88',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              transition: 'all 0.15s',
              minHeight: 36,
            }}
            aria-label="Send message"
          >
            <Send size={14} />
          </button>
        </div>

        {/* Keyboard hint */}
        <div
          style={{
            paddingBottom: 8,
            paddingRight: 16,
            textAlign: 'right',
            fontSize: 9,
            fontFamily: 'JetBrains Mono, monospace',
            color: '#444',
          }}
        >
          Ctrl+Enter to send
        </div>
      </div>

      {/* Spin keyframe for refresh icon */}
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
