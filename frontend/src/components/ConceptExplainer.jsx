import { useEffect, useRef, useState } from 'react';
import { useSubject } from '../context/SubjectContext';

// ── Lightweight markdown renderer ────────────────────────────────────────────
// Handles: emoji headings, **bold**, bullet points, • bullets
function renderMessage(text) {
  const lines = text.split('\n');
  const elements = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Emoji section heading (line starts with an emoji)
    if (/^[🔍💡🌍🧠🔗📚✍️❓]/.test(line)) {
      elements.push(
        <div key={i} className="mt-4 mb-1 text-sm font-semibold text-brand">
          {line}
        </div>
      );
      i++;
      continue;
    }

    // Bullet point (• or - or *)
    if (/^[•\-\*]\s/.test(line.trim())) {
      const bulletLines = [];
      while (i < lines.length && /^[•\-\*]\s/.test(lines[i].trim())) {
        bulletLines.push(lines[i].trim().replace(/^[•\-\*]\s/, ''));
        i++;
      }
      elements.push(
        <ul key={i} className="list-none space-y-1 my-1 pl-1">
          {bulletLines.map((b, j) => (
            <li key={j} className="flex gap-2 text-sm text-ink-2">
              <span className="mt-0.5 text-brand">›</span>
              <span dangerouslySetInnerHTML={{ __html: boldify(b) }} />
            </li>
          ))}
        </ul>
      );
      continue;
    }

    // Empty line
    if (line.trim() === '') {
      elements.push(<div key={i} className="h-1" />);
      i++;
      continue;
    }

    // Regular paragraph
    elements.push(
      <p key={i} className="text-sm leading-relaxed text-ink-2"
        dangerouslySetInnerHTML={{ __html: boldify(line) }}
      />
    );
    i++;
  }

  return elements;
}

function boldify(text) {
  return text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
}

const TUTOR_DOWN = "The tutor isn't available right now. Please try again in a little while.";

// ── Component ─────────────────────────────────────────────────────────────────
export default function ConceptExplainer({ onClose }) {
  const { subject } = useSubject();
  const [input, setInput] = useState('');
  const [history, setHistory] = useState([]); // [{role, content}]
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [history, loading]);

  async function send() {
    const q = input.trim();
    if (!q || loading) return;

    const newHistory = [...history, { role: 'user', content: q }];
    setHistory(newHistory);
    setInput('');
    setLoading(true);

    try {
      const res = await fetch('/api/tutor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject: subject.id,
          question: q,
          // Send prior turns for follow-up context (last 6 messages max to keep tokens low)
          history: history.slice(-6),
        }),
      });
      const data = await res.json();
      setHistory(prev => [...prev, { role: 'assistant', content: data.message || TUTOR_DOWN }]);
    } catch {
      setHistory(prev => [...prev, { role: 'assistant', content: TUTOR_DOWN }]);
    }
    setLoading(false);
  }

  function handleKey(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  const SUGGESTIONS = {
    biology:             ['Explain osmosis',           'What is mitosis vs meiosis?', 'How does photosynthesis work?', 'Explain the excretory system'],
    chemistry:           ['What is electrolysis?',     'Explain pH and acids/bases',  'What are ionic bonds?',        'Explain organic chemistry basics'],
    physics:             ["Explain Newton's laws",     'What is Ohm\'s law?',         'How does refraction work?',    'Explain electromagnetic induction'],
    geography:           ['Explain the water cycle',   'What causes monsoons?',       'Types of soil in India',       'Explain soil erosion'],
    history_civics:      ['What caused WWI?',          'Explain the Non-Cooperation Movement', 'Role of the Supreme Court', 'What is the Lok Sabha?'],
    english_literature:  ["Explain Antony's funeral speech", "Character of Brutus", "Theme of ambition in Julius Caesar", "Explain the poem If by Kipling"],
  };
  const suggestions = SUGGESTIONS[subject.id] || SUGGESTIONS.biology;

  return (
    <>
      {/* Dimmed backdrop — click to close */}
      <div
        className="fixed inset-0 z-40 bg-barca-navy-deep/40 backdrop-blur-[2px] animate-fade-in"
        onClick={onClose}
      />

      {/* Right-side drawer */}
      <div className="fixed inset-y-0 right-0 z-50 flex w-full flex-col border-l border-line bg-surface shadow-2xl animate-slide-in-right sm:w-[440px]">

        {/* Header */}
        <div className="flex shrink-0 items-center gap-3 border-b border-line bg-surface px-4 py-3.5">
          <button
            onClick={onClose}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-2 text-ink-3 transition duration-150 hover:bg-line hover:text-ink"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5M12 5l-7 7 7 7"/>
            </svg>
          </button>
          <span className="text-xl">🧠</span>
          <div className="min-w-0">
            <p className="font-display text-sm font-bold leading-tight text-ink">Ask Your Coach</p>
            <p className="truncate text-xs text-ink-3">{subject.label} · concepts, memory tricks, board tips</p>
          </div>
        </div>

        {/* Chat area */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4 min-h-0">

          {/* Empty state — suggestions */}
          {history.length === 0 && (
            <div className="space-y-3">
              <p className="pt-2 text-center text-sm text-ink-2">
                Ask me anything about {subject.label}. I'll explain it clearly, give you a memory trick, and show you exactly how to write it in your board exam.
              </p>
              <div className="grid grid-cols-2 gap-2 pt-1">
                {suggestions.map((s, i) => (
                  <button
                    key={i}
                    onClick={() => setInput(s)}
                    className="rounded-xl border border-line bg-surface-2 px-3 py-2 text-left text-xs text-ink-2 transition duration-150 hover:border-brand/40 hover:bg-brand-soft hover:text-brand-ink"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Messages */}
          {history.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              {msg.role === 'user' ? (
                <div className="max-w-[80%] rounded-2xl rounded-br-sm bg-barca-navy px-4 py-2.5 text-sm text-white animate-fade-in dark:bg-brand dark:text-slate-950">
                  {msg.content}
                </div>
              ) : (
                msg.content === TUTOR_DOWN ? (
                  <div className="w-full rounded-2xl rounded-bl-sm border border-warn/25 bg-warn-soft px-4 py-3 animate-fade-in">
                    <p className="text-sm font-semibold text-ink">The tutor isn't available right now</p>
                    <p className="mt-0.5 text-sm text-ink-2">Your question wasn't lost — try sending it again in a little while.</p>
                  </div>
                ) : (
                  <div className="w-full max-w-full rounded-2xl rounded-bl-sm border border-line bg-surface-2 px-4 py-3 animate-fade-in">
                    {renderMessage(msg.content)}
                  </div>
                )
              )}
            </div>
          ))}

          {/* Loading bubble */}
          {loading && (
            <div className="flex justify-start">
              <div className="rounded-2xl rounded-bl-sm border border-line bg-surface-2 px-4 py-3">
                <div className="flex gap-1 items-center h-4">
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-ink-3" style={{ animationDelay: '0ms' }} />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-ink-3" style={{ animationDelay: '150ms' }} />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-ink-3" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* Input bar */}
        <div className="border-t border-line bg-surface px-4 py-3">
          <div className="flex gap-2 items-end">
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKey}
              placeholder={history.length === 0 ? `Ask about any ${subject.label} concept…` : 'Ask a follow-up…'}
              rows={1}
              className="input flex-1 resize-none leading-relaxed"
              style={{ maxHeight: '100px', overflowY: 'auto' }}
            />
            <button
              onClick={send}
              disabled={!input.trim() || loading}
              className="btn-primary h-10 w-10 flex-none p-0"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="22" y1="2" x2="11" y2="13" />
                <polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
            </button>
          </div>
          <p className="mt-1.5 text-center text-xs text-ink-3">Enter to send · Shift+Enter for new line</p>
        </div>
      </div>
    </>
  );
}
