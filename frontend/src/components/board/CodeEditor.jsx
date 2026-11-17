import { useMemo, useState } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { java } from '@codemirror/lang-java';
import { EditorView } from '@codemirror/view';
import { indentUnit, HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags as t } from '@lezer/highlight';
import { analyse, runJava } from '../../lib/javaRunner';

// Replit-style dark editor for Java answers, with Run (compiles and runs in the browser).
const C = { bg: '#1c2333', panel: '#0e1525', line: '#2b3245', text: '#f5f9fc', dim: '#9da2a6', active: '#252d40' };

const theme = EditorView.theme({
  '&': { backgroundColor: C.bg, color: C.text, fontSize: '14px' },
  '.cm-content': { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace', caretColor: '#fff', padding: '10px 0' },
  '.cm-gutters': { backgroundColor: C.bg, color: '#5f677a', border: 'none', paddingLeft: '6px' },
  '.cm-activeLine': { backgroundColor: C.active }, '.cm-activeLineGutter': { backgroundColor: C.active, color: C.dim },
  '&.cm-focused .cm-cursor': { borderLeftColor: '#fff' },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection': { backgroundColor: '#264f78 !important' },
  '.cm-matchingBracket': { backgroundColor: '#3b4b6b', outline: '1px solid #5a6b8c' },
  '.cm-tooltip': { backgroundColor: C.panel, color: C.text, border: `1px solid ${C.line}` },
  '.cm-tooltip-autocomplete ul li[aria-selected]': { backgroundColor: '#0053a6' },
}, { dark: true });

const highlight = HighlightStyle.define([
  { tag: [t.keyword, t.modifier, t.controlKeyword, t.definitionKeyword], color: '#ff79c6' },
  { tag: [t.typeName, t.className], color: '#8be9fd' },
  { tag: [t.string, t.character], color: '#f1fa8c' },
  { tag: [t.number, t.bool, t.null], color: '#bd93f9' },
  { tag: [t.comment, t.lineComment, t.blockComment], color: '#6a7593', fontStyle: 'italic' },
  { tag: [t.function(t.variableName), t.function(t.propertyName)], color: '#50fa7b' },
  { tag: t.operator, color: '#ffb86c' },
]);

const EXTENSIONS = [java(), theme, syntaxHighlighting(highlight), indentUnit.of('    '), EditorView.lineWrapping];

export default function CodeEditor({ value, onChange, disabled }) {
  const [input, setInput] = useState('');
  const [showInput, setShowInput] = useState(false);
  const [status, setStatus] = useState('');
  const [result, setResult] = useState(null);
  const running = !!status;
  const fileName = useMemo(() => analyse(value).fileName || 'Main.java', [value]);
  const usesInput = /Scanner|BufferedReader|System\.in/.test(value || '');

  async function run() {
    setResult(null);
    try { setResult(await runJava(value || '', input, setStatus)); }
    catch (e) { setResult({ stage: 'run', ok: false, output: e.message || String(e) }); }
    setStatus('');
  }

  return (
    <div className="overflow-hidden rounded-xl border border-[#2b3245] shadow-sm" style={{ backgroundColor: C.panel }}>
      <div className="flex items-center gap-2 border-b px-3 py-2" style={{ borderColor: C.line }}>
        <span className="rounded-md px-2.5 py-1 font-mono text-xs" style={{ backgroundColor: C.bg, color: C.text }}>☕ {fileName}</span>
        <span className="hidden text-xs sm:inline" style={{ color: C.dim }}>Java</span>
        <span className="flex-1" />
        <button type="button" onClick={() => setShowInput(s => !s)}
          className="rounded-md px-2.5 py-1 text-xs font-semibold transition hover:brightness-125" style={{ color: usesInput ? '#f2b705' : C.dim, backgroundColor: C.bg }}>
          {showInput ? 'Hide input' : 'Input'}{usesInput && !showInput && !input ? ' ●' : ''}
        </button>
        <button type="button" onClick={run} disabled={running || !(value || '').trim()}
          className="flex items-center gap-1.5 rounded-md bg-[#0e9f6e] px-3.5 py-1.5 text-sm font-bold text-white transition hover:bg-[#0b8a5f] disabled:opacity-50">
          {running ? <span className="h-3 w-3 animate-spin rounded-full border-2 border-white/40 border-t-white" /> : <span aria-hidden="true">▶</span>}
          {running ? 'Running' : 'Run'}
        </button>
      </div>

      <CodeMirror
        value={value || ''} onChange={v => onChange(v)} editable={!disabled} readOnly={disabled}
        extensions={EXTENSIONS} theme="none" height="auto" minHeight="320px" maxHeight="560px"
        placeholder="Write your program here…"
        basicSetup={{ lineNumbers: true, highlightActiveLine: true, bracketMatching: true, closeBrackets: true, autocompletion: true, indentOnInput: true, foldGutter: false, tabSize: 4 }}
      />

      {showInput && (
        <div className="border-t px-3 py-2.5" style={{ borderColor: C.line }}>
          <p className="mb-1.5 text-xs" style={{ color: C.dim }}>Input: what you'd type when the program asks. One value per line.</p>
          <textarea value={input} onChange={e => setInput(e.target.value)} rows={3} spellCheck={false}
            className="w-full resize-y rounded-md border px-2.5 py-2 font-mono text-[13px] outline-none focus:border-[#0079f2]"
            style={{ backgroundColor: C.bg, color: C.text, borderColor: C.line }} placeholder={'e.g.\n5\n12'} />
        </div>
      )}

      {(running || result) && (
        <div className="border-t" style={{ borderColor: C.line }}>
          <div className="flex items-center justify-between px-3 pt-2">
            <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: C.dim }}>Console</span>
            {result && !running && (
              <span className={`text-xs font-semibold ${result.ok ? 'text-[#50fa7b]' : 'text-[#ff6b6b]'}`}>
                {result.ok ? (result.stage === 'run' ? '✓ Ran' : '✓ Compiled') : result.stage === 'compile' ? '✗ Compile errors' : '✗ Error'}
              </span>
            )}
          </div>
          <pre className="max-h-72 overflow-auto whitespace-pre-wrap px-3 pb-3 pt-1.5 font-mono text-[13px] leading-relaxed"
            style={{ color: result && !result.ok ? '#ff9b9b' : C.text }}>
            {running ? status : (result.output || '(no output)')}
          </pre>
        </div>
      )}
    </div>
  );
}
