/**
 * deduplicatePrelim.js
 *
 * Finds duplicate questions across multiple prelim papers.
 * When the same question appears in multiple schools:
 *   - Keeps the best copy (longest answer)
 *   - Updates year_tag to list all school names
 *   - Deletes the duplicate rows
 *
 * Usage: node scripts/deduplicatePrelim.js
 * Pass --dry-run to preview without making changes.
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env'), override: true });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const DRY_RUN = process.argv.includes('--dry-run');

// ── Normalize question text for comparison ───────────────────────────────────
function normalize(text) {
  return text
    .toLowerCase()
    // remove leading question numbers: "1.", "(i)", "(a)", "Q3." etc.
    .replace(/^\s*(?:q\.?\s*)?\d+[\.\)]\s*/i, '')
    .replace(/^\s*\([a-z]\)\s*/i, '')
    // collapse punctuation variations
    .replace(/['"''""]/g, "'")
    .replace(/[–—]/g, '-')
    // collapse whitespace
    .replace(/\s+/g, ' ')
    .trim();
}

// ── Extract school name from year_tag ────────────────────────────────────────
function schoolFromTag(yearTag) {
  if (!yearTag) return 'Unknown';
  return yearTag.replace(/\s*Prelim\s*2025-26\s*$/i, '').trim();
}

// ── Fetch all prelim questions with pagination ───────────────────────────────
async function fetchAllPrelim() {
  const PAGE = 1000;
  let all = [];
  let offset = 0;

  while (true) {
    const { data, error } = await supabase
      .from('questions')
      .select('id, question, answer, year_tag, skill, board_tips')
      .eq('skill', 'Prelim 2025-26')
      .range(offset, offset + PAGE - 1);

    if (error) throw error;
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < PAGE) break;
    offset += PAGE;
  }

  return all;
}

async function run() {
  console.log(`${DRY_RUN ? '[DRY RUN] ' : ''}Fetching prelim questions...`);
  const questions = await fetchAllPrelim();
  console.log(`Loaded ${questions.length} prelim questions`);

  // ── Group by normalized question text ──────────────────────────────────────
  const groups = new Map();
  for (const q of questions) {
    const key = normalize(q.question);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(q);
  }

  const dupGroups = [...groups.values()].filter(g => g.length > 1);
  console.log(`\nFound ${dupGroups.length} duplicate question groups\n`);

  if (dupGroups.length === 0) {
    console.log('No duplicates found. Done.');
    return;
  }

  let totalMerged = 0;
  let totalDeleted = 0;
  const errors = [];

  for (const group of dupGroups) {
    // Collect unique school names
    const schools = [...new Set(group.map(q => schoolFromTag(q.year_tag)))];
    const schoolCount = schools.length;

    // Format year_tag: list all schools if ≤4, else "School1, School2 + N more"
    let newYearTag;
    if (schools.length <= 4) {
      newYearTag = schools.join(', ') + ' Prelim 2025-26';
    } else {
      newYearTag = schools.slice(0, 3).join(', ') + ` +${schools.length - 3} more Prelim 2025-26`;
    }

    // Pick the best copy: prefer longest answer, then one with a board_tips
    const sorted = [...group].sort((a, b) => {
      const tipScore = (b.board_tips ? 1 : 0) - (a.board_tips ? 1 : 0);
      if (tipScore !== 0) return tipScore;
      return (b.answer?.length || 0) - (a.answer?.length || 0);
    });

    const keep = sorted[0];
    const toDelete = sorted.slice(1).map(q => q.id);

    console.log(`  [${schoolCount} schools] "${keep.question.slice(0, 70).replace(/\n/g, ' ')}..."`);
    console.log(`    Schools: ${schools.join(', ')}`);
    console.log(`    Keeping: ${keep.id} | Deleting: ${toDelete.join(', ')}`);

    if (!DRY_RUN) {
      // Update kept question with merged school tag
      const { error: updateErr } = await supabase
        .from('questions')
        .update({ year_tag: newYearTag })
        .eq('id', keep.id);

      if (updateErr) {
        errors.push(`Update ${keep.id}: ${updateErr.message}`);
        continue;
      }

      // Delete duplicates in batches of 50
      for (let i = 0; i < toDelete.length; i += 50) {
        const batch = toDelete.slice(i, i + 50);
        const { error: delErr } = await supabase
          .from('questions')
          .delete()
          .in('id', batch);

        if (delErr) {
          errors.push(`Delete batch: ${delErr.message}`);
        } else {
          totalDeleted += batch.length;
        }
      }
    }

    totalMerged++;
    totalDeleted += DRY_RUN ? toDelete.length : 0;
  }

  console.log(`\n${'─'.repeat(60)}`);
  if (DRY_RUN) {
    console.log(`DRY RUN complete:`);
    console.log(`  Would merge: ${totalMerged} question groups`);
    console.log(`  Would delete: ${dupGroups.reduce((s, g) => s + g.length - 1, 0)} duplicate rows`);
  } else {
    console.log(`Done:`);
    console.log(`  Merged:  ${totalMerged} question groups (year_tag updated)`);
    console.log(`  Deleted: ${totalDeleted} duplicate rows`);
  }

  if (errors.length) {
    console.log(`\nErrors (${errors.length}):`);
    errors.forEach(e => console.log('  ' + e));
  }

  // Final count
  if (!DRY_RUN) {
    const { count } = await supabase
      .from('questions')
      .select('*', { count: 'exact', head: true })
      .eq('skill', 'Prelim 2025-26');
    console.log(`\nPrelim questions remaining in DB: ${count}`);
  }
}

run().catch(console.error);
