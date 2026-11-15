import { createContext, useContext, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

export const SUBJECTS = [
  { id: 'biology',             label: 'Biology',          emoji: '🧬' },
  { id: 'history_civics',      label: 'History & Civics', emoji: '🏛️' },
  { id: 'chemistry',           label: 'Chemistry',        emoji: '⚗️' },
  { id: 'geography',           label: 'Geography',        emoji: '🗺️' },
  { id: 'physics',             label: 'Physics',          emoji: '⚡' },
  { id: 'maths',               label: 'Maths',            emoji: '📐' },
  { id: 'english_literature',  label: 'English Lit',      emoji: '📚' },
  { id: 'computer_applications', label: 'Computer Apps',  emoji: '💻' },
];

const SubjectContext = createContext(null);

// The subject lives in the address (/physics/board), so the page, the left bar and the back button always agree.
// Outside a subject page (/home, /admin) it falls back to the last subject studied.
// Must be rendered inside <BrowserRouter>.
export function SubjectProvider({ children }) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const fromUrl = SUBJECTS.find(s => s.id === pathname.split('/')[1]);
  const stored = SUBJECTS.find(s => s.id === localStorage.getItem('deeyan_subject')) || SUBJECTS[0];
  const subject = fromUrl || stored;

  useEffect(() => { if (fromUrl) localStorage.setItem('deeyan_subject', fromUrl.id); }, [fromUrl?.id]); // eslint-disable-line

  // Switching subject opens that subject's overview.
  function setSubject(s) { navigate(`/${s.id}`); }

  return (
    <SubjectContext.Provider value={{ subject, setSubject, subjects: SUBJECTS }}>
      {children}
    </SubjectContext.Provider>
  );
}

export function useSubject() {
  return useContext(SubjectContext);
}
