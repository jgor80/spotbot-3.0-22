const count = (v) => v !== null && v !== undefined && v !== '' && Number.isSafeInteger(Number(v)) && Number(v) >= 0 ? Number(v) : null;
function cardStats(rows, club) {
  // Never borrow another team's totals, or a baseline attached to an old EA club ID.
  const s = (rows || []).find((r) => r.club_key === club.key &&
    (!r.baseline_synced || !club.ea_club_id || String(r.ea_club_id) === String(club.ea_club_id)));
  if (!s || !count(s.games_played)) return { stats: [], tagline: '', seasonLabel: 'VIRTUAL PRO', position: '' };
  const gk = /^GK$/i.test(s.primary_position || '');
  const entries = gk
    ? [['GAMES', 'games_played'], ['SAVES', 'saves'], ['CLEAN SH.', 'clean_sheets'], ['MOTM', 'man_of_match']]
    : [['GAMES', 'games_played'], ['GOALS', 'goals'], ['ASSISTS', 'assists'], ['TACKLES', 'tackles']];
  const stats = entries.flatMap(([label, key]) => {
    const v = count(s[key]);
    // Baseline ingestion defaults missing advanced EA fields to zero; those zeroes are not verified.
    return v === null || (s.baseline_synced && v === 0 && !['games_played', 'goals', 'assists'].includes(key)) ? [] : [[label, v]];
  });
  const made = count(s.passes_made), attempts = count(s.pass_attempts);
  if (made !== null && attempts > 0 && made <= attempts) stats.push(['PASS', `${Math.round(made / attempts * 100)}%`]);
  const rating = Number(s.avg_match_rating);
  if (Number.isFinite(rating) && rating > 0 && rating <= 10) stats.push(['RATING', rating.toFixed(1)]);
  const record = [s.wins, s.draws, s.losses].map(count);
  // EA member totals do not reliably supply W/L. The writer infers missing values as draws.
  const tagline = !s.baseline_synced && record.every((v) => v !== null) && record.reduce((a, b) => a + b, 0) === count(s.games_played)
    ? `${record[0]}W ${record[1]}D ${record[2]}L · tracked matches` : '';
  return { stats, tagline, position: s.primary_position || '', seasonLabel: s.baseline_synced ? 'EA CLUB TOTALS' : 'TRACKED MATCHES' };
}
module.exports = { cardStats };