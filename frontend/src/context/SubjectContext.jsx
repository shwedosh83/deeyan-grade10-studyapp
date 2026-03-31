import { createContext, useContext, useState } from 'react';

export const SUBJECTS = [
  { id: 'biology',         label: 'Biology',            emoji: '🧬' },
  { id: 'history_civics',  label: 'History & Civics',   emoji: '🏛️' },
];

const SubjectContext = createContext(null);

export function SubjectProvider({ children }) {
  const stored = localStorage.getItem('deeyan_subject');
  const initial = SUBJECTS.find(s => s.id === stored) || SUBJECTS[0];
  const [subject, setSubjectState] = useState(initial);

  function setSubject(s) {
    localStorage.setItem('deeyan_subject', s.id);
    setSubjectState(s);
  }

  return (
    <SubjectContext.Provider value={{ subject, setSubject, subjects: SUBJECTS }}>
      {children}
    </SubjectContext.Provider>
  );
}

export function useSubject() {
  return useContext(SubjectContext);
}
