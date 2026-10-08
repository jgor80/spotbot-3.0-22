// FC27 per-player match stats -> our shape. Used by every bot path that saves EA matches so the
// recap (club_matches.player_stats) and per-player history (player_stats) get the full EA stat set.
// Keep field names in sync with supabase/functions/sync-ea-stats/index.ts.

const int = (v) => {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : 0;
};
const flag = (v) => v === '1' || v === 1 || v === true;

// FC27 sends pos as a word ("goalkeeper", "defender", "midfielder", "forward"); older data used codes
function isKeeper(pos) {
  const p = String(pos || '').toLowerCase();
  return p === 'gk' || p === 'goalkeeper';
}

function mapPlayer(p) {
  const savesDiving = int(p.ballDiveSaves);
  const savesCross = int(p.crossSaves);
  const savesParry = int(p.parrySaves);
  const savesPunch = int(p.punchSaves);
  const savesReflex = int(p.reflexSaves);
  const saveSum = savesDiving + savesCross + savesParry + savesPunch + savesReflex;
  const tackles = int(p.tacklesmade ?? p.tackles);
  const passesMade = int(p.passesmade ?? p.passesMade);
  return {
    ea_username: p.playername,
    goals: int(p.goals),
    assists: int(p.assists),
    rating: parseFloat(p.rating || 0) || 0,
    position: p.pos,
    motm: flag(p.mom),
    shots: int(p.shots),
    tackles,
    tackle_attempts: int(p.tackleattempts ?? p.tackleAttempts),
    passes_made: passesMade,
    pass_attempts: int(p.passattempts ?? p.passAttempts),
    red_cards: flag(p.redcards) || flag(p.redCards),
    interceptions: int(p.interceptions),
    clearances: int(p.clearances),
    saves: int(p.saves) || saveSum,
    saves_diving: savesDiving,
    saves_cross: savesCross,
    saves_parry: savesParry,
    saves_punch: savesPunch,
    saves_reflex: savesReflex,
    goals_conceded: int(p.goalsconceded ?? p.goalsConceded),
    clean_sheet: flag(p.cleansheetsany) || flag(p.cleansheetsgk) || flag(p.cleansheetsdef),
    clean_sheet_gk: flag(p.cleansheetsgk),
    clean_sheet_def: flag(p.cleansheetsdef),
    seconds_played: int(p.secondsPlayed),
    archetypeid: p.archetypeid ?? null,
  };
}

function mapPlayers(matchData, clubId) {
  return Object.values(matchData?.players?.[String(clubId)] || {}).map(mapPlayer);
}

// Columns for a player_stats row (everything but ids, match type and result)
function statColumns(s, scoreAgainst) {
  return {
    goals: s.goals,
    assists: s.assists,
    clean_sheet: s.clean_sheet || (isKeeper(s.position) && scoreAgainst === 0),
    clean_sheet_gk: s.clean_sheet_gk,
    clean_sheet_def: s.clean_sheet_def,
    ea_match_rating: s.rating,
    position_played: s.position,
    man_of_match: s.motm,
    shots: s.shots,
    tackles: s.tackles,
    tackle_attempts: s.tackle_attempts,
    passes_made: s.passes_made,
    pass_attempts: s.pass_attempts,
    red_cards: s.red_cards,
    interceptions: s.interceptions,
    clearances: s.clearances,
    saves_diving: s.saves_diving,
    saves_cross: s.saves_cross,
    saves_parry: s.saves_parry,
    saves_punch: s.saves_punch,
    saves_reflex: s.saves_reflex,
    goals_conceded: s.goals_conceded,
    seconds_played: s.seconds_played,
    archetypeid: s.archetypeid,
  };
}

module.exports = { mapPlayer, mapPlayers, statColumns, isKeeper };
