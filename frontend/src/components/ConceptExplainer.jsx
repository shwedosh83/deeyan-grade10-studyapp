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
        <div key={i} className="mt-4 mb-1 font-semibold text-barca-navy text-sm">
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
            <li key={j} className="flex gap-2 text-sm text-gray-700">
              <span className="text-barca-navy mt-0.5">›</span>
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
      <p key={i} className="text-sm text-gray-700 leading-relaxed"
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
      setHistory(prev => [...prev, { role: 'assistant', content: data.message || 'Sorry, something went wrong.' }]);
    } catch {
      setHistory(prev => [...prev, { role: 'assistant', content: 'Sorry, something went wrong. Try again.' }]);
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
        className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[1px]"
        onClick={onClose}
      />

      {/* Right-side drawer */}
      <div className="fixed inset-y-0 right-0 z-50 w-full sm:w-[440px] bg-white shadow-2xl flex flex-col">

        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-gray-100 bg-white shrink-0">
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 hover:bg-gray-200 transition-colors shrink-0"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5M12 5l-7 7 7 7"/>
            </svg>
          </button>
          <span className="text-xl">🧠</span>
          <div className="min-w-0">
            <p className="font-semibold text-gray-900 text-sm leading-tight">Ask Your Coach</p>
            <p className="text-xs text-gray-400 truncate">{subject.label} · concepts, memory tricks, board tips</p>
          </div>
        </div>

        {/* Chat area */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4 min-h-0">

          {/* Empty state — suggestions */}
          {history.length === 0 && (
            <div className="space-y-3">
              <p className="text-sm text-gray-500 text-center pt-2">
                Ask me anything about {subject.label}. I'll explain it clearly, give you a memory trick, and show you exactly how to write it in your board exam.
              </p>
              <div className="grid grid-cols-2 gap-2 pt-1">
                {suggestions.map((s, i) => (
                  <button
                    key={i}
                    onClick={() => setInput(s)}
                    className="text-left text-xs bg-gray-50 hover:bg-blue-50 border border-gray-200 hover:border-blue-200 rounded-lg px-3 py-2 text-gray-600 hover:text-barca-navy transition-colors"
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
                <div className="bg-barca-navy text-white text-sm rounded-2xl rounded-br-sm px-4 py-2.5 max-w-[80%]">
                  {msg.content}
                </div>
              ) : (
                <div className="bg-gray-50 border border-gray-100 rounded-2xl rounded-bl-sm px-4 py-3 max-w-full w-full">
                  {renderMessage(msg.content)}
                </div>
              )}
            </div>
          ))}

          {/* Loading bubble */}
          {loading && (
            <div className="flex justify-start">
              <div className="bg-gray-50 border border-gray-100 rounded-2xl rounded-bl-sm px-4 py-3">
                <div className="flex gap-1 items-center h-4">
                  <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* Input bar */}
        <div className="px-4 py-3 border-t border-gray-100 bg-white">
          <div className="flex gap-2 items-end">
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKey}
              placeholder={history.length === 0 ? `Ask about any ${subject.label} concept…` : 'Ask a follow-up…'}
              rows={1}
              className="flex-1 resize-none border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-barca-navy focus:ring-1 focus:ring-barca-navy leading-relaxed"
              style={{ maxHeight: '100px', overflowY: 'auto' }}
            />
            <button
              onClick={send}
              disabled={!input.trim() || loading}
              className="flex-none w-10 h-10 rounded-xl bg-barca-navy hover:bg-barca-navy-dark disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center text-white transition-colors"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="22" y1="2" x2="11" y2="13" />
                <polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
            </button>
          </div>
          <p className="text-xs text-gray-400 mt-1.5 text-center">Enter to send · Shift+Enter for new line</p>
        </div>
      </div>
    </>
  );
}
