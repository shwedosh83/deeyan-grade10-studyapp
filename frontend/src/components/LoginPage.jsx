import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import Logo from './Logo';

const FEATURES = [
  { icon: '📄', title: 'Real board and prelim papers', body: 'Practise on past ICSE papers, timed like the exam or as quick Sprint rounds.' },
  { icon: '🎯', title: 'Marked against the scheme', body: 'See what you scored and which points earn the marks.' },
  { icon: '📈', title: 'Progress you can trust', body: 'Accuracy by chapter, a daily goal and a streak, all from your own answers.' },
];

export default function LoginPage() {
  const { signInWithGoogle } = useAuth();
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  async function handleGoogleLogin() {
    setError(null);
    setLoading(true);
    try {
      await signInWithGoogle();
    } catch (err) {
      setError(err.message || 'Login failed. Please try again.');
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen bg-canvas">
      {/* Navy hero panel (brand colours on purpose: white text sits on navy in both themes) */}
      <section className="relative hidden w-[52%] flex-col justify-between overflow-hidden bg-gradient-to-br from-barca-navy-deep via-barca-navy-deep to-barca-navy p-12 text-white lg:flex">
        <div className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full bg-barca-gold/15 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 -left-20 h-96 w-96 rounded-full bg-sky-400/10 blur-3xl" />

        <div className="relative"><Logo size="md" dark={true} /></div>

        <div className="relative max-w-md animate-slide-up">
          <p className="text-xs font-semibold uppercase tracking-widest text-barca-gold">ICSE · Class 10</p>
          <h1 className="mt-3 font-display text-5xl font-extrabold leading-[1.05] tracking-tight text-white">Every mark counts.</h1>
          <p className="mt-4 text-base text-white/70">A calm, focused place to prepare for the board exam, one question at a time.</p>

          <ul className="mt-10 space-y-5">
            {FEATURES.map(f => (
              <li key={f.title} className="flex gap-4">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/10 text-lg ring-1 ring-white/10" aria-hidden="true">{f.icon}</span>
                <div>
                  <p className="font-semibold text-white">{f.title}</p>
                  <p className="mt-0.5 text-sm text-white/60">{f.body}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-xs text-white/40">Grade 10 · ICSE board preparation</p>
      </section>

      {/* Sign-in card */}
      <section className="flex flex-1 items-center justify-center p-8">
        <div className="card w-full max-w-sm p-10 animate-fade-in">
          <div className="mb-8 lg:hidden"><Logo size="lg" dark={false} /></div>
          <p className="eyebrow">Welcome back</p>
          <h2 className="mt-1 font-display text-2xl font-bold text-ink">Sign in to Full Marks</h2>
          <p className="mt-2 text-sm text-ink-3">Grade 10 · ICSE · Practice hub</p>

          {error && (
            <div className="mt-6 rounded-xl border border-bad/20 bg-bad-soft px-4 py-3 text-left text-xs text-bad">
              <p className="mb-1 font-semibold">Login error</p>
              <p>{error}</p>
            </div>
          )}

          <button
            onClick={handleGoogleLogin}
            disabled={loading}
            className="mt-8 flex w-full items-center justify-center gap-3 rounded-xl border border-line bg-surface px-5 py-3 text-sm font-semibold text-ink shadow-soft transition duration-150 hover:bg-surface-2 hover:shadow-lift active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {/* Google G logo */}
            <svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
              <g fill="none" fillRule="evenodd">
                <path d="M17.64 9.205c0-.639-.057-1.252-.164-1.841H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
                <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#34A853"/>
                <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
                <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
              </g>
            </svg>
            {loading ? 'Redirecting...' : 'Continue with Google'}
          </button>

          <p className="mt-6 text-center text-xs text-ink-3">
            For ICSE Grade 10 students only
          </p>
        </div>
      </section>
    </div>
  );
}
