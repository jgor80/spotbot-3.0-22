import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface TournamentInput {
  name: string;
  description?: string;
  format?: string;
  max_teams?: number;
  min_teams?: number;
  teams_per_group?: number;
  group_matches_per_team?: number;
  time_slot?: string;
  registration_opens_at?: string;
  registration_closes_at?: string;
  starts_at?: string;
  ends_at?: string;
  platform?: string;
  elo_range_min?: number;
  elo_range_max?: number;
  rules?: string;
  prize_description?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { action, ...params } = await req.json();

    switch (action) {
      case "create-tournament":
        return await createTournament(supabase, params);
      case "update-tournament":
        return await updateTournament(supabase, params);
      case "delete-tournament":
        return await deleteTournament(supabase, params);
      case "get-tournaments":
        return await getTournaments(supabase, params);
      case "get-tournament":
        return await getTournament(supabase, params);
      case "invite-team":
        return await inviteTeam(supabase, params);
      case "invite-teams-bulk":
        return await inviteTeamsBulk(supabase, params);
      case "respond-invite":
        return await respondInvite(supabase, params);
      case "start-tournament":
        return await startTournament(supabase, params);
      case "generate-fixtures":
        return await generateFixtures(supabase, params);
      case "submit-result":
        return await submitResult(supabase, params);
      case "confirm-result":
        return await confirmResult(supabase, params);
      case "advance-knockout":
        return await advanceKnockout(supabase, params);
      case "get-bracket":
        return await getBracket(supabase, params);
      case "get-standings":
        return await getStandings(supabase, params);
      default:
        return new Response(JSON.stringify({ error: "Unknown action" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : "Unknown error";
    console.error("Error:", errMsg);
    return new Response(JSON.stringify({ error: errMsg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

// Create a new tournament
async function createTournament(supabase: any, params: {
  guild_id: string;
  discord_user_id: string;
  tournament: TournamentInput;
}) {
  const { guild_id, discord_user_id, tournament } = params;

  if (!guild_id || !discord_user_id || !tournament?.name) {
    return errorResponse("guild_id, discord_user_id, and tournament.name are required");
  }

  const { data, error } = await supabase
    .from("tournaments")
    .insert({
      guild_id,
      created_by_discord_id: discord_user_id,
      name: tournament.name,
      description: tournament.description,
      format: tournament.format || "group_knockout",
      max_teams: tournament.max_teams || 32,
      min_teams: tournament.min_teams || 8,
      teams_per_group: tournament.teams_per_group || 4,
      group_matches_per_team: tournament.group_matches_per_team || 3,
      time_slot: tournament.time_slot,
      registration_opens_at: tournament.registration_opens_at,
      registration_closes_at: tournament.registration_closes_at,
      starts_at: tournament.starts_at,
      ends_at: tournament.ends_at,
      platform: tournament.platform,
      elo_range_min: tournament.elo_range_min,
      elo_range_max: tournament.elo_range_max,
      rules: tournament.rules,
      prize_description: tournament.prize_description,
      status: "draft",
    })
    .select()
    .single();

  if (error) {
    console.error("Create tournament error:", error);
    return errorResponse(error.message);
  }

  return successResponse({ tournament: data });
}

// Update tournament details
async function updateTournament(supabase: any, params: {
  tournament_id: string;
  discord_user_id: string;
  updates: Partial<TournamentInput> & { status?: string };
}) {
  const { tournament_id, discord_user_id, updates } = params;

  if (!tournament_id) {
    return errorResponse("tournament_id is required");
  }

  // Verify ownership
  const { data: existing } = await supabase
    .from("tournaments")
    .select("created_by_discord_id, status")
    .eq("id", tournament_id)
    .single();

  if (!existing) {
    return errorResponse("Tournament not found");
  }

  if (existing.created_by_discord_id !== discord_user_id) {
    return errorResponse("Only the tournament creator can update it");
  }

  const { data, error } = await supabase
    .from("tournaments")
    .update(updates)
    .eq("id", tournament_id)
    .select()
    .single();

  if (error) {
    return errorResponse(error.message);
  }

  return successResponse({ tournament: data });
}

// Delete tournament
async function deleteTournament(supabase: any, params: {
  tournament_id: string;
  discord_user_id: string;
}) {
  const { tournament_id, discord_user_id } = params;

  // Verify ownership
  const { data: existing } = await supabase
    .from("tournaments")
    .select("created_by_discord_id")
    .eq("id", tournament_id)
    .single();

  if (!existing || existing.created_by_discord_id !== discord_user_id) {
    return errorResponse("Not authorized to delete this tournament");
  }

  const { error } = await supabase
    .from("tournaments")
    .delete()
    .eq("id", tournament_id);

  if (error) {
    return errorResponse(error.message);
  }

  return successResponse({ deleted: true });
}

// Get tournaments list
async function getTournaments(supabase: any, params: {
  guild_id?: string;
  status?: string;
  limit?: number;
}) {
  const { guild_id, status, limit = 50 } = params;

  let query = supabase
    .from("tournaments")
    .select(`
      *,
      tournament_teams(count)
    `)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (guild_id) {
    query = query.eq("guild_id", guild_id);
  }

  if (status) {
    query = query.eq("status", status);
  }

  const { data, error } = await query;

  if (error) {
    return errorResponse(error.message);
  }

  return successResponse({ tournaments: data });
}

// Get single tournament with full details
async function getTournament(supabase: any, params: { tournament_id: string }) {
  const { tournament_id } = params;

  const { data: tournament, error: tError } = await supabase
    .from("tournaments")
    .select("*")
    .eq("id", tournament_id)
    .single();

  if (tError) {
    return errorResponse(tError.message);
  }

  // Get teams with club info
  const { data: teams } = await supabase
    .from("tournament_teams")
    .select(`
      *,
      club:global_league_clubs(id, club_name, club_key, ea_platform, elo_rating)
    `)
    .eq("tournament_id", tournament_id)
    .order("group_name", { ascending: true })
    .order("seed", { ascending: true });

  // Get matches
  const { data: matches } = await supabase
    .from("tournament_matches")
    .select(`
      *,
      home_team:tournament_teams!tournament_matches_home_team_id_fkey(
        id,
        club:global_league_clubs(id, club_name, club_key)
      ),
      away_team:tournament_teams!tournament_matches_away_team_id_fkey(
        id,
        club:global_league_clubs(id, club_name, club_key)
      )
    `)
    .eq("tournament_id", tournament_id)
    .order("stage", { ascending: true })
    .order("match_number", { ascending: true });

  // Get standings
  const { data: standings } = await supabase
    .from("tournament_standings")
    .select(`
      *,
      team:tournament_teams(
        id,
        club:global_league_clubs(id, club_name, club_key)
      )
    `)
    .eq("tournament_id", tournament_id)
    .order("group_name", { ascending: true })
    .order("position", { ascending: true });

  return successResponse({
    tournament,
    teams: teams || [],
    matches: matches || [],
    standings: standings || [],
  });
}

// Invite a team to tournament
async function inviteTeam(supabase: any, params: {
  tournament_id: string;
  club_id: string;
  invited_by_discord_id: string;
}) {
  const { tournament_id, club_id, invited_by_discord_id } = params;

  if (!tournament_id || !club_id) {
    return errorResponse("tournament_id and club_id are required");
  }

  // Check if already invited
  const { data: existing } = await supabase
    .from("tournament_teams")
    .select("id")
    .eq("tournament_id", tournament_id)
    .eq("club_id", club_id)
    .single();

  if (existing) {
    return errorResponse("Team is already invited to this tournament");
  }

  // Check team count
  const { data: tournament } = await supabase
    .from("tournaments")
    .select("max_teams")
    .eq("id", tournament_id)
    .single();

  const { count } = await supabase
    .from("tournament_teams")
    .select("*", { count: "exact", head: true })
    .eq("tournament_id", tournament_id);

  if (count >= tournament.max_teams) {
    return errorResponse("Tournament is full");
  }

  const { data, error } = await supabase
    .from("tournament_teams")
    .insert({
      tournament_id,
      club_id,
      invited_by_discord_id,
      status: "invited",
    })
    .select(`
      *,
      club:global_league_clubs(id, club_name, club_key)
    `)
    .single();

  if (error) {
    return errorResponse(error.message);
  }

  return successResponse({ team: data });
}

// Bulk invite teams
async function inviteTeamsBulk(supabase: any, params: {
  tournament_id: string;
  club_ids: string[];
  invited_by_discord_id: string;
}) {
  const { tournament_id, club_ids, invited_by_discord_id } = params;

  if (!club_ids?.length) {
    return errorResponse("club_ids array is required");
  }

  const inserts = club_ids.map(club_id => ({
    tournament_id,
    club_id,
    invited_by_discord_id,
    status: "invited",
  }));

  const { data, error } = await supabase
    .from("tournament_teams")
    .upsert(inserts, { onConflict: "tournament_id,club_id", ignoreDuplicates: true })
    .select();

  if (error) {
    return errorResponse(error.message);
  }

  return successResponse({ invited_count: data.length });
}

// Respond to tournament invite
async function respondInvite(supabase: any, params: {
  team_id: string;
  club_id: string;
  discord_user_id: string;
  accept: boolean;
}) {
  const { team_id, club_id, discord_user_id, accept } = params;

  // Verify the responder is from the club
  const { data: club } = await supabase
    .from("global_league_clubs")
    .select("registered_by_discord_id")
    .eq("id", club_id)
    .single();

  if (!club || club.registered_by_discord_id !== discord_user_id) {
    return errorResponse("Only the club manager can respond to invites");
  }

  const { data, error } = await supabase
    .from("tournament_teams")
    .update({
      status: accept ? "accepted" : "declined",
      responded_at: new Date().toISOString(),
    })
    .eq("id", team_id)
    .eq("club_id", club_id)
    .select()
    .single();

  if (error) {
    return errorResponse(error.message);
  }

  return successResponse({ team: data });
}

// Start tournament and generate groups
async function startTournament(supabase: any, params: {
  tournament_id: string;
  discord_user_id: string;
}) {
  const { tournament_id, discord_user_id } = params;

  // Verify ownership and status
  const { data: tournament } = await supabase
    .from("tournaments")
    .select("*")
    .eq("id", tournament_id)
    .single();

  if (!tournament) {
    return errorResponse("Tournament not found");
  }

  if (tournament.created_by_discord_id !== discord_user_id) {
    return errorResponse("Only the tournament creator can start it");
  }

  if (tournament.status !== "draft" && tournament.status !== "registration") {
    return errorResponse("Tournament already started");
  }

  // Get accepted teams
  const { data: teams } = await supabase
    .from("tournament_teams")
    .select("*, club:global_league_clubs(elo_rating)")
    .eq("tournament_id", tournament_id)
    .eq("status", "accepted");

  if (!teams || teams.length < tournament.min_teams) {
    return errorResponse(`Need at least ${tournament.min_teams} teams to start (have ${teams?.length || 0})`);
  }

  // Sort by ELO for seeding
  const sortedTeams = (teams as { id: string; club?: { elo_rating?: number } }[]).sort((a, b) => 
    (b.club?.elo_rating || 1200) - (a.club?.elo_rating || 1200)
  );

  // Calculate groups
  const teamsPerGroup = tournament.teams_per_group || 4;
  const numGroups = Math.ceil(sortedTeams.length / teamsPerGroup);
  const groupNames = "ABCDEFGHIJKLMNOP".slice(0, numGroups).split("");

  // Assign teams to groups using snake draft for balance
  const groupAssignments: { team_id: string; group_name: string; seed: number }[] = [];
  const standingsInserts: any[] = [];

  let direction = 1;
  let groupIndex = 0;
  
  sortedTeams.forEach((team: { id: string }, index: number) => {
    const group = groupNames[groupIndex];
    groupAssignments.push({
      team_id: team.id,
      group_name: group,
      seed: index + 1,
    });

    standingsInserts.push({
      tournament_id,
      team_id: team.id,
      group_name: group,
      played: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      goals_for: 0,
      goals_against: 0,
      goal_difference: 0,
      points: 0,
    });

    // Snake through groups
    groupIndex += direction;
    if (groupIndex >= numGroups) {
      groupIndex = numGroups - 1;
      direction = -1;
    } else if (groupIndex < 0) {
      groupIndex = 0;
      direction = 1;
    }
  });

  // Update teams with group assignments
  for (const assignment of groupAssignments) {
    await supabase
      .from("tournament_teams")
      .update({ group_name: assignment.group_name, seed: assignment.seed })
      .eq("id", assignment.team_id);
  }

  // Create standings
  await supabase.from("tournament_standings").insert(standingsInserts);

  // Update tournament status
  await supabase
    .from("tournaments")
    .update({ status: "group_stage" })
    .eq("id", tournament_id);

  // Generate group fixtures
  await generateGroupFixtures(supabase, tournament_id, groupNames, tournament.group_matches_per_team);

  return successResponse({ 
    started: true, 
    groups: numGroups,
    teams_count: sortedTeams.length,
  });
}

// Generate group stage fixtures (round-robin within groups)
async function generateGroupFixtures(
  supabase: any, 
  tournament_id: string, 
  groups: string[],
  matchesPerTeam: number
) {
  const matches: any[] = [];
  let matchNumber = 1;

  for (const group of groups) {
    // Get teams in this group
    const { data: teams } = await supabase
      .from("tournament_teams")
      .select("id")
      .eq("tournament_id", tournament_id)
      .eq("group_name", group)
      .order("seed", { ascending: true });

    if (!teams || teams.length < 2) continue;

    // Round-robin fixtures
    for (let i = 0; i < teams.length; i++) {
      for (let j = i + 1; j < teams.length; j++) {
        matches.push({
          tournament_id,
          stage: "group",
          group_name: group,
          match_number: matchNumber++,
          home_team_id: teams[i].id,
          away_team_id: teams[j].id,
          result_source: "pending",
        });
      }
    }
  }

  if (matches.length > 0) {
    await supabase.from("tournament_matches").insert(matches);
  }
}

// Manual fixture generation endpoint
async function generateFixtures(supabase: any, params: {
  tournament_id: string;
  discord_user_id: string;
  stage: "group" | "knockout";
}) {
  const { tournament_id, discord_user_id, stage } = params;

  const { data: tournament } = await supabase
    .from("tournaments")
    .select("*")
    .eq("id", tournament_id)
    .single();

  if (tournament.created_by_discord_id !== discord_user_id) {
    return errorResponse("Only the tournament creator can generate fixtures");
  }

  if (stage === "knockout") {
    return await generateKnockoutBracket(supabase, tournament_id, tournament.teams_per_group);
  }

  return successResponse({ message: "Fixtures already generated on tournament start" });
}

// Generate knockout bracket from group winners
async function generateKnockoutBracket(supabase: any, tournament_id: string, teamsPerGroup: number) {
  // Get group winners (top 2 by default)
  const qualifyCount = 2; // Top 2 from each group

  const { data: standings } = await supabase
    .from("tournament_standings")
    .select(`
      *,
      team:tournament_teams(id, group_name)
    `)
    .eq("tournament_id", tournament_id)
    .lte("position", qualifyCount)
    .order("group_name", { ascending: true })
    .order("position", { ascending: true });

  if (!standings || standings.length < 2) {
    return errorResponse("Not enough qualified teams for knockout");
  }

  // Mark qualified teams
  for (const s of standings) {
    await supabase
      .from("tournament_standings")
      .update({ qualified: true })
      .eq("id", s.id);
  }

  // Update tournament status
  await supabase
    .from("tournaments")
    .update({ status: "knockout" })
    .eq("id", tournament_id);

  // Determine knockout stage
  const teamCount = standings.length;
  let stage = "final";
  if (teamCount > 32) stage = "round_of_64";
  else if (teamCount > 16) stage = "round_of_32";
  else if (teamCount > 8) stage = "round_of_16";
  else if (teamCount > 4) stage = "quarter_final";
  else if (teamCount > 2) stage = "semi_final";

  // Seed matches: Group A 1st vs Group B 2nd, etc.
  const matches: any[] = [];
  const groups = [...new Set(standings.map((s: { team: { group_name: string } }) => s.team.group_name))].sort();
  
  let matchNumber = 1;
  for (let i = 0; i < groups.length; i += 2) {
    const groupA = groups[i];
    const groupB = groups[i + 1] || groups[0]; // Wrap if odd

    const groupATeams = standings.filter((s: { team: { group_name: string }; team_id: string }) => s.team.group_name === groupA);
    const groupBTeams = standings.filter((s: { team: { group_name: string }; team_id: string }) => s.team.group_name === groupB);

    // A1 vs B2
    if (groupATeams[0] && groupBTeams[1]) {
      matches.push({
        tournament_id,
        stage,
        round_number: 1,
        match_number: matchNumber++,
        home_team_id: groupATeams[0].team_id,
        away_team_id: groupBTeams[1].team_id,
        result_source: "pending",
      });
    }

    // B1 vs A2
    if (groupBTeams[0] && groupATeams[1]) {
      matches.push({
        tournament_id,
        stage,
        round_number: 1,
        match_number: matchNumber++,
        home_team_id: groupBTeams[0].team_id,
        away_team_id: groupATeams[1].team_id,
        result_source: "pending",
      });
    }
  }

  if (matches.length > 0) {
    await supabase.from("tournament_matches").insert(matches);
  }

  return successResponse({ 
    knockout_started: true, 
    qualified_teams: teamCount,
    first_round: stage,
    matches_created: matches.length,
  });
}

// Submit match result
async function submitResult(supabase: any, params: {
  match_id: string;
  discord_user_id: string;
  home_score: number;
  away_score: number;
  ea_match_id?: string;
}) {
  const { match_id, discord_user_id, home_score, away_score, ea_match_id } = params;

  if (home_score === undefined || away_score === undefined) {
    return errorResponse("home_score and away_score are required");
  }

  const { data: match, error: matchError } = await supabase
    .from("tournament_matches")
    .select(`
      *,
      home_team:tournament_teams!tournament_matches_home_team_id_fkey(club_id),
      away_team:tournament_teams!tournament_matches_away_team_id_fkey(club_id)
    `)
    .eq("id", match_id)
    .single();

  if (matchError || !match) {
    return errorResponse("Match not found");
  }

  if (match.result_source !== "pending") {
    return errorResponse("Result already submitted");
  }

  // Determine winner
  let winner_team_id = null;
  if (home_score > away_score) {
    winner_team_id = match.home_team_id;
  } else if (away_score > home_score) {
    winner_team_id = match.away_team_id;
  }

  const { data, error } = await supabase
    .from("tournament_matches")
    .update({
      home_score,
      away_score,
      winner_team_id,
      result_source: ea_match_id ? "auto_detected" : "manual",
      ea_match_id,
      reported_by_discord_id: discord_user_id,
      completed_at: new Date().toISOString(),
    })
    .eq("id", match_id)
    .select()
    .single();

  if (error) {
    return errorResponse(error.message);
  }

  // Update standings if group stage
  if (match.stage === "group") {
    await updateGroupStandings(supabase, match.tournament_id, match.home_team_id, match.away_team_id, home_score, away_score);
  }

  return successResponse({ match: data });
}

// Update group standings after a match
async function updateGroupStandings(
  supabase: any,
  tournament_id: string,
  home_team_id: string,
  away_team_id: string,
  home_score: number,
  away_score: number
) {
  // Calculate points
  let homePoints = 0, awayPoints = 0;
  let homeWin = 0, awayWin = 0, homeDraw = 0, awayDraw = 0, homeLoss = 0, awayLoss = 0;

  if (home_score > away_score) {
    homePoints = 3;
    homeWin = 1;
    awayLoss = 1;
  } else if (away_score > home_score) {
    awayPoints = 3;
    awayWin = 1;
    homeLoss = 1;
  } else {
    homePoints = 1;
    awayPoints = 1;
    homeDraw = 1;
    awayDraw = 1;
  }

  // Update home team standings
  const { data: homeStanding } = await supabase
    .from("tournament_standings")
    .select("*")
    .eq("tournament_id", tournament_id)
    .eq("team_id", home_team_id)
    .single();

  if (homeStanding) {
    await supabase
      .from("tournament_standings")
      .update({
        played: homeStanding.played + 1,
        wins: homeStanding.wins + homeWin,
        draws: homeStanding.draws + homeDraw,
        losses: homeStanding.losses + homeLoss,
        goals_for: homeStanding.goals_for + home_score,
        goals_against: homeStanding.goals_against + away_score,
        goal_difference: homeStanding.goal_difference + (home_score - away_score),
        points: homeStanding.points + homePoints,
      })
      .eq("id", homeStanding.id);
  }

  // Update away team standings
  const { data: awayStanding } = await supabase
    .from("tournament_standings")
    .select("*")
    .eq("tournament_id", tournament_id)
    .eq("team_id", away_team_id)
    .single();

  if (awayStanding) {
    await supabase
      .from("tournament_standings")
      .update({
        played: awayStanding.played + 1,
        wins: awayStanding.wins + awayWin,
        draws: awayStanding.draws + awayDraw,
        losses: awayStanding.losses + awayLoss,
        goals_for: awayStanding.goals_for + away_score,
        goals_against: awayStanding.goals_against + home_score,
        goal_difference: awayStanding.goal_difference + (away_score - home_score),
        points: awayStanding.points + awayPoints,
      })
      .eq("id", awayStanding.id);
  }

  // Recalculate positions for the group
  await recalculateGroupPositions(supabase, tournament_id, homeStanding?.group_name);
}

// Recalculate group positions
async function recalculateGroupPositions(supabase: any, tournament_id: string, group_name: string) {
  const { data: standings } = await supabase
    .from("tournament_standings")
    .select("id, points, goal_difference, goals_for")
    .eq("tournament_id", tournament_id)
    .eq("group_name", group_name)
    .order("points", { ascending: false })
    .order("goal_difference", { ascending: false })
    .order("goals_for", { ascending: false });

  if (standings) {
    for (let i = 0; i < standings.length; i++) {
      await supabase
        .from("tournament_standings")
        .update({ position: i + 1 })
        .eq("id", standings[i].id);
    }
  }
}

// Confirm result (optional second confirmation)
async function confirmResult(supabase: any, params: {
  match_id: string;
  discord_user_id: string;
}) {
  const { match_id, discord_user_id } = params;

  const { data, error } = await supabase
    .from("tournament_matches")
    .update({
      confirmed_by_discord_id: discord_user_id,
    })
    .eq("id", match_id)
    .select()
    .single();

  if (error) {
    return errorResponse(error.message);
  }

  return successResponse({ match: data });
}

// Advance winner in knockout
async function advanceKnockout(supabase: any, params: {
  match_id: string;
  discord_user_id: string;
}) {
  const { match_id } = params;

  const { data: match } = await supabase
    .from("tournament_matches")
    .select("*")
    .eq("id", match_id)
    .single();

  if (!match?.winner_team_id || !match.next_match_id) {
    return errorResponse("No winner or no next match configured");
  }

  // Place winner in next match
  const updateField = match.next_match_position === "away" ? "away_team_id" : "home_team_id";
  
  await supabase
    .from("tournament_matches")
    .update({ [updateField]: match.winner_team_id })
    .eq("id", match.next_match_id);

  // Mark loser as eliminated
  const loserId = match.winner_team_id === match.home_team_id 
    ? match.away_team_id 
    : match.home_team_id;

  await supabase
    .from("tournament_teams")
    .update({ status: "eliminated" })
    .eq("id", loserId);

  return successResponse({ advanced: true });
}

// Get bracket view
async function getBracket(supabase: any, params: { tournament_id: string }) {
  const { tournament_id } = params;

  const { data: matches, error } = await supabase
    .from("tournament_matches")
    .select(`
      *,
      home_team:tournament_teams!tournament_matches_home_team_id_fkey(
        id,
        club:global_league_clubs(id, club_name, club_key)
      ),
      away_team:tournament_teams!tournament_matches_away_team_id_fkey(
        id,
        club:global_league_clubs(id, club_name, club_key)
      )
    `)
    .eq("tournament_id", tournament_id)
    .neq("stage", "group")
    .order("round_number", { ascending: true })
    .order("match_number", { ascending: true });

  if (error) {
    return errorResponse(error.message);
  }

  return successResponse({ bracket: matches });
}

// Get standings
async function getStandings(supabase: any, params: { tournament_id: string; group_name?: string }) {
  const { tournament_id, group_name } = params;

  let query = supabase
    .from("tournament_standings")
    .select(`
      *,
      team:tournament_teams(
        id,
        club:global_league_clubs(id, club_name, club_key, elo_rating)
      )
    `)
    .eq("tournament_id", tournament_id)
    .order("group_name", { ascending: true })
    .order("position", { ascending: true });

  if (group_name) {
    query = query.eq("group_name", group_name);
  }

  const { data, error } = await query;

  if (error) {
    return errorResponse(error.message);
  }

  return successResponse({ standings: data });
}

// Helper functions
function successResponse(data: any) {
  return new Response(JSON.stringify(data), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function errorResponse(message: string, status = 400) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
