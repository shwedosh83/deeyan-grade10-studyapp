// Compile and run Java in the browser: CheerpJ (a JVM in WebAssembly, loaded from its CDN) runs the
// standard javac from OpenJDK 8 (public/java/tools.jar). Nothing leaves the device.
// First run downloads the runtime and compiler (about 30–60 s); later runs reuse the browser cache.

const LOADER = 'https://cjrtnc.leaningtech.com/3.0/cj3loader.js';
const TIME_LIMIT_MS = 10000;
const MAX_OUT = 20000;

let ready = null;
function boot() {
  if (!ready) {
    ready = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = LOADER;
      s.onload = () => window.cheerpjInit({ version: 8, status: 'none' }).then(resolve, reject);
      s.onerror = () => reject(new Error('Could not load the Java runtime. Check the internet connection.'));
      document.head.appendChild(s);
    }).catch(e => { ready = null; throw e; });
  }
  return ready;
}

// Runs the program's main() with System.in fed from the input box and everything it prints going to
// /files/out.txt. CheerpJ runs Java on the page's own thread, so a loop that never ends would freeze the
// tab: guard() rewrites every loop condition to call FmGuard.t(), which stops the program after the limit.
const RUNNER = `public class FmRun {
  public static void main(String[] a) throws Exception {
    java.io.PrintStream o = new java.io.PrintStream(new java.io.FileOutputStream("/files/out.txt"), true);
    System.setOut(o); System.setErr(o);
    System.setIn(new java.io.FileInputStream("/str/input.txt"));
    FmGuard.deadline = System.currentTimeMillis() + ${TIME_LIMIT_MS};
    try { Class.forName(a[0]).getMethod("main", String[].class).invoke(null, (Object) new String[0]); }
    catch (java.lang.reflect.InvocationTargetException e) {
      Throwable c = e.getCause();
      if (c instanceof FmGuard.Stop) o.println("\\n[Stopped after ${TIME_LIMIT_MS / 1000} seconds. Is there a loop that never ends?]");
      else if (c instanceof java.util.NoSuchElementException) o.println("\\n[The program wanted more input. Type it in the Input box, one value per line.]");
      else c.printStackTrace(o);
    }
    o.flush(); System.exit(0);
  }
}`;
const GUARD = `public class FmGuard {
  public static long deadline = Long.MAX_VALUE;
  private static int n = 0;
  public static class Stop extends Error { public Stop() { super("time limit"); } }
  public static boolean t() {
    if (++n >= 20000) { n = 0; if (System.currentTimeMillis() > deadline) throw new Stop(); }
    return true;
  }
}`;

// Adds FmGuard.t() to each while / for / do-while condition, on the same line (so error line numbers
// stay right). Skips strings, chars and comments; leaves for-each loops alone (they always end).
export function guard(code) {
  const src = String(code || '');
  const out = [];
  let i = 0;
  const skipQuoted = (j, q) => { j++; while (j < src.length && src[j] !== q) { if (src[j] === '\\') j++; j++; } return j + 1; };
  const matchParen = j => {   // j at '(' -> index of matching ')'
    let d = 0;
    while (j < src.length) {
      const c = src[j];
      if (c === '"' || c === "'") { j = skipQuoted(j, c); continue; }
      if (c === '/' && src[j + 1] === '/') { while (j < src.length && src[j] !== '\n') j++; continue; }
      if (c === '/' && src[j + 1] === '*') { const e = src.indexOf('*/', j + 2); j = e < 0 ? src.length : e + 2; continue; }
      if (c === '(') d++;
      else if (c === ')' && --d === 0) return j;
      j++;
    }
    return -1;
  };
  while (i < src.length) {
    const c = src[i];
    if (c === '"' || c === "'") { const j = skipQuoted(i, c); out.push(src.slice(i, j)); i = j; continue; }
    if (c === '/' && src[i + 1] === '/') { let j = i; while (j < src.length && src[j] !== '\n') j++; out.push(src.slice(i, j)); i = j; continue; }
    if (c === '/' && src[i + 1] === '*') { const e = src.indexOf('*/', i + 2); const j = e < 0 ? src.length : e + 2; out.push(src.slice(i, j)); i = j; continue; }
    const m = /^(while|for)\b/.exec(src.slice(i, i + 6));
    if (m && !/[\w$]/.test(src[i - 1] || '')) {
      let j = i + m[1].length;
      while (/\s/.test(src[j] || '')) j++;
      const end = src[j] === '(' ? matchParen(j) : -1;
      if (end > 0) {
        const inner = src.slice(j + 1, end);
        let rewritten = null;
        if (m[1] === 'while') rewritten = `FmGuard.t() && (${inner})`;
        else {   // split "init; cond; update" on top-level semicolons
          const parts = []; let depth = 0, last = 0;
          for (let k = 0; k < inner.length; k++) {
            const ch = inner[k];
            if (ch === '"' || ch === "'") { let q = k + 1; while (q < inner.length && inner[q] !== ch) { if (inner[q] === '\\') q++; q++; } k = q; continue; }
            if (ch === '(' || ch === '{' || ch === '[') depth++;
            else if (ch === ')' || ch === '}' || ch === ']') depth--;
            else if (ch === ';' && depth === 0) { parts.push(inner.slice(last, k)); last = k + 1; }
          }
          parts.push(inner.slice(last));
          if (parts.length === 3) rewritten = `${parts[0]}; FmGuard.t() && (${parts[1].trim() || 'true'}); ${parts[2]}`;
        }
        if (rewritten !== null) { out.push(src.slice(i, j + 1), rewritten, ')'); i = end + 1; continue; }
      }
    }
    out.push(c); i++;
  }
  return out.join('');
}

// Finds the class that has main(), and the name the file must have (the public class, if any).
export function analyse(code) {
  const src = String(code || '').replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/.*$/gm, ' ').replace(/"(\\.|[^"\\])*"/g, '""');
  const decls = [...src.matchAll(/\b(public\s+)?(?:final\s+|abstract\s+)*class\s+([A-Za-z_]\w*)/g)];
  if (!decls.length) return { error: 'No class found. Java code must be inside a class, e.g. class Main { … }' };
  let mainClass = null;
  decls.forEach((m, i) => {
    const seg = src.slice(m.index, i + 1 < decls.length ? decls[i + 1].index : undefined);
    if (!mainClass && /static\s+(public\s+)?void\s+main\s*\(/.test(seg)) mainClass = m[2];
  });
  const pub = decls.find(m => m[1]);
  return { mainClass, fileName: (pub ? pub[2] : mainClass || decls[0][2]) + '.java' };
}

async function readFile(path) {
  const blob = await window.cjFileBlob(path);
  return blob ? blob.text() : '';
}

let seq = 0;
// Returns { stage: 'compile' | 'run', ok, output }.
export async function runJava(code, input = '', onStatus = () => {}) {
  const { error, mainClass, fileName } = analyse(code);
  if (error) return { stage: 'compile', ok: false, output: error };
  onStatus(ready ? 'Compiling…' : 'Starting Java (first time takes up to a minute)…');
  await boot();
  onStatus('Compiling…');
  const tag = `${++seq}_${Date.now()}`;
  window.cheerpOSAddStringFile(`/str/${tag}/g/${fileName}`, guard(code));
  window.cheerpOSAddStringFile(`/str/${tag}/${fileName}`, code);
  window.cheerpOSAddStringFile(`/str/${tag}/FmRun.java`, RUNNER);
  window.cheerpOSAddStringFile(`/str/${tag}/FmGuard.java`, GUARD);
  window.cheerpOSAddStringFile('/str/input.txt', input.endsWith('\n') ? input : input + '\n');
  const log = `/files/javac_${tag}.txt`;
  // Classes go straight into /files/ (javac needs an existing folder); each run recompiles what it uses.
  const javac = file => window.cheerpjRunMain('com.sun.tools.javac.Main', '/app/java/tools.jar',
    '-nowarn', '-Xstdout', log, '-d', '/files/', file, `/str/${tag}/FmRun.java`, `/str/${tag}/FmGuard.java`);
  if (await javac(`/str/${tag}/g/${fileName}`) !== 0) {
    // Recompile his own code: it either shows the real errors against his lines, or (rarely, e.g. a
    // while (true) loop that returns from inside) compiles fine, and then runs as written.
    if (await javac(`/str/${tag}/${fileName}`) === 0) return finish(mainClass, onStatus);
    const msg = (await readFile(log)).replaceAll(`/str/${tag}/`, '').replace(/^(\w+\.java):(\d+): /gm, 'Line $2: ');
    return { stage: 'compile', ok: false, output: msg.trim() || 'The program did not compile.' };
  }
  return finish(mainClass, onStatus);
}

async function finish(mainClass, onStatus) {
  if (!mainClass) return { stage: 'compile', ok: true, output: 'Compiled with no errors.\n\nTo run it, add a main method:\npublic static void main(String[] args) { … }' };
  onStatus('Running…');
  await window.cheerpjRunMain('FmRun', '/files/', mainClass);
  let out = await readFile('/files/out.txt');
  if (out.length > MAX_OUT) out = out.slice(0, MAX_OUT) + '\n[Output cut off here.]';
  return { stage: 'run', ok: true, output: out };
}
