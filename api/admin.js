import { createClient } from '@supabase/supabase-js';

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'shwetadoshireads@gmail.com';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  // Verify Authorization header (Supabase JWT)
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  // Verify token and get user
  const anonClient = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY
  );
  const { data: { user }, error: authErr } = await anonClient.auth.getUser(token);
  if (authErr || !user) return res.status(401).json({ error: 'Invalid token' });

  // Gate: only admin email
  if (user.email !== ADMIN_EMAIL) return res.status(403).json({ error: 'Forbidden' });

  // Use service key to bypass RLS
  const admin = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
  );

  try {
    // 1. Get all auth users
    const { data: { users }, error: usersErr } = await admin.auth.admin.listUsers({ perPage: 200 });
    if (usersErr) throw usersErr;

    // 2. Get all sessions
    const { data: sessions } = await admin.from('sessions')
      .select('user_id, subject, total_questions, correct_answers, created_at')
      .order('created_at', { ascending: false });

    // 3. Get all skill scores
    const { data: skills } = await admin.from('skill_scores')
      .select('user_id, subject, skill, total_attempts, correct_attempts');

    // 4. Aggregate per user
    const userMap = {};
    users.forEach(u => {
      userMap[u.id] = {
        id: u.id,
        email: u.email,
        name: u.user_metadata?.full_name || u.email?.split('@')[0],
        avatar: u.user_metadata?.avatar_url,
        lastActive: u.last_sign_in_at,
        createdAt: u.created_at,
        subjects: {},
        totalQuestions: 0,
        totalCorrect: 0,
      };
    });

    // Aggregate sessions
    (sessions || []).forEach(s => {
      const u = userMap[s.user_id];
      if (!u) return;
      if (!u.subjects[s.subject]) u.subjects[s.subject] = { questions: 0, correct: 0, sessions: 0, lastStudied: null };
      u.subjects[s.subject].questions += s.total_questions || 0;
      u.subjects[s.subject].correct += s.correct_answers || 0;
      u.subjects[s.subject].sessions += 1;
      if (!u.subjects[s.subject].lastStudied || s.created_at > u.subjects[s.subject].lastStudied) {
        u.subjects[s.subject].lastStudied = s.created_at;
      }
      u.totalQuestions += s.total_questions || 0;
      u.totalCorrect += s.correct_answers || 0;
    });

    // Aggregate skills
    (skills || []).forEach(s => {
      const u = userMap[s.user_id];
      if (!u) return;
      if (!u.subjects[s.subject]) u.subjects[s.subject] = { questions: 0, correct: 0, sessions: 0, lastStudied: null };
      if (!u.subjects[s.subject].skills) u.subjects[s.subject].skills = [];
      u.subjects[s.subject].skills.push({
        skill: s.skill,
        accuracy: s.total_attempts > 0 ? Math.round((s.correct_attempts / s.total_attempts) * 100) : 0,
        attempts: s.total_attempts,
      });
    });

    const userList = Object.values(userMap).sort((a, b) =>
      new Date(b.lastActive || 0) - new Date(a.lastActive || 0)
    );

    // Summary stats
    const activeThisWeek = userList.filter(u => {
      if (!u.lastActive) return false;
      return (Date.now() - new Date(u.lastActive)) < 7 * 24 * 60 * 60 * 1000;
    }).length;

    return res.status(200).json({
      summary: {
        totalUsers: userList.length,
        totalQuestions: userList.reduce((s, u) => s + u.totalQuestions, 0),
        activeThisWeek,
      },
      users: userList,
    });

  } catch (err) {
    console.error('Admin API error:', err);
    return res.status(500).json({ error: err.message });
  }
}
