import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import HomeDashboard from './components/HomeDashboard';
import Dashboard from './components/Dashboard';
import Quiz from './components/Quiz';
import SkillTracker from './components/SkillTracker';
import WeeklySummary from './components/WeeklySummary';
import LoginPage from './components/LoginPage';
import { SubjectProvider } from './context/SubjectContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { isConfigured } from './lib/supabase';

function SetupBanner() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl border border-gray-200 p-8 max-w-md w-full text-center shadow-sm">
        <div className="text-4xl mb-4">🧬</div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">MyAICoach</h1>
        <p className="text-gray-500 mb-6">Supabase isn't configured yet. Create a <code className="bg-gray-100 px-1.5 py-0.5 rounded text-sm font-mono">.env</code> file in <code className="bg-gray-100 px-1.5 py-0.5 rounded text-sm font-mono">frontend/</code>:</p>
        <div className="bg-gray-900 text-green-400 rounded-lg p-4 text-left text-sm font-mono mb-6">
          <p>VITE_SUPABASE_URL=your_url</p>
          <p>VITE_SUPABASE_ANON_KEY=your_key</p>
        </div>
        <p className="text-xs text-gray-400">Then restart the dev server.</p>
      </div>
    </div>
  );
}

function AppShell() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-barca-navy border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) return <LoginPage />;

  return (
    <SubjectProvider>
      <BrowserRouter>
        <div className="flex min-h-screen bg-gray-50">
          <Sidebar />
          <main className="flex-1 min-w-0 px-8 py-8">
            <Routes>
              <Route path="/" element={<HomeDashboard />} />
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/quiz" element={<Quiz />} />
              <Route path="/skills" element={<SkillTracker />} />
              <Route path="/summary" element={<WeeklySummary />} />
              <Route path="*" element={<Navigate to="/" />} />
            </Routes>
          </main>
        </div>
      </BrowserRouter>
    </SubjectProvider>
  );
}

export default function App() {
  if (!isConfigured) return <SetupBanner />;

  return (
    <AuthProvider>
      <AppShell />
    </AuthProvider>
  );
}
