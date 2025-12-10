const {
  Client,
  GatewayIntentBits,
  Events,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  PermissionsBitField,
  StringSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ChannelType
} = require('discord.js');

// Get token from environment variable only
const token = process.env.BOT_TOKEN;
if (!token) {
  console.error('❌ BOT_TOKEN env var not set');
  process.exit(1);
}

// We need Guilds + GuildVoiceStates for VC-aware spot claiming
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates]
});

/**
 * Dynamic formations: definitions with metadata. We derive
 * position lists & notes from this.
 */
const FORMATION_DEFINITIONS = [
  {
    formation_name: "4-5-1 ATTACK",
    formation_pattern: "4-5-1",
    positions: [
      { abbreviation: "GK", role: "Goalkeeper", spatial_location: "Defense" },
      { abbreviation: "CB", role: "Defender", spatial_location: "Defense" },
      { abbreviation: "CB", role: "Defender", spatial_location: "Defense" },
      { abbreviation: "LB", role: "Fullback", spatial_location: "Defense" },
      { abbreviation: "RB", role: "Fullback", spatial_location: "Defense" },
      { abbreviation: "CM", role: "Box-to-Box", spatial_location: "Midfield" },
      { abbreviation: "CM", role: "Box-to-Box", spatial_location: "Midfield" },
      { abbreviation: "CAM", role: "Playmaker", spatial_location: "Midfield" },
      { abbreviation: "CAM", role: "Playmaker", spatial_location: "Midfield" },
      { abbreviation: "LM", role: "Winger", spatial_location: "Midfield" },
      { abbreviation: "RM", role: "Winger", spatial_location: "Midfield" },
      { abbreviation: "ST", role: "Advanced Forward", spatial_location: "Attack" }
    ],
    meta_analysis: {
      strength: "Overloads the midfield, providing exceptional passing triangles and ball retention capabilities.",
      weakness: "Relies heavily on the single ST and can lack direct penetration when the midfield is compact.",
      best_use: "Possession-based play against narrow defensive formations, forcing opponent fullbacks to commit high.",
      key_player_style: "High Passing/Vision CAMs; patient, controlled build-up play."
    }
  },
  {
    formation_name: "4-3-2-1",
    formation_pattern: "4-3-2-1",
    positions: [
      { abbreviation: "GK", role: "Goalkeeper", spatial_location: "Defense" },
      { abbreviation: "CB", role: "Defender", spatial_location: "Defense" },
      { abbreviation: "CB", role: "Defender", spatial_location: "Defense" },
      { abbreviation: "LB", role: "Fullback", spatial_location: "Defense" },
      { abbreviation: "RB", role: "Fullback", spatial_location: "Defense" },
      { abbreviation: "CM", role: "Box-to-Box", spatial_location: "Midfield" },
      { abbreviation: "CM", role: "Box-to-Box", spatial_location: "Midfield" },
      { abbreviation: "CM", role: "Box-to-Box", spatial_location: "Midfield" },
      { abbreviation: "CAM", role: "Playmaker", spatial_location: "Attack/Midfield" },
      { abbreviation: "CAM", role: "Playmaker", spatial_location: "Attack/Midfield" },
      { abbreviation: "ST", role: "Advanced Forward", spatial_location: "Attack" }
    ],
    meta_analysis: {
      strength: "Creates central attacking threats with three narrow forwards (CFs) and central midfield dominance.",
      weakness: "Vulnerable to wide attacks as the attacking players offer no natural width defensively.",
      best_use: "Counter-attacking or high-press strategy focusing play entirely through the middle.",
      key_player_style: "Quick, highly mobile attackers; central CMs must have high defensive work rates."
    }
  },
  {
    formation_name: "4-3-1-2",
    formation_pattern: "4-3-1-2",
    positions: [
      { abbreviation: "GK", role: "Goalkeeper", spatial_location: "Defense" },
      { abbreviation: "CB", role: "Defender", spatial_location: "Defense" },
      { abbreviation: "CB", role: "Defender", spatial_location: "Defense" },
      { abbreviation: "LB", role: "Fullback", spatial_location: "Defense" },
      { abbreviation: "RB", role: "Fullback", spatial_location: "Defense" },
      { abbreviation: "CM", role: "Box-to-Box", spatial_location: "Midfield" },
      { abbreviation: "CM", role: "Box-to-Box", spatial_location: "Midfield" },
      { abbreviation: "CM", role: "Box-to-Box", spatial_location: "Midfield" },
      { abbreviation: "CAM", role: "Playmaker", spatial_location: "Attack/Midfield" },
      { abbreviation: "ST", role: "Advanced Forward", spatial_location: "Attack" },
      { abbreviation: "ST", role: "Advanced Forward", spatial_location: "Attack" }
    ],
    meta_analysis: {
      strength: "Excellent for 1-2 passing and quick combination play between the three attacking players (2 ST, 1 CAM).",
      weakness: "Zero natural width in attack, making it predictable if opponents defend centrally well.",
      best_use: "Exploiting center-back spacing and leveraging quick vertical passes from the CAM.",
      key_player_style: "Technically gifted CAM with high dribbling; fullbacks must provide width on attack."
    }
  },
  {
    formation_name: "4-3-3 FLAT",
    formation_pattern: "4-3-3",
    positions: [
      { abbreviation: "GK", role: "Goalkeeper", spatial_location: "Defense" },
      { abbreviation: "CB", role: "Defender", spatial_location: "Defense" },
      { abbreviation: "CB", role: "Defender", spatial_location: "Defense" },
      { abbreviation: "LB", role: "Fullback", spatial_location: "Defense" },
      { abbreviation: "RB", role: "Fullback", spatial_location: "Defense" },
      { abbreviation: "CM", role: "Box-to-Box", spatial_location: "Midfield" },
      { abbreviation: "CM", role: "Box-to-Box", spatial_location: "Midfield" },
      { abbreviation: "CM", role: "Box-to-Box", spatial_location: "Midfield" },
      { abbreviation: "LW", role: "Winger", spatial_location: "Attack" },
      { abbreviation: "RW", role: "Winger", spatial_location: "Attack" },
      { abbreviation: "ST", role: "Advanced Forward", spatial_location: "Attack" }
    ],
    meta_analysis: {
      strength: "Perfectly balanced structure with natural width in attack and three central midfielders for stability.",
      weakness: "Central defense can be exposed if the CMs push too high without a designated defensive anchor.",
      best_use: "All-around strategy, suitable for both short passing and quick breaks down the wings.",
      key_player_style: "Rapid Wingers for stretching the defense; CMs need balanced stats to cover attack and defense."
    }
  },
  {
    formation_name: "3-5-2",
    formation_pattern: "3-5-2",
    positions: [
      { abbreviation: "GK", role: "Goalkeeper", spatial_location: "Defense" },
      { abbreviation: "CB", role: "Defender", spatial_location: "Defense" },
      { abbreviation: "CB", role: "Defender", spatial_location: "Defense" },
      { abbreviation: "CB", role: "Defender", spatial_location: "Defense" },
      { abbreviation: "CDM", role: "Holding", spatial_location: "Midfield" },
      { abbreviation: "CDM", role: "Holding", spatial_location: "Midfield" },
      { abbreviation: "CAM", role: "Playmaker", spatial_location: "Midfield" },
      { abbreviation: "LM", role: "Winger", spatial_location: "Midfield" },
      { abbreviation: "RM", role: "Winger", spatial_location: "Midfield" },
      { abbreviation: "ST", role: "Advanced Forward", spatial_location: "Attack" },
      { abbreviation: "ST", role: "Advanced Forward", spatial_location: "Attack" }
    ],
    meta_analysis: {
      strength: "Central defensive solidity with three CBs and midfield superiority due to five central players.",
      weakness: "Highly dependent on the LM/RM tracking back, as fullbacks are absent, creating large gaps out wide.",
      best_use: "Overwhelming the central opponent midfield and using LM/RM for crosses/cutbacks.",
      key_player_style: "LM/RM with high stamina and pace (work rate M/H or H/H); CAM linking the two strikers."
    }
  },
  {
    formation_name: "3-1-4-2",
    formation_pattern: "3-1-4-2",
    positions: [
      { abbreviation: "GK", role: "Goalkeeper", spatial_location: "Defense" },
      { abbreviation: "CB", role: "Defender", spatial_location: "Defense" },
      { abbreviation: "CB", role: "Defender", spatial_location: "Defense" },
      { abbreviation: "CB", role: "Defender", spatial_location: "Defense" },
      { abbreviation: "CDM", role: "Holding", spatial_location: "Defensive Midfield" },
      { abbreviation: "CM", role: "Box-to-Box", spatial_location: "Midfield" },
      { abbreviation: "CM", role: "Box-to-Box", spatial_location: "Midfield" },
      { abbreviation: "LM", role: "Winger", spatial_location: "Midfield" },
      { abbreviation: "RM", role: "Winger", spatial_location: "Midfield" },
      { abbreviation: "ST", role: "Advanced Forward", spatial_location: "Attack" },
      { abbreviation: "ST", role: "Advanced Forward", spatial_location: "Attack" }
    ],
    meta_analysis: {
      strength: "The single CDM acts as a crucial shield, while the 4-man midfield provides high attacking versatility and numbers.",
      weakness: "If the wingers (LM/RM) don't defend, the gaps between them and the CBs are huge.",
      best_use: "Attacking football where the two strikers and four midfielders constantly rotate positions.",
      key_player_style: "CDM must have high defensive work rate and tackling; STs should be good link-up players."
    }
  },
  {
    formation_name: "3-4-2-1",
    formation_pattern: "3-4-2-1",
    positions: [
      { abbreviation: "GK", role: "Goalkeeper", spatial_location: "Defense" },
      { abbreviation: "CB", role: "Defender", spatial_location: "Defense" },
      { abbreviation: "CB", role: "Defender", spatial_location: "Defense" },
      { abbreviation: "CB", role: "Defender", spatial_location: "Defense" },
      { abbreviation: "CM", role: "Box-to-Box", spatial_location: "Midfield" },
      { abbreviation: "CM", role: "Box-to-Box", spatial_location: "Midfield" },
      { abbreviation: "LM", role: "Winger", spatial_location: "Midfield" },
      { abbreviation: "RM", role: "Winger", spatial_location: "Midfield" },
      { abbreviation: "CAM", role: "Playmaker", spatial_location: "Attack/Midfield" },
      { abbreviation: "CAM", role: "Playmaker", spatial_location: "Attack/Midfield" },
      { abbreviation: "ST", role: "Advanced Forward", spatial_location: "Attack" }
    ],
    meta_analysis: {
      strength: "Compact central diamond (2 CMs, 2 CAMs) for passing, with wingers providing immediate crossing options.",
      weakness: "The CMs can be exposed to central pressure, lacking a dedicated CDM anchor.",
      best_use: "High-pressure offense, pushing the two CAMs into 'false nine' positions to support the ST.",
      key_player_style: "CAMs with good shooting ability; CMs need stamina to support the defensive line."
    }
  },
  {
    formation_name: "3-4-1-2",
    formation_pattern: "3-4-1-2",
    positions: [
      { abbreviation: "GK", role: "Goalkeeper", spatial_location: "Defense" },
      { abbreviation: "CB", role: "Defender", spatial_location: "Defense" },
      { abbreviation: "CB", role: "Defender", spatial_location: "Defense" },
      { abbreviation: "CB", role: "Defender", spatial_location: "Defense" },
      { abbreviation: "CM", role: "Box-to-Box", spatial_location: "Midfield" },
      { abbreviation: "CM", role: "Box-to-Box", spatial_location: "Midfield" },
      { abbreviation: "LM", role: "Winger", spatial_location: "Midfield" },
      { abbreviation: "RM", role: "Winger", spatial_location: "Midfield" },
      { abbreviation: "CAM", role: "Playmaker", spatial_location: "Attack/Midfield" },
      { abbreviation: "ST", role: "Advanced Forward", spatial_location: "Attack" },
      { abbreviation: "ST", role: "Advanced Forward", spatial_location: "Attack" }
    ],
    meta_analysis: {
      strength: "Central congestion and two strikers create constant overloads and short passing options in the final third.",
      weakness: "Relies entirely on the LM/RM to cover the flanks, leaving the wide CBs vulnerable on counters.",
      best_use: "Aggressive, high-tempo attack aimed at scoring quick goals and maintaining pressure.",
      key_player_style: "CAM with high agility and balance to distribute the ball quickly to the two STs."
    }
  },
  {
    formation_name: "3-4-3 FLAT",
    formation_pattern: "3-4-3",
    positions: [
      { abbreviation: "GK", role: "Goalkeeper", spatial_location: "Defense" },
      { abbreviation: "CB", role: "Defender", spatial_location: "Defense" },
      { abbreviation: "CB", role: "Defender", spatial_location: "Defense" },
      { abbreviation: "CB", role: "Defender", spatial_location: "Defense" },
      { abbreviation: "CM", role: "Box-to-Box", spatial_location: "Midfield" },
      { abbreviation: "CM", role: "Box-to-Box", spatial_location: "Midfield" },
      { abbreviation: "LM", role: "Winger", spatial_location: "Midfield" },
      { abbreviation: "RM", role: "Winger", spatial_location: "Midfield" },
      { abbreviation: "LW", role: "Winger", spatial_location: "Attack" },
      { abbreviation: "RW", role: "Winger", spatial_location: "Attack" },
      { abbreviation: "ST", role: "Advanced Forward", spatial_location: "Attack" }
    ],
    meta_analysis: {
      strength: "Maximizes attacking width with three dedicated attackers and two wide midfielders creating five forward threats.",
      weakness: "The two central midfielders are easily overrun by formations with three CMs or a dedicated CDM.",
      best_use: "Against defensive opponents where high pressure and crossing are vital to break down the defense.",
      key_player_style: "Wingers (LW/RW) with high pace and crossing ability; CBs must be fast to cover wide runs."
    }
  },
  {
    formation_name: "4-2-2-2",
    formation_pattern: "4-2-2-2",
    positions: [
      { abbreviation: "GK", role: "Goalkeeper", spatial_location: "Defense" },
      { abbreviation: "CB", role: "Defender", spatial_location: "Defense" },
      { abbreviation: "CB", role: "Defender", spatial_location: "Defense" },
      { abbreviation: "LB", role: "Fullback", spatial_location: "Defense" },
      { abbreviation: "RB", role: "Fullback", spatial_location: "Defense" },
      { abbreviation: "CDM", role: "Holding", spatial_location: "Defensive Midfield" },
      { abbreviation: "CDM", role: "Holding", spatial_location: "Defensive Midfield" },
      { abbreviation: "CAM", role: "Playmaker", spatial_location: "Attacking Midfield" },
      { abbreviation: "CAM", role: "Playmaker", spatial_location: "Attacking Midfield" },
      { abbreviation: "ST", role: "Advanced Forward", spatial_location: "Attack" },
      { abbreviation: "ST", role: "Advanced Forward", spatial_location: "Attack" }
    ],
    meta_analysis: {
      strength: "Extremely balanced and meta-friendly, using two CDMs for defense and two wide CAMs for attack and recovery.",
      weakness: "If the wide CAMs fail to track back, the fullbacks are constantly double-teamed defensively.",
      best_use: "Overall stability and versatility, facilitating both quick counter-attacks and disciplined defense.",
      key_player_style: "CDMs with high defensive awareness; wide CAMs (RM/LM roles) must be pacey."
    }
  },
  {
    formation_name: "4-5-1 FLAT",
    formation_pattern: "4-5-1",
    positions: [
      { abbreviation: "GK", role: "Goalkeeper", spatial_location: "Defense" },
      { abbreviation: "CB", role: "Defender", spatial_location: "Defense" },
      { abbreviation: "CB", role: "Defender", spatial_location: "Defense" },
      { abbreviation: "LB", role: "Fullback", spatial_location: "Defense" },
      { abbreviation: "RB", role: "Fullback", spatial_location: "Defense" },
      { abbreviation: "CM", role: "Box-to-Box", spatial_location: "Midfield" },
      { abbreviation: "CM", role: "Box-to-Box", spatial_location: "Midfield" },
      { abbreviation: "CM", role: "Box-to-Box", spatial_location: "Midfield" },
      { abbreviation: "LM", role: "Winger", spatial_location: "Midfield" },
      { abbreviation: "RM", role: "Winger", spatial_location: "Midfield" },
      { abbreviation: "ST", role: "Advanced Forward", spatial_location: "Attack" }
    ],
    meta_analysis: {
      strength: "Midfield possession machine that minimizes central space for the opponent and ensures defensive cover.",
      weakness: "Very slow to transition into attack due to the deep midfield line and reliance on a lone striker.",
      best_use: "Controlling the tempo, neutralizing high-press teams, and maintaining a high percentage of possession.",
      key_player_style: "High-dribbling/control ST; central CMs must have high passing ability."
    }
  },
  {
    formation_name: "4-1-2-1-2 WIDE",
    formation_pattern: "4-1-2-1-2",
    positions: [
      { abbreviation: "GK", role: "Goalkeeper", spatial_location: "Defense" },
      { abbreviation: "CB", role: "Defender", spatial_location: "Defense" },
      { abbreviation: "CB", role: "Defender", spatial_location: "Defense" },
      { abbreviation: "LB", role: "Fullback", spatial_location: "Defense" },
      { abbreviation: "RB", role: "Fullback", spatial_location: "Defense" },
      { abbreviation: "CDM", role: "Holding", spatial_location: "Defensive Midfield" },
      { abbreviation: "LM", role: "Winger", spatial_location: "Midfield" },
      { abbreviation: "RM", role: "Winger", spatial_location: "Midfield" },
      { abbreviation: "CAM", role: "Playmaker", spatial_location: "Attacking Midfield" },
      { abbreviation: "ST", role: "Advanced Forward", spatial_location: "Attack" },
      { abbreviation: "ST", role: "Advanced Forward", spatial_location: "Attack" }
    ],
    meta_analysis: {
      strength: "Combines central penetration with immediate wide options from the LM/RM for crosses.",
      weakness: "The two wide midfielders (LM/RM) can be easily isolated, leading to defensive confusion on the flanks.",
      best_use: "Balanced approach, quickly moving the ball wide after winning it in the central midfield zone.",
      key_player_style: "CDM is the defensive linchpin; LM/RM must have high pace and good passing range."
    }
  },
  {
    formation_name: "4-1-2-1-2 NARROW",
    formation_pattern: "4-1-2-1-2",
    positions: [
      { abbreviation: "GK", role: "Goalkeeper", spatial_location: "Defense" },
      { abbreviation: "CB", role: "Defender", spatial_location: "Defense" },
      { abbreviation: "CB", role: "Defender", spatial_location: "Defense" },
      { abbreviation: "LB", role: "Fullback", spatial_location: "Defense" },
      { abbreviation: "RB", role: "Fullback", spatial_location: "Defense" },
      { abbreviation: "CDM", role: "Holding", spatial_location: "Defensive Midfield" },
      { abbreviation: "CM", role: "Box-to-Box", spatial_location: "Midfield" },
      { abbreviation: "CM", role: "Box-to-Box", spatial_location: "Midfield" },
      { abbreviation: "CAM", role: "Playmaker", spatial_location: "Attacking Midfield" },
      { abbreviation: "ST", role: "Advanced Forward", spatial_location: "Attack" },
      { abbreviation: "ST", role: "Advanced Forward", spatial_location: "Attack" }
    ],
    meta_analysis: {
      strength: "Highly meta-relevant due to central defensive compactness and rapid combination play between the CMs, CAM, and STs.",
      weakness: "Provides zero attacking width, relying solely on fullbacks for crossing and stretching the opponent.",
      best_use: "Quick, vertical, central tiki-taka passing and through-balls to the two strikers.",
      key_player_style: "Fullbacks with pace and high offensive work rates; all central players need high agility."
    }
  },
  {
    formation_name: "4-4-2 FLAT",
    formation_pattern: "4-4-2",
    positions: [
      { abbreviation: "GK", role: "Goalkeeper", spatial_location: "Defense" },
      { abbreviation: "CB", role: "Defender", spatial_location: "Defense" },
      { abbreviation: "CB", role: "Defender", spatial_location: "Defense" },
      { abbreviation: "LB", role: "Fullback", spatial_location: "Defense" },
      { abbreviation: "RB", role: "Fullback", spatial_location: "Defense" },
      { abbreviation: "CM", role: "Box-to-Box", spatial_location: "Midfield" },
      { abbreviation: "CM", role: "Box-to-Box", spatial_location: "Midfield" },
      { abbreviation: "LM", role: "Winger", spatial_location: "Midfield" },
      { abbreviation: "RM", role: "Winger", spatial_location: "Midfield" },
      { abbreviation: "ST", role: "Advanced Forward", spatial_location: "Attack" },
      { abbreviation: "ST", role: "Advanced Forward", spatial_location: "Attack" }
    ],
    meta_analysis: {
      strength: "Simple, defensively sound structure where lines are rarely broken, providing clear defensive assignments.",
      weakness: "The gap between the midfield and two strikers can be large, isolating the attack.",
      best_use: "Holding a lead or playing defensively compact, forcing the opponent wide to cross.",
      key_player_style: "Balanced CMs for cover; one ST for link-up, the other for runs in behind."
    }
  },
  {
    formation_name: "4-3-3 HOLDING",
    formation_pattern: "4-3-3",
    positions: [
      { abbreviation: "GK", role: "Goalkeeper", spatial_location: "Defense" },
      { abbreviation: "CB", role: "Defender", spatial_location: "Defense" },
      { abbreviation: "CB", role: "Defender", spatial_location: "Defense" },
      { abbreviation: "LB", role: "Fullback", spatial_location: "Defense" },
      { abbreviation: "RB", role: "Fullback", spatial_location: "Defense" },
      { abbreviation: "CDM", role: "Holding", spatial_location: "Defensive Midfield" },
      { abbreviation: "CM", role: "Box-to-Box", spatial_location: "Midfield" },
      { abbreviation: "CM", role: "Box-to-Box", spatial_location: "Midfield" },
      { abbreviation: "LW", role: "Winger", spatial_location: "Attack" },
      { abbreviation: "RW", role: "Winger", spatial_location: "Attack" },
      { abbreviation: "ST", role: "Advanced Forward", spatial_location: "Attack" }
    ],
    meta_analysis: {
      strength: "The CDM offers superb protection for the back four, making it difficult to pass through the center.",
      weakness: "The two CMs are primarily box-to-box, potentially leaving the CDM isolated if they push too high.",
      best_use: "Defensively sound play with quick release to the wingers for fast counter-attacks.",
      key_player_style: "High Defensive Awareness CDM; high pace LW/RW."
    }
  },
  {
    formation_name: "4-4-1-1 MIDFIELD",
    formation_pattern: "4-4-1-1",
    positions: [
      { abbreviation: "GK", role: "Goalkeeper", spatial_location: "Defense" },
      { abbreviation: "CB", role: "Defender", spatial_location: "Defense" },
      { abbreviation: "CB", role: "Defender", spatial_location: "Defense" },
      { abbreviation: "LB", role: "Fullback", spatial_location: "Defense" },
      { abbreviation: "RB", role: "Fullback", spatial_location: "Defense" },
      { abbreviation: "CM", role: "Box-to-Box", spatial_location: "Midfield" },
      { abbreviation: "CM", role: "Box-to-Box", spatial_location: "Midfield" },
      { abbreviation: "LM", role: "Winger", spatial_location: "Midfield" },
      { abbreviation: "RM", role: "Winger", spatial_location: "Midfield" },
      { abbreviation: "CAM", role: "Playmaker", spatial_location: "Attacking Midfield" },
      { abbreviation: "ST", role: "Advanced Forward", spatial_location: "Attack" }
    ],
    meta_analysis: {
      strength: "The CAM links the deep midfield four to the single striker perfectly, facilitating smooth transitions.",
      weakness: "The single ST can be easily neutralized, making goal scoring dependent on the CAM's shooting or the wingers' crosses.",
      best_use: "Balanced control; effective at overloading the flanks and using the CAM to play through balls.",
      key_player_style: "Technically creative CAM; ST with high positioning and finishing."
    }
  },
  {
    formation_name: "4-2-4",
    formation_pattern: "4-2-4",
    positions: [
      { abbreviation: "GK", role: "Goalkeeper", spatial_location: "Defense" },
      { abbreviation: "CB", role: "Defender", spatial_location: "Defense" },
      { abbreviation: "CB", role: "Defender", spatial_location: "Defense" },
      { abbreviation: "LB", role: "Fullback", spatial_location: "Defense" },
      { abbreviation: "RB", role: "Fullback", spatial_location: "Defense" },
      { abbreviation: "CM", role: "Box-to-Box", spatial_location: "Midfield" },
      { abbreviation: "CM", role: "Box-to-Box", spatial_location: "Midfield" },
      { abbreviation: "LW", role: "Winger", spatial_location: "Attack/Midfield" },
      { abbreviation: "RW", role: "Winger", spatial_location: "Attack/Midfield" },
      { abbreviation: "ST", role: "Advanced Forward", spatial_location: "Attack" },
      { abbreviation: "ST", role: "Advanced Forward", spatial_location: "Attack" }
    ],
    meta_analysis: {
      strength: "Ultimate attacking formation, creating massive overloads with four forward players and immediate pressure on the opponent's defense.",
      weakness: "Only two central midfielders, leaving the back four extremely exposed to quick central counter-attacks.",
      best_use: "When chasing a deficit or playing against a very passive defense to maintain constant pressure.",
      key_player_style: "High-stamina CMs to cover space; all four attackers must be pacey finishers."
    }
  },
  {
    formation_name: "4-4-2 HOLDING",
    formation_pattern: "4-4-2",
    positions: [
      { abbreviation: "GK", role: "Goalkeeper", spatial_location: "Defense" },
      { abbreviation: "CB", role: "Defender", spatial_location: "Defense" },
      { abbreviation: "CB", role: "Defender", spatial_location: "Defense" },
      { abbreviation: "LB", role: "Fullback", spatial_location: "Defense" },
      { abbreviation: "RB", role: "Fullback", spatial_location: "Defense" },
      { abbreviation: "CDM", role: "Holding", spatial_location: "Defensive Midfield" },
      { abbreviation: "CDM", role: "Holding", spatial_location: "Defensive Midfield" },
      { abbreviation: "LM", role: "Winger", spatial_location: "Midfield" },
      { abbreviation: "RM", role: "Winger", spatial_location: "Midfield" },
      { abbreviation: "ST", role: "Advanced Forward", spatial_location: "Attack" },
      { abbreviation: "ST", role: "Advanced Forward", spatial_location: "Attack" }
    ],
    meta_analysis: {
      strength: "Incredible central defensive solidity and pressing capability with two CDMs and a tight defensive line.",
      weakness: "Lack of creative midfield roles (no CAM), relying only on wingers and strikers for offense.",
      best_use: "Countering narrow formations (like 4-1-2-1-2 Narrow) and suffocating central passing lanes.",
      key_player_style: "CDMs with high physical stats and tackling; pacey STs for quick breaks."
    }
  },
  {
    formation_name: "4-3-3 DEFEND",
    formation_pattern: "4-3-3",
    positions: [
      { abbreviation: "GK", role: "Goalkeeper", spatial_location: "Defense" },
      { abbreviation: "CB", role: "Defender", spatial_location: "Defense" },
      { abbreviation: "CB", role: "Defender", spatial_location: "Defense" },
      { abbreviation: "LB", role: "Fullback", spatial_location: "Defense" },
      { abbreviation: "RB", role: "Fullback", spatial_location: "Defense" },
      { abbreviation: "CDM", role: "Holding", spatial_location: "Defensive Midfield" },
      { abbreviation: "CDM", role: "Holding", spatial_location: "Defensive Midfield" },
      { abbreviation: "CM", role: "Box-to-Box", spatial_location: "Midfield" },
      { abbreviation: "LW", role: "Winger", spatial_location: "Attack" },
      { abbreviation: "RW", role: "Winger", spatial_location: "Attack" },
      { abbreviation: "ST", role: "Advanced Forward", spatial_location: "Attack" }
    ],
    meta_analysis: {
      strength: "Features two CDMs for an unbreakable defensive spine, making it highly secure against central threats.",
      weakness: "The two CDMs can struggle to provide sufficient support for the single CM in link-up play.",
      best_use: "Maintaining a lead or playing defensively against skilled central attackers.",
      key_player_style: "CM needs excellent passing to bypass the CDMs and reach the front three; CDMs must have high defensive work rates."
    }
  },
  {
    formation_name: "4-2-1-3",
    formation_pattern: "4-2-1-3",
    positions: [
      { abbreviation: "GK", role: "Goalkeeper", spatial_location: "Defense" },
      { abbreviation: "CB", role: "Defender", spatial_location: "Defense" },
      { abbreviation: "CB", role: "Defender", spatial_location: "Defense" },
      { abbreviation: "LB", role: "Fullback", spatial_location: "Defense" },
      { abbreviation: "RB", role: "Fullback", spatial_location: "Defense" },
      { abbreviation: "CDM", role: "Holding", spatial_location: "Defensive Midfield" },
      { abbreviation: "CDM", role: "Holding", spatial_location: "Defensive Midfield" },
      { abbreviation: "CAM", role: "Playmaker", spatial_location: "Attacking Midfield" },
      { abbreviation: "LW", role: "Winger", spatial_location: "Attack" },
      { abbreviation: "RW", role: "Winger", spatial_location: "Attack" },
      { abbreviation: "ST", role: "Advanced Forward", spatial_location: "Attack" }
    ],
    meta_analysis: {
      strength: "Optimal structure for defense (2 CDMs) and attack (1 CAM, 3 Forwards), creating a clear separation of duties.",
      weakness: "The midfield area between the CAM and CDMs can become isolated if they don't manually cover the space.",
      best_use: "High-powered offense delivered through the flanks, supported by the CAM for central incision.",
      key_player_style: "The CAM must be the primary creator; Wingers and ST need pace and clinical finishing."
    }
  },
  {
    formation_name: "5-4-1 FLAT",
    formation_pattern: "5-4-1",
    positions: [
      { abbreviation: "GK", role: "Goalkeeper", spatial_location: "Defense" },
      { abbreviation: "CB", role: "Defender", spatial_location: "Defense" },
      { abbreviation: "CB", role: "Defender", spatial_location: "Defense" },
      { abbreviation: "CB", role: "Defender", spatial_location: "Defense" },
      { abbreviation: "LB", role: "Fullback", spatial_location: "Defense" },
      { abbreviation: "RB", role: "Fullback", spatial_location: "Defense" },
      { abbreviation: "CM", role: "Box-to-Box", spatial_location: "Midfield" },
      { abbreviation: "CM", role: "Box-to-Box", spatial_location: "Midfield" },
      { abbreviation: "LM", role: "Winger", spatial_location: "Midfield" },
      { abbreviation: "RM", role: "Winger", spatial_location: "Midfield" },
      { abbreviation: "ST", role: "Advanced Forward", spatial_location: "Attack" }
    ],
    meta_analysis: {
      strength: "The most defensively secure formation with a five-man back line and five midfielders/wingers providing cover.",
      weakness: "Extremely passive in attack, relying on slow build-up or long balls to the single, isolated striker.",
      best_use: "Protecting a late lead, time-wasting, or against opponents with two highly threatening strikers.",
      key_player_style: "CBs must have good passing stats to transition; ST needs strength and jumping for hold-up play."
    }
  },
  {
    formation_name: "5-2-1-2",
    formation_pattern: "5-2-1-2",
    positions: [
      { abbreviation: "GK", role: "Goalkeeper", spatial_location: "Defense" },
      { abbreviation: "CB", role: "Defender", spatial_location: "Defense" },
      { abbreviation: "CB", role: "Defender", spatial_location: "Defense" },
      { abbreviation: "CB", role: "Defender", spatial_location: "Defense" },
      { abbreviation: "LB", role: "Fullback", spatial_location: "Defense" },
      { abbreviation: "RB", role: "Fullback", spatial_location: "Defense" },
      { abbreviation: "CM", role: "Box-to-Box", spatial_location: "Midfield" },
      { abbreviation: "CM", role: "Box-to-Box", spatial_location: "Midfield" },
      { abbreviation: "CAM", role: "Playmaker", spatial_location: "Attacking Midfield" },
      { abbreviation: "ST", role: "Advanced Forward", spatial_location: "Attack" },
      { abbreviation: "ST", role: "Advanced Forward", spatial_location: "Attack" }
    ],
    meta_analysis: {
      strength: "Provides defensive structure (5-back) while offering central attacking prowess through the CAM and two STs.",
      weakness: "Limited central midfield options, making it vulnerable to opponent passing through the middle third.",
      best_use: "Counter-attacking, using the fullbacks/wingbacks (LB/RB) to fly up the flanks and cross to the two strikers.",
      key_player_style: "High-stamina Fullbacks for covering the entire flank; CAM must have good vision."
    }
  },
  {
    formation_name: "4-1-3-2",
    formation_pattern: "4-1-3-2",
    positions: [
      { abbreviation: "GK", role: "Goalkeeper", spatial_location: "Defense" },
      { abbreviation: "CB", role: "Defender", spatial_location: "Defense" },
      { abbreviation: "CB", role: "Defender", spatial_location: "Defense" },
      { abbreviation: "LB", role: "Fullback", spatial_location: "Defense" },
      { abbreviation: "RB", role: "Fullback", spatial_location: "Defense" },
      { abbreviation: "CDM", role: "Holding", spatial_location: "Defensive Midfield" },
      { abbreviation: "CM", role: "Box-to-Box", spatial_location: "Midfield" },
      { abbreviation: "LM", role: "Winger", spatial_location: "Midfield" },
      { abbreviation: "RM", role: "Winger", spatial_location: "Midfield" },
      { abbreviation: "ST", role: "Advanced Forward", spatial_location: "Attack" },
      { abbreviation: "ST", role: "Advanced Forward", spatial_location: "Attack" }
    ],
    meta_analysis: {
      strength: "The three-man midfield line (LM, CM, RM) can overwhelm the opponent's center, while the CDM protects the defense.",
      weakness: "The single CM is left to cover a massive amount of central space alone.",
      best_use: "Dominating the wide midfield areas and quickly feeding the ball to the two strikers.",
      key_player_style: "CDM needs high defensive work rate; LM/RM should have excellent crossing and cutback skills."
    }
  },
  {
    formation_name: "4-3-3 ATTACK",
    formation_pattern: "4-3-3",
    positions: [
      { abbreviation: "GK", role: "Goalkeeper", spatial_location: "Defense" },
      { abbreviation: "CB", role: "Defender", spatial_location: "Defense" },
      { abbreviation: "CB", role: "Defender", spatial_location: "Defense" },
      { abbreviation: "LB", role: "Wingback", spatial_location: "Defense" },
      { abbreviation: "RB", role: "Wingback", spatial_location: "Defense" },
      { abbreviation: "CM", role: "Playmaker Build-Up", spatial_location: "Midfield" },
      { abbreviation: "CM", role: "Playmaker Defend", spatial_location: "Midfield" },
      { abbreviation: "CAM", role: "Playmaker Roaming", spatial_location: "Midfield" },
      { abbreviation: "LW", role: "Winger Attack", spatial_location: "Attack" },
      { abbreviation: "RW", role: "Winger Versatile", spatial_location: "Attack" },
      { abbreviation: "ST", role: "Get Forward Attack", spatial_location: "Attack" }
    ],
    meta_analysis: {
      strength: "The dedicated attacking roles and high positioning of the central three create constant vertical threat.",
      weakness: "Only two CBs at the back with attacking fullbacks, leaving big spaces in the defensive wide areas.",
      best_use: "High-risk, high-reward attacking football, best suited for skilled players who can utilize custom tactics and player runs.",
      key_player_style: "CAM must be the team's primary Playmaker; all forward players need high finishing and pace."
    }
  },
  {
    formation_name: "4-2-3-1 WIDE",
    formation_pattern: "4-2-3-1",
    positions: [
      { abbreviation: "GK", role: "Goalkeeper", spatial_location: "Defense" },
      { abbreviation: "CB", role: "Defender", spatial_location: "Defense" },
      { abbreviation: "CB", role: "Defender", spatial_location: "Defense" },
      { abbreviation: "LB", role: "Fullback", spatial_location: "Defense" },
      { abbreviation: "RB", role: "Fullback", spatial_location: "Defense" },
      { abbreviation: "CDM", role: "Holding", spatial_location: "Defensive Midfield" },
      { abbreviation: "CDM", role: "Holding", spatial_location: "Defensive Midfield" },
      { abbreviation: "LM", role: "Winger", spatial_location: "Midfield" },
      { abbreviation: "RM", role: "Winger", spatial_location: "Midfield" },
      { abbreviation: "CAM", role: "Playmaker", spatial_location: "Attacking Midfield" },
      { abbreviation: "ST", role: "Advanced Forward", spatial_location: "Attack" }
    ],
    meta_analysis: {
      strength: "Excellent meta balance, using two CDMs for security, a CAM for creativity, and wide midfielders for flanking attacks.",
      weakness: "The front four (LM, CAM, RM, ST) can be isolated if the CDMs are slow to release the ball forward.",
      best_use: "Controlling the game, dictating tempo, and launching attacks down the wings.",
      key_player_style: "CDMs should be defensive masters; CAM needs high passing and long-shot capability."
    }
  },
  {
    formation_name: "4-2-3-1 NARROW",
    formation_pattern: "4-2-3-1",
    positions: [
      { abbreviation: "GK", role: "Goalkeeper", spatial_location: "Defense" },
      { abbreviation: "CB", role: "Defender", spatial_location: "Defense" },
      { abbreviation: "CB", role: "Defender", spatial_location: "Defense" },
      { abbreviation: "LB", role: "Fullback", spatial_location: "Defense" },
      { abbreviation: "RB", role: "Fullback", spatial_location: "Defense" },
      { abbreviation: "CDM", role: "Holding", spatial_location: "Defensive Midfield" },
      { abbreviation: "CDM", role: "Holding", spatial_location: "Defensive Midfield" },
      { abbreviation: "CAM", role: "Playmaker", spatial_location: "Attacking Midfield" },
      { abbreviation: "CAM", role: "Playmaker", spatial_location: "Attacking Midfield" },
      { abbreviation: "CAM", role: "Playmaker", spatial_location: "Attacking Midfield" },
      { abbreviation: "ST", role: "Advanced Forward", spatial_location: "Attack" }
    ],
    meta_analysis: {
      strength: "Massive central passing options with four attacking players close to the ST, allowing for intricate combination play.",
      weakness: "Complete lack of width, making it easy for the opponent to defend by shifting their defense laterally.",
      best_use: "Attacking possession strategy, constantly passing short and using through balls to the lone striker.",
      key_player_style: "Fullbacks must be set to overlap; central CAMs need high dribbling and movement."
    }
  },
  {
    formation_name: "5-3-2 HOLDING",
    formation_pattern: "5-3-2",
    positions: [
      { abbreviation: "GK", role: "Goalkeeper", spatial_location: "Defense" },
      { abbreviation: "CB", role: "Defender", spatial_location: "Defense" },
      { abbreviation: "CB", role: "Defender", spatial_location: "Defense" },
      { abbreviation: "CB", role: "Defender", spatial_location: "Defense" },
      { abbreviation: "LB", role: "Fullback", spatial_location: "Defense" },
      { abbreviation: "RB", role: "Fullback", spatial_location: "Defense" },
      { abbreviation: "CDM", role: "Holding", spatial_location: "Defensive Midfield" },
      { abbreviation: "CM", role: "Box-to-Box", spatial_location: "Midfield" },
      { abbreviation: "CM", role: "Box-to-Box", spatial_location: "Midfield" },
      { abbreviation: "ST", role: "Advanced Forward", spatial_location: "Attack" },
      { abbreviation: "ST", role: "Advanced Forward", spatial_location: "Attack" }
    ],
    meta_analysis: {
      strength: "Maximum defensive security (5-back + 1 CDM) ensures the entire central pitch is covered defensively.",
      weakness: "The two CMs are heavily burdened with both attacking and defensive duties on the flanks.",
      best_use: "Counter-attacking with pacey strikers and disciplined defense against top-tier opponents.",
      key_player_style: "High passing/vision CDM to launch quick counter-attacks; STs with pace."
    }
  },
  {
    formation_name: "4-1-4-1",
    formation_pattern: "4-1-4-1",
    positions: [
      { abbreviation: "GK", role: "Goalkeeper", spatial_location: "Defense" },
      { abbreviation: "CB", role: "Defender", spatial_location: "Defense" },
      { abbreviation: "CB", role: "Defender", spatial_location: "Defense" },
      { abbreviation: "LB", role: "Fullback", spatial_location: "Defense" },
      { abbreviation: "RB", role: "Fullback", spatial_location: "Defense" },
      { abbreviation: "CDM", role: "Holding", spatial_location: "Defensive Midfield" },
      { abbreviation: "CM", role: "Box-to-Box", spatial_location: "Midfield" },
      { abbreviation: "CM", role: "Box-to-Box", spatial_location: "Midfield" },
      { abbreviation: "LM", role: "Winger", spatial_location: "Midfield" },
      { abbreviation: "RM", role: "Winger", spatial_location: "Midfield" },
      { abbreviation: "ST", role: "Advanced Forward", spatial_location: "Attack" }
    ],
    meta_analysis: {
      strength: "Solid defensive block with a dedicated CDM and four midfielders creating two lines of four in defense.",
      weakness: "The single striker lacks immediate support from the midfield, leading to slow offensive pressure.",
      best_use: "Maintaining defensive shape and patiently building possession through the central midfield.",
      key_player_style: "CDM with high defensive work rate; Wingers (LM/RM) need high stamina for defense and attack."
    }
  },
  {
    formation_name: "5-2-3",
    formation_pattern: "5-2-3",
    positions: [
      { abbreviation: "GK", role: "Goalkeeper", spatial_location: "Defense" },
      { abbreviation: "CB", role: "Defender", spatial_location: "Defense" },
      { abbreviation: "CB", role: "Defender", spatial_location: "Defense" },
      { abbreviation: "CB", role: "Defender", spatial_location: "Defense" },
      { abbreviation: "LB", role: "Fullback", spatial_location: "Defense" },
      { abbreviation: "RB", role: "Fullback", spatial_location: "Defense" },
      { abbreviation: "CM", role: "Box-to-Box", spatial_location: "Midfield" },
      { abbreviation: "CM", role: "Box-to-Box", spatial_location: "Midfield" },
      { abbreviation: "LW", role: "Winger", spatial_location: "Attack" },
      { abbreviation: "RW", role: "Winger", spatial_location: "Attack" },
      { abbreviation: "ST", role: "Advanced Forward", spatial_location: "Attack" }
    ],
    meta_analysis: {
      strength: "The three-man attack ensures high pressure on the opponent's back line, supported by a solid five-man defense.",
      weakness: "Only two CMs means the midfield can be easily bypassed or overrun by three-man central midfield systems.",
      best_use: "Wing-play focused attacks, using the fullbacks and wingers to deliver balls to the striker.",
      key_player_style: "Fullbacks/Wingbacks (LB/RB) with pace and good crossing; CMs need high defensive work rates."
    }
  }
];

// Derived: name -> position abbreviations
const FORMATION_POSITIONS = {};
// Derived: name -> formatted meta info string
const FORMATION_INFO = {};

for (const def of FORMATION_DEFINITIONS) {
  const name = def.formation_name;
  FORMATION_POSITIONS[name] = def.positions.map((p) => p.abbreviation);

  const meta = def.meta_analysis || {};
  const parts = [
    meta.strength ? `Strengths: ${meta.strength}` : '',
    meta.weakness ? `Weaknesses: ${meta.weakness}` : '',
    meta.best_use ? `Best used: ${meta.best_use}` : '',
    meta.key_player_style ? `Key players: ${meta.key_player_style}` : ''
  ].filter(Boolean);

  FORMATION_INFO[name] = parts.join('\n');
}

// Default formation must exist in FORMATION_POSITIONS
const DEFAULT_FORMATION = "4-3-3 FLAT";

// Default club slots per guild; names are editable from the panel
// Max clubs = 5
const DEFAULT_CLUBS = [
  { key: 'club1', name: 'Club 1', enabled: true },
  { key: 'club2', name: 'Club 2', enabled: false },
  { key: 'club3', name: 'Club 3', enabled: false },
  { key: 'club4', name: 'Club 4', enabled: false },
  { key: 'club5', name: 'Club 5', enabled: false }
];

// Position preference options for /pospanel
const POSITION_PREF_OPTIONS = [
  'ST', 'RW', 'LW', 'CAM', 'CM', 'RDM', 'LDM', 'LB', 'LCB', 'RCB', 'RB', 'GK'
];

// Slash commands (reused for every guild)
const COMMANDS = [
  {
    name: 'spotpanel',
    description: 'Create the global control panel for club spots.'
  },
  {
    name: 'spots',
    description: 'Show a read-only board with club dropdown.'
  },
  {
    name: 'vcspots',
    description:
      'Create/update a live club spot panel linked to your current voice channel.'
  },
  {
    name: 'spothelp',
    description: 'DMs you the SpotBot manual & quick commands.'
  },
  {
    name: 'pospanel',
    description: 'Set your position preferences (ranked order).'
  },
  {
    name: 'posboard',
    description: 'Show position preferences for players in your voice channel.'
  },
  {
    name: 'whoisplaying',
    description: 'Show who is currently slotted in your voice channel club (if linked).'
  }
];

// ---------- GLOBAL STORES ----------

// positionPrefs: userId -> { prefs: [ 'ST', 'CAM', ... ], updatedAt: Date }
const positionPrefs = new Map();

function getUserPrefs(userId) {
  return positionPrefs.get(userId)?.prefs ?? [];
}

function setUserPrefs(userId, prefs) {
  positionPrefs.set(userId, { prefs, updatedAt: new Date() });
}

// guildQueues: guildId -> { [clubKey]: { [slotIndex]: [userId, ...] } }
const guildQueues = new Map();

function ensureQueueState(guildId, clubKey, slotIndex) {
  if (!guildQueues.has(guildId)) guildQueues.set(guildId, {});
  const g = guildQueues.get(guildId);
  if (!g[clubKey]) g[clubKey] = {};
  if (!g[clubKey][slotIndex]) g[clubKey][slotIndex] = [];
  return g[clubKey][slotIndex];
}

// blockedUsers: guildId -> Set<userId>
// Users blocked from moving/assigning other players
const blockedUsers = new Map();

function isUserBlocked(guildId, userId) {
  const blocked = blockedUsers.get(guildId);
  return blocked ? blocked.has(userId) : false;
}

function blockUser(guildId, userId) {
  if (!blockedUsers.has(guildId)) blockedUsers.set(guildId, new Set());
  blockedUsers.get(guildId).add(userId);
}

function unblockUser(guildId, userId) {
  const blocked = blockedUsers.get(guildId);
  if (blocked) blocked.delete(userId);
}

function getBlockedUsers(guildId) {
  const blocked = blockedUsers.get(guildId);
  return blocked ? [...blocked] : [];
}

// ---------- HELPERS ----------

// Make formation notes multi-line and slightly formatted
function formatFormationInfo(info) {
  if (!info) return '';

  let txt = info.trim();
  txt = txt.replace(/Strengths:/, '**Strengths:**');
  txt = txt.replace(/Weaknesses:/, '\n**Weaknesses:**');
  txt = txt.replace(/Best used/g, '\n**Best used**');
  txt = txt.replace(/Key players:/, '\n**Key players:**');
  return txt;
}

// Group positions into broad roles so we can remap logically on formation change
function getPositionGroup(label) {
  const upper = (label || '').toUpperCase();

  if (upper === 'GK') return 'GK';
  if (upper === 'CB') return 'CB';
  if (['LB', 'RB', 'LWB', 'RWB'].includes(upper)) return 'FB';
  if (upper === 'CDM') return 'CDM';
  if (upper === 'CM') return 'CM';
  if (['CAM', 'CF'].includes(upper)) return 'CAM';
  if (['LM', 'RM'].includes(upper)) return 'WM';
  if (['LW', 'RW'].includes(upper)) return 'WING';
  if (upper === 'ST') return 'ST';

  return 'OTHER';
}

// Map preference positions to formation slot groups
function getPreferenceGroup(pos) {
  const upper = (pos || '').toUpperCase();
  if (upper === 'GK') return 'GK';
  if (['LCB', 'RCB', 'CB'].includes(upper)) return 'CB';
  if (['LB', 'RB'].includes(upper)) return 'FB';
  if (['CDM', 'RDM', 'LDM'].includes(upper)) return 'CDM';
  if (upper === 'CM') return 'CM';
  if (upper === 'CAM') return 'CAM';
  if (['LM', 'RM', 'LW', 'RW'].includes(upper)) return 'WING';
  if (upper === 'ST') return 'ST';
  return 'OTHER';
}

// ---------- PER-GUILD STATE HELPERS ----------

function cloneDefaultClubs() {
  return DEFAULT_CLUBS.map((c) => ({ ...c }));
}

function createEmptyBoardForFormation(formationName) {
  const positions =
    FORMATION_POSITIONS[formationName] ||
    FORMATION_POSITIONS[DEFAULT_FORMATION];

  return {
    formation: formationName,
    slots: positions.map((label) => ({
      label,
      open: true,
      takenBy: null
    }))
  };
}

function createEmptyBoardState(clubs) {
  const state = {};
  clubs.forEach((club) => {
    state[club.key] = createEmptyBoardForFormation(DEFAULT_FORMATION);
  });
  return state;
}

// guildId -> {
//   clubs,
//   boardState,
//   currentClubKey,
//   adminPanelChannelId,
//   adminPanelMessageId,
//   vcPanels: { [voiceChannelId]: { clubKey, textChannelId, messageId } },
//   clubVcLinks: { [clubKey]: voiceChannelId | null }
// }
const guildStates = new Map();

function getGuildState(guildId) {
  if (!guildId) return null;

  let state = guildStates.get(guildId);
  if (!state) {
    const clubs = cloneDefaultClubs();
    const boardState = createEmptyBoardState(clubs);
    const clubVcLinks = {};
    clubs.forEach((club) => {
      clubVcLinks[club.key] = null;
    });

    state = {
      clubs,
      boardState,
      currentClubKey: 'club1',
      adminPanelChannelId: null,
      adminPanelMessageId: null,
      vcPanels: {},
      clubVcLinks
    };
    guildStates.set(guildId, state);
  } else {
    // Ensure clubVcLinks exists and has keys for all clubs (future-proof)
    if (!state.clubVcLinks) {
      state.clubVcLinks = {};
    }
    state.clubs.forEach((club) => {
      if (!(club.key in state.clubVcLinks)) {
        state.clubVcLinks[club.key] = null;
      }
    });
  }
  return state;
}

function getClubByKey(clubs, key) {
  return clubs.find((c) => c.key === key);
}

// dragState: guildId -> { [userId]: { clubKey, fromIndex } }
const dragState = new Map();

function getDrag(guildId, userId) {
  const guildDrag = dragState.get(guildId);
  if (!guildDrag) return null;
  return guildDrag[userId] || null;
}

function setDrag(guildId, userId, drag) {
  if (!drag) {
    const guildDrag = dragState.get(guildId);
    if (!guildDrag) return;
    delete guildDrag[userId];
    if (Object.keys(guildDrag).length === 0) {
      dragState.delete(guildId);
    }
    return;
  }

  let guildDrag = dragState.get(guildId);
  if (!guildDrag) {
    guildDrag = {};
    dragState.set(guildId, guildDrag);
  }
  guildDrag[userId] = drag;
}

// Admins or roles with "captain", "manager", "owner", or "media" in the name
// These are allowed to assign/move/remove players, reset spots, set VC, etc.
function isManager(member) {
  if (!member) return false;

  try {
    const perms = member.permissions;
    if (perms) {
      // Normal GuildMemberPermissions object
      if (typeof perms.has === 'function') {
        if (perms.has(PermissionsBitField.Flags.ManageGuild)) return true;
      } else if (typeof perms === 'string') {
        // Raw bitfield from API member
        const bitfield = new PermissionsBitField(BigInt(perms));
        if (bitfield.has(PermissionsBitField.Flags.ManageGuild)) return true;
      }
    }
  } catch (err) {
    console.warn('⚠️ isManager permissions check failed:', err);
  }

  if (!member.roles || !member.roles.cache) return false;

  const managerKeywords = ['captain', 'manager', 'owner', 'media'];
  return member.roles.cache.some((role) => {
    const name = role.name.toLowerCase();
    return managerKeywords.some((kw) => name.includes(kw));
  });
}

// Find if a message belongs to a VC-linked panel
function getVcPanelByMessage(state, messageId) {
  if (!state.vcPanels) return null;
  for (const [vcId, panel] of Object.entries(state.vcPanels)) {
    if (panel && panel.messageId === messageId) {
      return { vcId, panel };
    }
  }
  return null;
}

// ---------- UI BUILDERS (per guild) ----------

function buildEmbedForClub(guildId, clubKey) {
  const state = getGuildState(guildId);
  if (!state) throw new Error('No state for guild');

  const { clubs, boardState, clubVcLinks } = state;
  const club = getClubByKey(clubs, clubKey);
  const clubBoard = boardState[clubKey];

  if (!club || !clubBoard) {
    return new EmbedBuilder()
      .setTitle('Unknown Club')
      .setDescription('This club no longer exists or is disabled.')
      .setColor(0xff0000);
  }

  const formationName = clubBoard.formation || DEFAULT_FORMATION;
  const formationInfo = FORMATION_INFO[formationName] || '';

  const linkedVcId = clubVcLinks?.[clubKey] || null;
  let linkedVcText = '';
  if (linkedVcId) {
    linkedVcText = `\n🔗 Linked VC: <#${linkedVcId}>`;
  }

  const lines = [];
  const clubQueuesData = guildQueues.get(guildId) || {};
  const queuesForClub = clubQueuesData[clubKey] || {};

  for (let i = clubBoard.slots.length - 1; i >= 0; i--) {
    const slot = clubBoard.slots[i];
    const emoji = slot.open ? '🟢' : '🔴';

    const queueLen = (queuesForClub[i] || []).length;
    const queueInfo = queueLen > 0 ? ` (queue: ${queueLen} waiting)` : '';

    let text;
    if (slot.open) {
      text = 'OPEN' + queueInfo;
    } else if (slot.takenBy) {
      if (slot.takenBy === '__NOT_IN_VC__') {
        text = 'TAKEN by player not in VC' + queueInfo;
      } else {
        text = `TAKEN by <@${slot.takenBy}>` + queueInfo;
      }
    } else {
      text = 'TAKEN' + queueInfo;
    }

    lines.push(`**${slot.label}** – ${emoji} ${text}`);
  }

  // Footer with counts
  let filled = 0;
  let placeholders = 0;
  for (const slot of clubBoard.slots) {
    if (!slot.open) {
      filled++;
      if (slot.takenBy === '__NOT_IN_VC__') placeholders++;
    }
  }
  const total = clubBoard.slots.length;

  const embed = new EmbedBuilder()
    .setTitle(`${club.name} – ${formationName}`)
    .setDescription(
      lines.join('\n') +
        linkedVcText +
        (formationInfo
          ? `\n\n${formatFormationInfo(formationInfo)}`
          : '')
    )
    .setColor(0x00ff00)
    .setFooter({
      text: `${filled}/${total} spots filled • ${placeholders} placeholder(s)`
    });

  return embed;
}

function buildButtons(guildId, clubKey) {
  const state = getGuildState(guildId);
  const { boardState } = state;
  const clubBoard = boardState[clubKey];

  const rows = [];
  let currentRow = new ActionRowBuilder();

  for (let i = clubBoard.slots.length - 1; i >= 0; i--) {
    const slot = clubBoard.slots[i];

    const button = new ButtonBuilder()
      // customId: pos_<clubKey>_<index>
      .setCustomId(`pos_${clubKey}_${i}`)
      .setLabel(slot.label)
      .setStyle(slot.open ? ButtonStyle.Success : ButtonStyle.Danger);

    currentRow.addComponents(button);

    if (currentRow.components.length === 5) {
      rows.push(currentRow);
      currentRow = new ActionRowBuilder();
    }
  }

  if (currentRow.components.length > 0) {
    rows.push(currentRow);
  }

  return rows;
}

// Club select used on the admin/global panels
function buildClubSelect(guildId, currentClubKey) {
  const state = getGuildState(guildId);
  const { clubs } = state;

  const enabledClubs = clubs.filter((club) => club.enabled);
  const select = new StringSelectMenuBuilder()
    .setCustomId('club_select')
    .setPlaceholder('Select club')
    .addOptions(
      enabledClubs.map((club) => ({
        label: club.name,
        value: club.key,
        default: club.key === currentClubKey
      }))
    );

  return new ActionRowBuilder().addComponents(select);
}

// Viewer dropdown for the read-only /spots board
function buildViewerClubSelect(guildId, selectedKey) {
  const state = getGuildState(guildId);
  const { clubs } = state;

  const enabledClubs = clubs.filter((club) => club.enabled);
  const select = new StringSelectMenuBuilder()
    .setCustomId('viewer_club_select')
    .setPlaceholder('Select club')
    .addOptions(
      enabledClubs.map((club) => ({
        label: club.name,
        value: club.key,
        default: club.key === selectedKey
      }))
    );

  return new ActionRowBuilder().addComponents(select);
}

// Admin/VC panel components for a specific club
// Row 1: club select
// Row 2: Formation / Player Tools / Club Tools
// Rows 3-5: dynamic position buttons from formation
function buildAdminComponents(guildId, clubKey) {
  const clubRow = buildClubSelect(guildId, clubKey);

  const controlRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`formation_menu_${clubKey}`)
      .setLabel('Formation')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`player_tools_${clubKey}`)
      .setLabel('Player Tools')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`club_tools_${clubKey}`)
      .setLabel('Club Tools')
      .setStyle(ButtonStyle.Secondary)
  );

  const buttonRows = buildButtons(guildId, clubKey);

  // IMPORTANT: Max 5 rows total per message
  // clubRow (1) + controlRow (1) + up to 3 position rows = 5
  return [clubRow, controlRow, ...buttonRows.slice(0, 3)];
}

// Refresh all panels (global + any VC panels) that show a given club
async function refreshClubPanels(guildId, clubKey) {
  const state = getGuildState(guildId);
  if (!state) return;

  // Update global admin panel if it is currently showing this club
  if (
    state.adminPanelChannelId &&
    state.adminPanelMessageId &&
    state.currentClubKey === clubKey
  ) {
    try {
      const channel = await client.channels.fetch(state.adminPanelChannelId);
      if (!channel) {
        state.adminPanelChannelId = null;
        state.adminPanelMessageId = null;
      } else {
        const msg = await channel.messages.fetch(state.adminPanelMessageId);
        await msg.edit({
          embeds: [buildEmbedForClub(guildId, clubKey)],
          components: buildAdminComponents(guildId, clubKey)
        });
      }
    } catch (err) {
      if (err.code === 10008) {
        // Unknown Message – panel was deleted, clear tracking
        state.adminPanelChannelId = null;
        state.adminPanelMessageId = null;
      } else if (err.code === 50001) {
        // Missing Access – clear tracking so we stop trying
        state.adminPanelChannelId = null;
        state.adminPanelMessageId = null;
      } else {
        console.error('⚠️ Failed to update admin panel after state change:', err);
      }
    }
  }

  // Update VC panels bound to this club
  if (state.vcPanels) {
    for (const [vcId, panel] of Object.entries(state.vcPanels)) {
      if (!panel || panel.clubKey !== clubKey) continue;

      try {
        const channel = await client.channels.fetch(panel.textChannelId);
        if (!channel) {
          delete state.vcPanels[vcId];
          continue;
        }

        const msg = await channel.messages.fetch(panel.messageId);
        await msg.edit({
          embeds: [buildEmbedForClub(guildId, clubKey)],
          components: buildAdminComponents(guildId, clubKey)
        });
      } catch (err) {
        if (err.code === 10008 || err.code === 50001) {
          // Unknown Message or Missing Access – drop this panel mapping
          delete state.vcPanels[vcId];
        } else {
          console.error(
            `⚠️ Failed to update VC panel for voice channel ${vcId} after state change:`,
            err
          );
        }
      }
    }
  }
}

// Helper: reset all slots for a club (keep formation)
function resetClubSpots(boardState, clubKey) {
  const clubBoard = boardState[clubKey];
  if (!clubBoard) return;
  clubBoard.slots.forEach((slot) => {
    slot.open = true;
    slot.takenBy = null;
  });
}

// DM users when a spot opens
async function handleSlotOpened(guildId, clubKey, slotIndex, slotLabel) {
  const guild = await client.guilds.fetch(guildId).catch(() => null);
  if (!guild) return;

  const clubQueuesData = guildQueues.get(guildId);
  if (!clubQueuesData) return;
  const queue = clubQueuesData[clubKey]?.[slotIndex];
  if (!queue || !queue.length) return;

  // Snapshot then clear queue (one-shot)
  const notifyList = [...queue];
  clubQueuesData[clubKey][slotIndex] = [];

  const state = getGuildState(guildId);
  const club = state ? getClubByKey(state.clubs, clubKey) : null;
  const clubName = club ? club.name : clubKey;

  for (const userId of notifyList) {
    try {
      const member = await guild.members.fetch(userId).catch(() => null);
      if (!member) continue;

      await member.send({
        content: `⚽ Good news! The **${slotLabel}** spot opened up in **${clubName}**.\nJump into VC and claim it on the SpotBot panel!`
      });
    } catch {
      // ignore DM failures
    }
  }
}

// ---------- READY & COMMAND REG ----------

client.once(Events.ClientReady, async (c) => {
  console.log(`✅ Logged in as ${c.user.tag}`);
  console.log(`✅ App ID: ${c.application.id}`);

  try {
    // Global commands (for all servers)
    await c.application.commands.set(COMMANDS);
    console.log('✅ Global commands registered for all servers');

    // Also explicitly register per existing guild (helps them appear faster)
    for (const guild of c.guilds.cache.values()) {
      try {
        await c.application.commands.set(COMMANDS, guild.id);
        console.log(`✅ Commands registered in guild ${guild.name} (${guild.id})`);
      } catch (err) {
        console.error('⚠️ Failed to register commands in guild', guild.id, err);
      }
    }
  } catch (err) {
    console.error('❌ Failed to register commands:', err);
  }
});

// When the bot joins a new server later, register there too
client.on(Events.GuildCreate, async (guild) => {
  try {
    if (!client.application?.commands) return;
    await client.application.commands.set(COMMANDS, guild.id);
    console.log(`✅ Commands registered in newly joined guild ${guild.name} (${guild.id})`);
  } catch (err) {
    console.error('⚠️ Failed to register commands in new guild', guild.id, err);
  }
});

// ---------- INTERACTION HELPERS ----------

// Helper: start "Assign from VC" flow (manager-only)
async function startAssignFromVc(interaction, state, clubKey) {
  if (!isManager(interaction.member)) {
    return interaction.reply({
      content:
        'Only captains, managers, owners, media, or admins can assign or move players.',
      ephemeral: true
    });
  }

  // Check if user is blocked
  if (isUserBlocked(interaction.guildId, interaction.user.id)) {
    return interaction.reply({
      content: '🚫 You have been blocked from moving/assigning players. Contact an admin.',
      ephemeral: true
    });
  }

  const { clubs } = state;
  const club = getClubByKey(clubs, clubKey);
  if (!club) {
    return interaction.reply({
      content: 'Unknown club in assignment request.',
      ephemeral: true
    });
  }

  // Enforce correct VC for VC panels
  const vcPanelInfo = getVcPanelByMessage(state, interaction.message.id);
  let voiceChannel = null;

  if (vcPanelInfo) {
    const { vcId } = vcPanelInfo;
    voiceChannel =
      interaction.guild.channels.cache.get(vcId) ||
      (await interaction.guild.channels.fetch(vcId).catch(() => null));

    if (!voiceChannel) {
      return interaction.reply({
        content: 'The voice channel linked to this panel no longer exists.',
        ephemeral: true
      });
    }

    if (interaction.member?.voice?.channelId !== vcId) {
      return interaction.reply({
        content: `You must be in **${voiceChannel.name}** to assign players for this panel.`,
        ephemeral: true
      });
    }
  } else {
    // Global panel: allow any VC, but must be in one
    voiceChannel = interaction.member?.voice?.channel;
    if (!voiceChannel) {
      return interaction.reply({
        content:
          'You must be in a voice channel with the players you want to assign.',
        ephemeral: true
      });
    }
  }

  const members = [...voiceChannel.members.values()].filter((m) => !m.user.bot);
  if (members.length === 0) {
    return interaction.reply({
      content: 'No non-bot players found in your voice channel to assign.',
      ephemeral: true
    });
  }

  // Up to 24 real players + 1 placeholder = 25 options (Discord limit)
  const memberOptions = members.map((m) => ({
    label: m.displayName || m.user.username,
    value: m.id
  }));

  const options = memberOptions.slice(0, 24);
  options.push({
    label: 'Player not in VC (placeholder)',
    value: '__NOT_IN_VC__',
    description: 'Use when someone is playing but not connected to voice.'
  });

  const select = new StringSelectMenuBuilder()
    .setCustomId(`assign_player_pick_${clubKey}`)
    .setPlaceholder('Pick a player or placeholder')
    .addOptions(options);

  const row = new ActionRowBuilder().addComponents(select);

  return interaction.reply({
    content: `Pick a player to assign in **${club.name}**:`,
    components: [row],
    ephemeral: true
  });
}

// Helper: Smart assign from VC using preferences
async function smartAssignFromVc(interaction, state, clubKey) {
  if (!isManager(interaction.member)) {
    return interaction.reply({
      content: 'Only captains, managers, owners, media, or admins can use smart assign.',
      ephemeral: true
    });
  }

  // Check if user is blocked
  if (isUserBlocked(interaction.guildId, interaction.user.id)) {
    return interaction.reply({
      content: '🚫 You have been blocked from moving/assigning players. Contact an admin.',
      ephemeral: true
    });
  }

  const guild = interaction.guild;
  const clubBoard = state.boardState[clubKey];
  if (!guild || !clubBoard) {
    return interaction.reply({ content: 'Club not found.', ephemeral: true });
  }

  const voiceChannel = interaction.member?.voice?.channel;
  if (!voiceChannel) {
    return interaction.reply({
      content: 'Join a voice channel with your players first.',
      ephemeral: true
    });
  }

  const members = [...voiceChannel.members.values()].filter(m => !m.user.bot);
  if (!members.length) {
    return interaction.reply({
      content: 'No non-bot players in your voice channel.',
      ephemeral: true
    });
  }

  // Build list of open slots
  const openSlots = [];
  clubBoard.slots.forEach((slot, idx) => {
    if (slot.open) openSlots.push({ idx, slot, group: getPositionGroup(slot.label) });
  });

  if (!openSlots.length) {
    return interaction.reply({
      content: 'No open spots in this club to auto-assign.',
      ephemeral: true
    });
  }

  // Track which users we successfully assign
  const assigned = [];

  for (const m of members) {
    const prefs = getUserPrefs(m.id);
    if (!prefs.length) continue;

    let pickedIndex = null;

    // 1) Try exact label match in order of prefs
    for (const pref of prefs) {
      const prefGroup = getPreferenceGroup(pref);
      for (const open of openSlots) {
        if (open.slot.label === pref || getPositionGroup(open.slot.label) === prefGroup) {
          pickedIndex = open.idx;
          break;
        }
      }
      if (pickedIndex !== null) break;
    }

    if (pickedIndex === null) continue;

    // Clear any previous spots this user holds
    clubBoard.slots.forEach(s => {
      if (s.takenBy === m.id) {
        s.open = true;
        s.takenBy = null;
      }
    });

    // Assign
    const s = clubBoard.slots[pickedIndex];
    s.open = false;
    s.takenBy = m.id;
    assigned.push({ member: m, slotLabel: s.label });

    // Remove from openSlots list & clear any queue for that slot
    const openIdx = openSlots.findIndex(o => o.idx === pickedIndex);
    if (openIdx !== -1) openSlots.splice(openIdx, 1);
    ensureQueueState(guild.id, clubKey, pickedIndex).length = 0; // clear queue
    if (!openSlots.length) break;
  }

  await refreshClubPanels(guild.id, clubKey);

  if (!assigned.length) {
    return interaction.reply({
      content: 'No one in your VC could be matched to an open spot based on preferences.',
      ephemeral: true
    });
  }

  const lines = assigned.map(a => `• <@${a.member.id}> → **${a.slotLabel}**`);
  return interaction.reply({
    content: '✅ Smart assigned from VC (using player preferences):\n' + lines.join('\n'),
    ephemeral: true
  });
}

// Helper: Send ready-check DM to VC
async function sendReadyCheck(interaction, clubKey) {
  if (!isManager(interaction.member)) {
    return interaction.reply({
      content: 'Only captains/managers/owners/media/admins can send ready checks.',
      ephemeral: true
    });
  }

  const voiceChannel = interaction.member?.voice?.channel;
  if (!voiceChannel) {
    return interaction.reply({
      content: 'Join the voice channel you want to ready-check first.',
      ephemeral: true
    });
  }

  const members = [...voiceChannel.members.values()].filter(m => !m.user.bot);
  if (!members.length) {
    return interaction.reply({
      content: 'No non-bot players in your voice channel to ready-check.',
      ephemeral: true
    });
  }

  const panelLink = interaction.message?.url || 'the SpotBot panel';

  let sent = 0;
  for (const m of members) {
    try {
      await m.send({
        content:
          `⚽ **Ready check:** your match is starting soon in **${voiceChannel.name}**.\n` +
          `Click here to claim your spot or double-check the lineup:\n${panelLink}`
      });
      sent++;
    } catch {
      // ignore DMs disabled
    }
  }

  return interaction.reply({
    content: `✅ Sent ready-check DMs to **${sent}** player(s) in ${voiceChannel}.`,
    ephemeral: true
  });
}

// Helper: start "Manage existing players" flow (manager-only)
async function startManagePlayers(interaction, state, clubKey) {
  if (!isManager(interaction.member)) {
    return interaction.reply({
      content:
        'Only captains, managers, owners, media, or admins can remove or move players.',
      ephemeral: true
    });
  }

  // Check if user is blocked
  if (isUserBlocked(interaction.guildId, interaction.user.id)) {
    return interaction.reply({
      content: '🚫 You have been blocked from moving/assigning players. Contact an admin.',
      ephemeral: true
    });
  }

  const { clubs, boardState } = state;
  const clubBoard = boardState[clubKey];
  if (!clubBoard) {
    return interaction.reply({
      content: 'Club not found.',
      ephemeral: true
    });
  }

  // Collect unique players who currently have slots
  const seen = new Set();
  const options = [];

  for (const slot of clubBoard.slots) {
    if (slot.open || !slot.takenBy) continue;
    const userId = slot.takenBy;

    // Handle placeholder specially
    if (userId === '__NOT_IN_VC__') {
      if (seen.has(userId)) continue;
      seen.add(userId);
      options.push({
        label: 'Player not in VC (placeholder)',
        value: userId,
        description: 'Placeholder for someone not in voice'
      });
      continue;
    }

    if (seen.has(userId)) continue;
    seen.add(userId);

    let label = userId;
    try {
      const member = await interaction.guild.members.fetch(userId);
      label = member.displayName || member.user.username || userId;
    } catch (err) {
      // ignore fetch error, just keep userId
    }

    options.push({
      label,
      value: userId,
      description: 'Currently in at least one spot'
    });
  }

  if (options.length === 0) {
    return interaction.reply({
      content: 'There are no players to manage for this club.',
      ephemeral: true
    });
  }

  const select = new StringSelectMenuBuilder()
    .setCustomId(`manage_player_pick_${clubKey}`)
    .setPlaceholder('Select a player to remove/move')
    .addOptions(options.slice(0, 25));

  const row = new ActionRowBuilder().addComponents(select);
  const club = getClubByKey(clubs, clubKey);

  return interaction.reply({
    content: `Pick a player in **${club ? club.name : clubKey}** to remove or move:`,
    components: [row],
    ephemeral: true
  });
}

// Helper: start "Set VC for this club" flow (manager-only)
async function startSetClubVc(interaction, state, clubKey) {
  if (!isManager(interaction.member)) {
    return interaction.reply({
      content:
        'Only captains, managers, owners, media, or admins can set the voice channel.',
      ephemeral: true
    });
  }

  const guild = interaction.guild;
  if (!guild) {
    return interaction.reply({
      content: 'Guild not found.',
      ephemeral: true
    });
  }

  const club = getClubByKey(state.clubs, clubKey);
  if (!club) {
    return interaction.reply({
      content: 'Unknown club in voice channel link request.',
      ephemeral: true
    });
  }

  const voiceChannels = guild.channels.cache.filter(
    (ch) =>
      ch.type === ChannelType.GuildVoice ||
      ch.type === ChannelType.GuildStageVoice
  );

  if (!voiceChannels.size) {
    return interaction.reply({
      content: 'No voice channels found in this server to link.',
      ephemeral: true
    });
  }

  const currentLinkedId = state.clubVcLinks?.[clubKey] || null;
  const options = [];

  // Up to 24 channels + 1 "clear" option
  const sorted = [...voiceChannels.values()].sort((a, b) => {
    if (a.rawPosition !== b.rawPosition) {
      return a.rawPosition - b.rawPosition;
    }
    return a.name.localeCompare(b.name);
  });

  for (const vc of sorted) {
    options.push({
      label: vc.name.slice(0, 100),
      value: vc.id,
      default: vc.id === currentLinkedId
    });
    if (options.length >= 24) break;
  }

  options.push({
    label: 'Clear voice channel link',
    value: '__NONE__'
  });

  const select = new StringSelectMenuBuilder()
    .setCustomId(`set_vc_select_${clubKey}`)
    .setPlaceholder('Select a voice channel')
    .addOptions(options);

  const row = new ActionRowBuilder().addComponents(select);

  return interaction.reply({
    content: `Choose a voice channel to link to **${club.name}**.`,
    components: [row],
    ephemeral: true
  });
}

// Helper: reset all spots (manager-only, current club only)
async function doResetSpots(interaction, state, guildId, clubKey) {
  if (!isManager(interaction.member)) {
    return interaction.reply({
      content:
        'Only captains, managers, owners, media, or admins can reset spots.',
      ephemeral: true
    });
  }

  // Notify queues before reset
  const clubBoard = state.boardState[clubKey];
  if (clubBoard) {
    for (let i = 0; i < clubBoard.slots.length; i++) {
      const slot = clubBoard.slots[i];
      if (!slot.open) {
        await handleSlotOpened(guildId, clubKey, i, slot.label);
      }
    }
  }

  resetClubSpots(state.boardState, clubKey);
  await refreshClubPanels(guildId, clubKey);

  return interaction.reply({
    content: 'All spots set to 🟢 OPEN for this club.',
    ephemeral: true
  });
}

// Helper: set formation and try to keep players in logical spots (open to everyone)
async function setClubFormation(interaction, guildId, clubKey, formationName) {
  const state = getGuildState(guildId);
  if (!state) {
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: 'Guild state not found.',
        ephemeral: true
      });
    }
    return;
  }

  const positions = FORMATION_POSITIONS[formationName];
  if (!positions) {
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: 'Unknown formation.',
        ephemeral: true
      });
    }
    return;
  }

  // Acknowledge this interaction so it doesn't expire
  if (!interaction.deferred && !interaction.replied) {
    try {
      await interaction.deferUpdate();
    } catch (err) {
      console.error('⚠️ Error deferring formation change interaction:', err);
    }
  }

  const oldBoard = state.boardState[clubKey];
  const oldSlots = oldBoard?.slots || [];

  // Collect all current occupants from the old board
  const occupants = [];
  for (const slot of oldSlots) {
    if (!slot || slot.open || !slot.takenBy) continue;
    occupants.push({
      playerId: slot.takenBy,
      label: slot.label,
      group: getPositionGroup(slot.label)
    });
  }

  // Build new board with the new formation
  const newBoard = {
    formation: formationName,
    slots: positions.map((label) => ({
      label,
      open: true,
      takenBy: null
    }))
  };

  const newSlots = newBoard.slots;
  const usedIndices = new Set();

  // Priority for groups so we place GK/backs/mids/forwards in a sensible order
  const groupOrder = ['GK', 'CB', 'FB', 'CDM', 'CM', 'CAM', 'WM', 'WING', 'ST', 'OTHER'];
  const groupPriority = {};
  groupOrder.forEach((g, i) => {
    groupPriority[g] = i;
  });

  // Place more "specialized" spots first (GK/CB/etc)
  occupants.sort((a, b) => {
    const pa = groupPriority[a.group] ?? 999;
    const pb = groupPriority[b.group] ?? 999;
    return pa - pb;
  });

  function findExactIndex(label) {
    for (let i = 0; i < newSlots.length; i++) {
      if (usedIndices.has(i)) continue;
      if (newSlots[i].label === label) return i;
    }
    return -1;
  }

  function findGroupIndex(group) {
    for (let i = 0; i < newSlots.length; i++) {
      if (usedIndices.has(i)) continue;
      if (getPositionGroup(newSlots[i].label) === group) return i;
    }
    return -1;
  }

  function findAnyIndex() {
    for (let i = 0; i < newSlots.length; i++) {
      if (!usedIndices.has(i)) return i;
    }
    return -1;
  }

  // Try to keep everyone in the closest possible role
  for (const occ of occupants) {
    let idx = findExactIndex(occ.label); // 1) Same label (CB -> CB, ST -> ST)
    if (idx === -1 && occ.group) {
      idx = findGroupIndex(occ.group); // 2) Same group (LB -> FB, CAM -> CAM/CF)
    }
    if (idx === -1) {
      idx = findAnyIndex(); // 3) Fall back to any open slot
    }

    if (idx !== -1) {
      newSlots[idx].open = false;
      newSlots[idx].takenBy = occ.playerId; // Works for real players + "__NOT_IN_VC__"
      usedIndices.add(idx);
    }
  }

  // Preserve VC link when changing formation
  const oldVcId = state.clubVcLinks?.[clubKey] || null;

  state.boardState[clubKey] = newBoard;
  if (!state.clubVcLinks) state.clubVcLinks = {};
  state.clubVcLinks[clubKey] = oldVcId;

  try {
    await refreshClubPanels(guildId, clubKey);
  } catch (err) {
    console.error('⚠️ Error refreshing panels after formation change:', err);
  }

  // Ephemeral confirmation; safe to ignore if interaction already expired
  try {
    await interaction.followUp({
      content: `Formation for this club is now **${formationName}**. Current players were moved into the closest matching spots.`,
      ephemeral: true
    });
  } catch (err) {
    if (err.code !== 10062) {
      console.error('⚠️ Error sending formation change follow-up:', err);
    }
  }
}

// ---------- MAIN INTERACTION HANDLER ----------

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    const guildId = interaction.guildId;
    if (!guildId) return; // ignore DMs

    const state = getGuildState(guildId);
    if (!state) return;

    const { clubs, boardState } = state;

    // ----- Slash Commands -----
    if (interaction.isChatInputCommand()) {
      const cmd = interaction.commandName;

      // /spothelp - DM the manual
      if (cmd === 'spothelp') {
        const helpEmbed = new EmbedBuilder()
          .setTitle('📘 SpotBot Help')
          .setColor(0x5865f2)
          .setDescription(
            '**Core commands**\n' +
            '• `/spotpanel` – create/manage club spot panels (managers).\n' +
            '• `/vcspots` – link this text channel to your current VC and show live spots.\n' +
            '• `/spots` – read-only view of all spots.\n' +
            '• `/pospanel` – set your position preferences.\n' +
            '• `/posboard` – show preferences for players in your VC.\n' +
            '• `/whoisplaying` – show who is slotted in your VC club.\n' +
            '• `/spothelp` – this help message.\n\n' +
            '**Buttons & menus**\n' +
            '• **Formation** – change club formation.\n' +
            '• **Player Tools** – assign from VC, smart assign, move/remove players, ready check.\n' +
            '• **Club Tools** – rename/add/remove clubs, reset spots, link VC, block users, refresh panel.\n\n' +
            '*Players:* Join VC → click your position on the panel to claim a spot.\n' +
            '*Managers:* Use Player/Club Tools menus for deeper control.\n\n' +
            '**Queue System**\n' +
            'Click a taken spot to join the waitlist. You\'ll get a DM when it opens!'
          );

        // DM it, fall back to channel if DMs are closed
        try {
          await interaction.user.send({ embeds: [helpEmbed] });
          return interaction.reply({
            content: "I've DMed you the SpotBot manual ✅",
            ephemeral: true
          });
        } catch {
          return interaction.reply({
            embeds: [helpEmbed],
            ephemeral: true
          });
        }
      }

      // /pospanel - Set position preferences
      if (cmd === 'pospanel') {
        const currentPrefs = getUserPrefs(interaction.user.id);
        
        const options = POSITION_PREF_OPTIONS.map(pos => ({
          label: pos,
          value: pos,
          default: currentPrefs.includes(pos)
        }));

        const select = new StringSelectMenuBuilder()
          .setCustomId('pospanel_select')
          .setPlaceholder('Select your preferred positions (in order)')
          .setMinValues(1)
          .setMaxValues(POSITION_PREF_OPTIONS.length)
          .addOptions(options);

        const row = new ActionRowBuilder().addComponents(select);

        const currentText = currentPrefs.length > 0 
          ? `Your current preferences: **${currentPrefs.join(' → ')}**`
          : 'You have no position preferences set yet.';

        return interaction.reply({
          content: `🎯 **Set your position preferences**\n${currentText}\n\nSelect positions in order of preference (first = most preferred):`,
          components: [row],
          ephemeral: true
        });
      }

      // /posboard - Show preferences for VC members
      if (cmd === 'posboard') {
        const voiceChannel = interaction.member?.voice?.channel;
        if (!voiceChannel) {
          return interaction.reply({
            content: 'You must be in a voice channel to use `/posboard`.',
            ephemeral: true
          });
        }

        const members = [...voiceChannel.members.values()].filter(m => !m.user.bot);
        if (!members.length) {
          return interaction.reply({
            content: 'No non-bot players in your voice channel.',
            ephemeral: true
          });
        }

        const lines = [];
        for (const m of members) {
          const prefs = getUserPrefs(m.id);
          const prefsText = prefs.length > 0 ? prefs.join(' → ') : '_No preferences set_';
          lines.push(`**${m.displayName || m.user.username}**: ${prefsText}`);
        }

        const embed = new EmbedBuilder()
          .setTitle(`🎯 Position Preferences – ${voiceChannel.name}`)
          .setDescription(lines.join('\n'))
          .setColor(0x5865f2)
          .setFooter({ text: `${members.length} player(s) in voice` });

        return interaction.reply({
          embeds: [embed],
          ephemeral: false
        });
      }

      // /whoisplaying - Show who is slotted in VC club
      if (cmd === 'whoisplaying') {
        const voiceChannel = interaction.member?.voice?.channel;
        if (!voiceChannel) {
          return interaction.reply({
            content: 'You must be in a voice channel to use `/whoisplaying`.',
            ephemeral: true
          });
        }

        // Find club linked to this VC
        let linkedClubKey = null;
        for (const [clubKey, vcId] of Object.entries(state.clubVcLinks || {})) {
          if (vcId === voiceChannel.id) {
            linkedClubKey = clubKey;
            break;
          }
        }

        if (!linkedClubKey) {
          return interaction.reply({
            content: `No club is linked to **${voiceChannel.name}**. Use \`/vcspots\` to link one.`,
            ephemeral: true
          });
        }

        const club = getClubByKey(clubs, linkedClubKey);
        const clubBoard = boardState[linkedClubKey];
        if (!club || !clubBoard) {
          return interaction.reply({
            content: 'Club not found.',
            ephemeral: true
          });
        }

        const lines = [];
        for (let i = clubBoard.slots.length - 1; i >= 0; i--) {
          const slot = clubBoard.slots[i];
          const emoji = slot.open ? '🟢' : '🔴';
          let text;
          if (slot.open) {
            text = 'OPEN';
          } else if (slot.takenBy === '__NOT_IN_VC__') {
            text = 'Player not in VC';
          } else if (slot.takenBy) {
            text = `<@${slot.takenBy}>`;
          } else {
            text = 'TAKEN';
          }
          lines.push(`${emoji} **${slot.label}** – ${text}`);
        }

        const embed = new EmbedBuilder()
          .setTitle(`⚽ ${club.name} – Who's Playing`)
          .setDescription(lines.join('\n'))
          .setColor(0x00ff00)
          .setFooter({ text: `Linked to ${voiceChannel.name}` });

        return interaction.reply({
          embeds: [embed],
          ephemeral: false
        });
      }

      // Global admin panel (anyone can make it)
      if (cmd === 'spotpanel') {
        await interaction.reply({
          embeds: [buildEmbedForClub(guildId, state.currentClubKey)],
          components: buildAdminComponents(guildId, state.currentClubKey)
        });

        const msg = await interaction.fetchReply();

        state.adminPanelChannelId = interaction.channelId;
        state.adminPanelMessageId = msg.id;
        return;
      }

      // Read-only viewer board
      if (cmd === 'spots') {
        let key = state.currentClubKey;
        const currentClub = getClubByKey(clubs, key);
        if (!currentClub || !currentClub.enabled) {
          const firstEnabled = clubs.find((c) => c.enabled) || clubs[0];
          key = firstEnabled ? firstEnabled.key : state.currentClubKey;
        }

        return interaction.reply({
          embeds: [buildEmbedForClub(guildId, key)],
          components: [buildViewerClubSelect(guildId, key)],
          ephemeral: false
        });
      }

      // VC-linked live panel
      if (cmd === 'vcspots') {
        const voiceChannel = interaction.member?.voice?.channel;
        if (!voiceChannel) {
          return interaction.reply({
            content: 'You must be in a voice channel to use `/vcspots`.',
            ephemeral: true
          });
        }

        const enabledClubs = clubs.filter((c) => c.enabled);
        if (enabledClubs.length === 0) {
          return interaction.reply({
            content:
              'No enabled clubs are available. Use `/spotpanel` to add or enable clubs first.',
            ephemeral: true
          });
        }

        const select = new StringSelectMenuBuilder()
          .setCustomId(`vcspots_pickclub_${voiceChannel.id}`)
          .setPlaceholder('Select club for this voice channel')
          .addOptions(
            enabledClubs.map((club) => ({
              label: club.name,
              value: club.key
            }))
          );

        const row = new ActionRowBuilder().addComponents(select);

        return interaction.reply({
          content: `Pick which club is playing in **${voiceChannel.name}**. I'll post/update the live panel in this chat.`,
          components: [row],
          ephemeral: true
        });
      }
    }

    // ----- Buttons -----
    if (interaction.isButton()) {
      const guildIdBtn = interaction.guildId;
      const stateBtn = getGuildState(guildIdBtn);
      if (!stateBtn) return;

      const { clubs: clubsBtn, boardState: boardStateBtn } = stateBtn;
      const id = interaction.customId;

      // Rename club (legacy button - kept for compatibility, but normally use Club Tools)
      if (id.startsWith('rename_club_')) {
        const clubKey = id.substring('rename_club_'.length);
        const currentClub = getClubByKey(clubsBtn, clubKey);
        if (!currentClub) {
          return interaction.reply({
            content: 'Current club not found.',
            ephemeral: true
          });
        }

        const modal = new ModalBuilder()
          .setCustomId(`rename_club_modal_${clubKey}`)
          .setTitle('Rename Club')
          .addComponents(
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId('club_name')
                .setLabel('New club name')
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
                .setValue(currentClub.name)
            )
          );

        await interaction.showModal(modal);
        return;
      }

      // Add a new club slot (legacy button - normally via Club Tools)
      if (id === 'add_club') {
        const disabledClub = clubsBtn.find((c) => !c.enabled);
        if (!disabledClub) {
          return interaction.reply({
            content: 'All available club slots are already in use (max 5).',
            ephemeral: true
          });
        }

        disabledClub.enabled = true;
        boardStateBtn[disabledClub.key] = createEmptyBoardForFormation(
          DEFAULT_FORMATION
        );
        if (!stateBtn.clubVcLinks) stateBtn.clubVcLinks = {};
        stateBtn.clubVcLinks[disabledClub.key] = null;

        stateBtn.currentClubKey = disabledClub.key;

        return interaction.reply({
          content: `Added a new club slot: **${disabledClub.name}**. Use "Club Tools" & "Formation" to configure it.`,
          ephemeral: true
        });
      }

      // Remove a club (legacy button - normally via Club Tools)
      if (id.startsWith('remove_club_')) {
        const clubKey = id.substring('remove_club_'.length);
        const currentClub = getClubByKey(clubsBtn, clubKey);
        if (!currentClub || !currentClub.enabled) {
          return interaction.reply({
            content: 'This club cannot be removed.',
            ephemeral: true
          });
        }

        const enabledCount = clubsBtn.filter((c) => c.enabled).length;
        if (enabledCount <= 1) {
          return interaction.reply({
            content: 'You must keep at least one club enabled.',
            ephemeral: true
          });
        }

        const clubBoard = boardStateBtn[clubKey];
        if (clubBoard && clubBoard.slots) {
          const hasTaken = clubBoard.slots.some((slot) => !slot.open);
          if (hasTaken) {
            return interaction.reply({
              content:
                'This club still has taken spots. Free all spots first before removing it.',
              ephemeral: true
            });
          }
        }

        currentClub.enabled = false;
        resetClubSpots(boardStateBtn, clubKey);
        if (stateBtn.clubVcLinks) {
          stateBtn.clubVcLinks[clubKey] = null;
        }

        // If the removed club was the "current" one, move pointer
        if (stateBtn.currentClubKey === clubKey) {
          const firstEnabled = clubsBtn.find((c) => c.enabled);
          if (firstEnabled) stateBtn.currentClubKey = firstEnabled.key;
        }

        return interaction.reply({
          content: `Removed club **${currentClub.name}**. Panels may need to be recreated to reflect this change.`,
          ephemeral: true
        });
      }

      // Player tools (manager-only, opens ephemeral menu)
      if (id.startsWith('player_tools_')) {
        const clubKey = id.substring('player_tools_'.length);

        if (!isManager(interaction.member)) {
          return interaction.reply({
            content:
              'Only captains, managers, owners, media, or admins can use player tools.',
            ephemeral: true
          });
        }

        const select = new StringSelectMenuBuilder()
          .setCustomId(`player_tools_select_${clubKey}`)
          .setPlaceholder('Choose a player tool')
          .addOptions(
            {
              label: 'Assign from your voice channel',
              value: 'assign'
            },
            {
              label: 'Smart assign from VC (using prefs)',
              value: 'smart_assign'
            },
            {
              label: 'Remove/move existing players',
              value: 'manage'
            },
            {
              label: 'Send ready-check DM to your VC',
              value: 'ready_check'
            }
          );

        const row = new ActionRowBuilder().addComponents(select);

        return interaction.reply({
          content: 'What do you want to do?',
          components: [row],
          ephemeral: true
        });
      }

      // Club tools (manager-only, opens ephemeral menu)
      if (id.startsWith('club_tools_')) {
        const clubKey = id.substring('club_tools_'.length);

        if (!isManager(interaction.member)) {
          return interaction.reply({
            content:
              'Only captains, managers, owners, media, or admins can use club tools.',
            ephemeral: true
          });
        }

        const select = new StringSelectMenuBuilder()
          .setCustomId(`club_tools_select_${clubKey}`)
          .setPlaceholder('Choose a club tool')
          .addOptions(
            {
              label: 'Rename club',
              value: 'rename'
            },
            {
              label: 'Add club',
              value: 'add'
            },
            {
              label: 'Remove club',
              value: 'remove'
            },
            {
              label: 'Set voice channel for this club',
              value: 'set_vc'
            },
            {
              label: 'Reset all spots (this club)',
              value: 'reset'
            },
            {
              label: 'Block/Unblock a user',
              value: 'block_user'
            },
            {
              label: 'Refresh panel',
              value: 'refresh'
            }
          );

        const row = new ActionRowBuilder().addComponents(select);

        return interaction.reply({
          content: 'Club tools:',
          components: [row],
          ephemeral: true
        });
      }

      // Formation menu button (now open to everyone)
      if (id.startsWith('formation_menu_')) {
        const clubKey = id.substring('formation_menu_'.length);

        const clubBoard =
          boardState[clubKey] || createEmptyBoardForFormation(DEFAULT_FORMATION);
        const currentFormation = clubBoard.formation || DEFAULT_FORMATION;

        const allNames = Object.keys(FORMATION_POSITIONS);

        const threeBack = allNames.filter((name) => name.startsWith('3-'));
        const fourBack = allNames.filter((name) => name.startsWith('4-'));
        const fiveBack = allNames.filter((name) => name.startsWith('5-'));
        const twoStrikers = allNames.filter((name) => {
          const positions = FORMATION_POSITIONS[name] || [];
          return positions.filter((p) => p === 'ST').length === 2;
        });

        const groups = [
          { id: '3back', label: '3-back formations', list: threeBack },
          { id: '4back', label: '4-back formations', list: fourBack },
          { id: '5back', label: '5-back formations', list: fiveBack },
          { id: '2st', label: 'Two-striker formations', list: twoStrikers }
        ];

        const rows = [];

        groups.forEach((group) => {
          if (!group.list.length) return;

          const options = group.list.map((name) => ({
            label: name,
            value: name,
            default: name === currentFormation
          }));

          const select = new StringSelectMenuBuilder()
            .setCustomId(`formation_select_${clubKey}_${group.id}`)
            .setPlaceholder(group.label)
            .addOptions(options.slice(0, 25));

          rows.push(new ActionRowBuilder().addComponents(select));
        });

        return interaction.reply({
          content:
            'Choose a formation. Current players will be moved into the closest matching spots.',
          components: rows,
          ephemeral: true
        });
      }

      // Queue button - join waitlist for a spot
      if (id.startsWith('queue_')) {
        const [, clubKey, idxStr] = id.split('_');
        const slotIndex = parseInt(idxStr, 10);

        const queue = ensureQueueState(guildIdBtn, clubKey, slotIndex);
        if (!queue.includes(interaction.user.id)) {
          queue.push(interaction.user.id);
        }

        return interaction.update({
          content: "✅ You're now on the waitlist for this spot. I'll DM you when it opens up.",
          components: []
        });
      }

      // Position buttons: self-claim/free + two-click move/swap
      if (id.startsWith('pos_')) {
        // customId: pos_<clubKey>_<index>
        const parts = id.split('_'); // ['pos', clubKey, index]
        const clubKey = parts[1];
        const index = parseInt(parts[2], 10);

        const clubBoard = boardStateBtn[clubKey];
        if (!clubBoard || !clubBoard.slots[index]) {
          return;
        }

        const slot = clubBoard.slots[index];

        // Is this message a VC panel?
        const vcPanelInfo = getVcPanelByMessage(stateBtn, interaction.message.id);
        if (vcPanelInfo) {
          const { vcId } = vcPanelInfo;
          if (interaction.member?.voice?.channelId !== vcId) {
            let vcChannel = null;
            try {
              vcChannel =
                interaction.guild.channels.cache.get(vcId) ||
                (await interaction.guild.channels.fetch(vcId));
            } catch (err) {
              // ignore; vcChannel remains null
            }

            return interaction.reply({
              content: `This panel is linked to voice channel **${
                vcChannel ? vcChannel.name : vcId
              }**. Join that voice channel to claim, free, or move a spot.`,
              ephemeral: true
            });
          }
        } else {
          // Not a VC panel: require being in some VC at least
          const inVoice = interaction.member?.voice?.channelId;
          if (!inVoice) {
            return interaction.reply({
              content:
                'You must be connected to a voice channel to claim, free, or move a spot.',
              ephemeral: true
            });
          }
        }

        const userId = interaction.user.id;
        const guildIdDrag = guildIdBtn;
        const isMgr = isManager(interaction.member);
        const existingDrag = getDrag(guildIdDrag, userId);

        // Check if user is blocked (for moving others, not self-claim)
        const userBlocked = isUserBlocked(guildIdBtn, userId);

        // If we already have a drag in this guild and it's for this club,
        // treat this click as the "drop" / swap action.
        if (existingDrag && existingDrag.clubKey === clubKey) {
          if (userBlocked) {
            setDrag(guildIdDrag, userId, null);
            return interaction.reply({
              content: '🚫 You have been blocked from moving players. Contact an admin.',
              ephemeral: true
            });
          }

          const fromIndex = existingDrag.fromIndex;
          const fromBoard = boardStateBtn[clubKey];
          const fromSlot = fromBoard?.slots[fromIndex];

          if (!fromBoard || !fromSlot) {
            // stale drag state
            setDrag(guildIdDrag, userId, null);
            return interaction.reply({
              content: 'Move cancelled (original spot no longer exists).',
              ephemeral: true
            });
          }

          if (fromIndex === index) {
            // Clicked the same spot -> cancel move
            setDrag(guildIdDrag, userId, null);
            return interaction.reply({
              content: 'Move cancelled.',
              ephemeral: true
            });
          }

          // Perform move / swap
          const targetSlot = clubBoard.slots[index];
          const tempTakenBy = fromSlot.takenBy;

          // Handle slot opened notifications
          if (!fromSlot.open && fromSlot.takenBy) {
            await handleSlotOpened(guildIdBtn, clubKey, fromIndex, fromSlot.label);
          }

          fromSlot.takenBy = targetSlot.takenBy;
          fromSlot.open = !fromSlot.takenBy;

          targetSlot.takenBy = tempTakenBy;
          targetSlot.open = !targetSlot.takenBy;

          setDrag(guildIdDrag, userId, null);

          await interaction.deferUpdate();
          await refreshClubPanels(guildIdBtn, clubKey);
          return;
        }

        // If drag exists but for a different club, clear it and treat this click fresh
        if (existingDrag && existingDrag.clubKey !== clubKey) {
          setDrag(guildIdDrag, userId, null);
        }

        const inVoice = !!interaction.member?.voice?.channelId;
        const canMoveOthers = (isMgr || inVoice) && !userBlocked;

        if (slot.open) {
          // No drag active: normal self-claim (clear any other slots this user holds in this club)
          clubBoard.slots.forEach((s) => {
            if (s.takenBy === userId) {
              s.open = true;
              s.takenBy = null;
            }
          });
          slot.open = false;
          slot.takenBy = userId;

          await interaction.deferUpdate();
          await refreshClubPanels(guildIdBtn, clubKey);

          // Send ephemeral confirmation
          try {
            await interaction.followUp({
              content: `✅ You are now playing **${slot.label}** for this club.`,
              ephemeral: true
            });
          } catch {}
          return;
        }

        // Slot is taken
        if (slot.takenBy === userId) {
          // Simple self-unclaim
          slot.open = true;
          slot.takenBy = null;

          await handleSlotOpened(guildIdBtn, clubKey, index, slot.label);

          await interaction.deferUpdate();
          await refreshClubPanels(guildIdBtn, clubKey);
          return;
        }

        // Taken by someone else: offer queue or start drag if allowed
        if (!canMoveOthers) {
          // Offer to join queue
          const queueRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId(`queue_${clubKey}_${index}`)
              .setLabel('Notify me when this spot opens')
              .setStyle(ButtonStyle.Secondary)
          );

          return interaction.reply({
            content: 'This spot is already taken. You can join the waitlist for this exact position.',
            components: [queueRow],
            ephemeral: true
          });
        }

        // Start drag for this slot
        setDrag(guildIdDrag, userId, { clubKey, fromIndex: index });

        return interaction.reply({
          content: `You are now moving ${
            slot.takenBy === '__NOT_IN_VC__' ? 'the placeholder player' : `<@${slot.takenBy}>`
          } from **${slot.label}**.\nClick another spot in this club to place them, or this spot again to cancel.`,
          ephemeral: true
        });
      }
    }

    // ----- Modals (rename club) -----
    if (interaction.isModalSubmit()) {
      const id = interaction.customId;

      if (id.startsWith('rename_club_modal_')) {
        const clubKey = id.substring('rename_club_modal_'.length);

        const newName = interaction.fields.getTextInputValue('club_name').trim();
        if (!newName) {
          return interaction.reply({
            content: 'Club name cannot be empty.',
            ephemeral: true
          });
        }

        const stateModal = getGuildState(interaction.guildId);
        if (!stateModal) {
          return interaction.reply({
            content: 'Guild state not found.',
            ephemeral: true
          });
        }

        const currentClub = getClubByKey(stateModal.clubs, clubKey);
        if (!currentClub) {
          return interaction.reply({
            content: 'Current club not found.',
            ephemeral: true
          });
        }

        currentClub.name = newName;

        await refreshClubPanels(interaction.guildId, clubKey);

        return interaction.reply({
          content: `Club renamed to **${newName}**.`,
          ephemeral: true
        });
      }
    }

    // ----- Dropdowns -----
    if (interaction.isStringSelectMenu()) {
      const id = interaction.customId;
      const guildIdSel = interaction.guildId;
      const stateSel = getGuildState(guildIdSel);
      if (!stateSel) return;

      // Position preferences selection
      if (id === 'pospanel_select') {
        const selectedPrefs = interaction.values;
        setUserPrefs(interaction.user.id, selectedPrefs);

        return interaction.update({
          content: `✅ Your position preferences have been saved!\n**${selectedPrefs.join(' → ')}**`,
          components: []
        });
      }

      // Public viewer club select (/spots board)
      if (id === 'viewer_club_select') {
        const selectedKey = interaction.values[0];
        const club = getClubByKey(stateSel.clubs, selectedKey);
        if (!club || !club.enabled) {
          return interaction.reply({
            content: 'Unknown or disabled club selected.',
            ephemeral: true
          });
        }

        return interaction.update({
          embeds: [buildEmbedForClub(guildIdSel, selectedKey)],
          components: [buildViewerClubSelect(guildIdSel, selectedKey)]
        });
      }

      // Change which club we're editing on a given panel
      if (id === 'club_select') {
        const selectedKey = interaction.values[0];
        const club = getClubByKey(stateSel.clubs, selectedKey);
        if (!club) {
          return interaction.reply({
            content: 'Unknown club selected.',
            ephemeral: true
          });
        }

        stateSel.currentClubKey = selectedKey;

        // If this message is a VC panel, update its mapping
        const vcPanelInfo = getVcPanelByMessage(stateSel, interaction.message.id);
        if (vcPanelInfo) {
          vcPanelInfo.panel.clubKey = selectedKey;
        }

        return interaction.update({
          embeds: [buildEmbedForClub(guildIdSel, selectedKey)],
          components: buildAdminComponents(guildIdSel, selectedKey)
        });
      }

      // Player Tools selection (manager-only)
      if (id.startsWith('player_tools_select_')) {
        const clubKey = id.substring('player_tools_select_'.length);
        const choice = interaction.values[0];

        if (!isManager(interaction.member)) {
          return interaction.reply({
            content:
              'Only captains, managers, owners, media, or admins can use player tools.',
            ephemeral: true
          });
        }

        if (choice === 'assign') {
          return startAssignFromVc(interaction, stateSel, clubKey);
        }
        if (choice === 'smart_assign') {
          return smartAssignFromVc(interaction, stateSel, clubKey);
        }
        if (choice === 'manage') {
          return startManagePlayers(interaction, stateSel, clubKey);
        }
        if (choice === 'ready_check') {
          return sendReadyCheck(interaction, clubKey);
        }
        return;
      }

      // Club Tools selection (manager-only)
      if (id.startsWith('club_tools_select_')) {
        const clubKey = id.substring('club_tools_select_'.length);
        const choice = interaction.values[0];

        if (!isManager(interaction.member)) {
          return interaction.reply({
            content:
              'Only captains, managers, owners, media, or admins can use club tools.',
            ephemeral: true
          });
        }

        const club = getClubByKey(stateSel.clubs, clubKey);
        if (!club) {
          return interaction.reply({
            content: 'Unknown club selected.',
            ephemeral: true
          });
        }

        // Handle each club tool
        if (choice === 'rename') {
          const modal = new ModalBuilder()
            .setCustomId(`rename_club_modal_${clubKey}`)
            .setTitle('Rename Club')
            .addComponents(
              new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                  .setCustomId('club_name')
                  .setLabel('New club name')
                  .setStyle(TextInputStyle.Short)
                  .setRequired(true)
                  .setValue(club.name)
              )
            );

          await interaction.showModal(modal);
          return;
        }

        if (choice === 'add') {
          const disabledClub = stateSel.clubs.find((c) => !c.enabled);
          if (!disabledClub) {
            return interaction.update({
              content:
                'All available club slots are already in use (max 5).',
              components: []
            });
          }

          disabledClub.enabled = true;
          stateSel.boardState[disabledClub.key] = createEmptyBoardForFormation(
            DEFAULT_FORMATION
          );
          if (!stateSel.clubVcLinks) stateSel.clubVcLinks = {};
          stateSel.clubVcLinks[disabledClub.key] = null;

          stateSel.currentClubKey = disabledClub.key;

          await refreshClubPanels(guildIdSel, disabledClub.key);

          return interaction.update({
            content: `Added a new club slot: **${disabledClub.name}**.`,
            components: []
          });
        }

        if (choice === 'remove') {
          const currentClub = club;
          if (!currentClub || !currentClub.enabled) {
            return interaction.update({
              content: 'This club cannot be removed.',
              components: []
            });
          }

          const enabledCount = stateSel.clubs.filter((c) => c.enabled).length;
          if (enabledCount <= 1) {
            return interaction.update({
              content: 'You must keep at least one club enabled.',
              components: []
            });
          }

          const clubBoard = stateSel.boardState[clubKey];
          if (clubBoard && clubBoard.slots) {
            const hasTaken = clubBoard.slots.some((slot) => !slot.open);
            if (hasTaken) {
              return interaction.update({
                content:
                  'This club still has taken spots. Free all spots first before removing it.',
                components: []
              });
            }
          }

          currentClub.enabled = false;
          resetClubSpots(stateSel.boardState, clubKey);
          if (stateSel.clubVcLinks) {
            stateSel.clubVcLinks[clubKey] = null;
          }

          if (stateSel.currentClubKey === clubKey) {
            const firstEnabled = stateSel.clubs.find((c) => c.enabled);
            if (firstEnabled) stateSel.currentClubKey = firstEnabled.key;
          }

          await refreshClubPanels(guildIdSel, stateSel.currentClubKey);

          return interaction.update({
            content: `Removed club **${currentClub.name}**.`,
            components: []
          });
        }

        if (choice === 'set_vc') {
          return startSetClubVc(interaction, stateSel, clubKey);
        }

        if (choice === 'reset') {
          return doResetSpots(interaction, stateSel, guildIdSel, clubKey);
        }

        if (choice === 'block_user') {
          // Show block/unblock user menu
          const blockedList = getBlockedUsers(guildIdSel);
          
          const blockSelect = new StringSelectMenuBuilder()
            .setCustomId(`block_user_action_${clubKey}`)
            .setPlaceholder('Choose action')
            .addOptions(
              {
                label: 'Block a user from moving players',
                value: 'block',
                description: 'Select a user to block'
              },
              {
                label: 'Unblock a user',
                value: 'unblock',
                description: blockedList.length > 0 ? `${blockedList.length} user(s) blocked` : 'No users blocked'
              },
              {
                label: 'View blocked users',
                value: 'view',
                description: 'See who is currently blocked'
              }
            );

          const row = new ActionRowBuilder().addComponents(blockSelect);

          return interaction.update({
            content: '🚫 **Block/Unblock Users**\nBlocked users cannot move or assign other players.',
            components: [row]
          });
        }

        if (choice === 'refresh') {
          await refreshClubPanels(guildIdSel, clubKey);
          return interaction.update({
            content: 'Panel refreshed.',
            components: []
          });
        }

        return;
      }

      // Block user action selection
      if (id.startsWith('block_user_action_')) {
        const clubKey = id.substring('block_user_action_'.length);
        const action = interaction.values[0];

        if (!isManager(interaction.member)) {
          return interaction.reply({
            content: 'Only managers can block/unblock users.',
            ephemeral: true
          });
        }

        if (action === 'view') {
          const blockedList = getBlockedUsers(guildIdSel);
          if (blockedList.length === 0) {
            return interaction.update({
              content: '✅ No users are currently blocked.',
              components: []
            });
          }

          const mentions = blockedList.map(id => `<@${id}>`).join('\n');
          return interaction.update({
            content: `🚫 **Blocked Users:**\n${mentions}`,
            components: []
          });
        }

        if (action === 'block') {
          // Get VC members to show as options
          const voiceChannel = interaction.member?.voice?.channel;
          let members = [];
          
          if (voiceChannel) {
            members = [...voiceChannel.members.values()].filter(m => !m.user.bot);
          }

          if (members.length === 0) {
            return interaction.update({
              content: 'Join a voice channel to select users to block, or use the user ID.',
              components: []
            });
          }

          const options = members.slice(0, 25).map(m => ({
            label: m.displayName || m.user.username,
            value: m.id,
            description: `ID: ${m.id}`
          }));

          const select = new StringSelectMenuBuilder()
            .setCustomId(`block_user_confirm_${clubKey}`)
            .setPlaceholder('Select user to block')
            .addOptions(options);

          const row = new ActionRowBuilder().addComponents(select);

          return interaction.update({
            content: 'Select a user to block from moving/assigning players:',
            components: [row]
          });
        }

        if (action === 'unblock') {
          const blockedList = getBlockedUsers(guildIdSel);
          if (blockedList.length === 0) {
            return interaction.update({
              content: '✅ No users are currently blocked.',
              components: []
            });
          }

          const options = [];
          for (const userId of blockedList.slice(0, 25)) {
            let label = userId;
            try {
              const member = await interaction.guild.members.fetch(userId);
              label = member.displayName || member.user.username;
            } catch {}
            options.push({
              label,
              value: userId,
              description: `ID: ${userId}`
            });
          }

          const select = new StringSelectMenuBuilder()
            .setCustomId(`unblock_user_confirm_${clubKey}`)
            .setPlaceholder('Select user to unblock')
            .addOptions(options);

          const row = new ActionRowBuilder().addComponents(select);

          return interaction.update({
            content: 'Select a user to unblock:',
            components: [row]
          });
        }

        return;
      }

      // Block user confirmation
      if (id.startsWith('block_user_confirm_')) {
        const userId = interaction.values[0];
        
        if (!isManager(interaction.member)) {
          return interaction.reply({
            content: 'Only managers can block users.',
            ephemeral: true
          });
        }

        blockUser(guildIdSel, userId);

        return interaction.update({
          content: `🚫 <@${userId}> has been blocked from moving/assigning players.`,
          components: []
        });
      }

      // Unblock user confirmation
      if (id.startsWith('unblock_user_confirm_')) {
        const userId = interaction.values[0];
        
        if (!isManager(interaction.member)) {
          return interaction.reply({
            content: 'Only managers can unblock users.',
            ephemeral: true
          });
        }

        unblockUser(guildIdSel, userId);

        return interaction.update({
          content: `✅ <@${userId}> has been unblocked and can now move/assign players again.`,
          components: []
        });
      }

      // Set VC: choose voice channel / clear
      if (id.startsWith('set_vc_select_')) {
        const clubKey = id.substring('set_vc_select_'.length);
        const selected = interaction.values[0];

        const club = getClubByKey(stateSel.clubs, clubKey);
        if (!club) {
          return interaction.reply({
            content: 'Unknown club in voice channel link request.',
            ephemeral: true
          });
        }

        if (!stateSel.clubVcLinks) stateSel.clubVcLinks = {};

        let responseText;
        if (selected === '__NONE__') {
          stateSel.clubVcLinks[clubKey] = null;
          responseText = `Cleared the linked voice channel for **${club.name}**.`;
        } else {
          stateSel.clubVcLinks[clubKey] = selected;
          responseText = `Linked **${club.name}** to voice channel <#${selected}>.`;
        }

        await refreshClubPanels(guildIdSel, clubKey);

        return interaction.update({
          content: responseText,
          components: []
        });
      }

      // First step of manager assignment: pick player (manager-only)
      if (id.startsWith('assign_player_pick_')) {
        if (!isManager(interaction.member)) {
          return interaction.reply({
            content:
              'Only captains, managers, owners, media, or admins can assign or move players.',
            ephemeral: true
          });
        }

        // Check if user is blocked
        if (isUserBlocked(guildIdSel, interaction.user.id)) {
          return interaction.reply({
            content: '🚫 You have been blocked from moving/assigning players. Contact an admin.',
            ephemeral: true
          });
        }

        const clubKey = id.substring('assign_player_pick_'.length);
        const club = getClubByKey(stateSel.clubs, clubKey);
        if (!club) {
          return interaction.reply({
            content: 'Unknown club in assignment request.',
            ephemeral: true
          });
        }

        const userId = interaction.values[0];
        const clubBoard = stateSel.boardState[clubKey];
        if (!clubBoard) {
          return interaction.reply({
            content: 'Club board not found.',
            ephemeral: true
          });
        }

        // Build slot options with numbering if duplicate labels
        const labelCounts = {};
        clubBoard.slots.forEach((slot) => {
          labelCounts[slot.label] = (labelCounts[slot.label] || 0) + 1;
        });

        const seenLabelIndex = {};
        const options = [];
        for (let idx = clubBoard.slots.length - 1; idx >= 0; idx--) {
          const slot = clubBoard.slots[idx];
          const total = labelCounts[slot.label];
          let label = slot.label;
          if (total > 1) {
            seenLabelIndex[slot.label] = (seenLabelIndex[slot.label] || 0) + 1;
            label = `${slot.label} (${seenLabelIndex[slot.label]})`;
          }
          options.push({
            label,
            value: String(idx)
          });
        }

        const posSelect = new StringSelectMenuBuilder()
          .setCustomId(`assign_player_pos_${clubKey}_${userId}`)
          .setPlaceholder('Pick a spot')
          .addOptions(options);

        const row = new ActionRowBuilder().addComponents(posSelect);

        return interaction.update({
          content: `Now pick a spot for ${
            userId === '__NOT_IN_VC__' ? 'a player not in VC (placeholder)' : `<@${userId}>`
          } in **${club.name}**:`,
          components: [row]
        });
      }

      // Second step of manager assignment: pick spot index (manager-only)
      if (id.startsWith('assign_player_pos_')) {
        if (!isManager(interaction.member)) {
          return interaction.reply({
            content:
              'Only captains, managers, owners, media, or admins can assign or move players.',
            ephemeral: true
          });
        }

        // Check if user is blocked
        if (isUserBlocked(guildIdSel, interaction.user.id)) {
          return interaction.reply({
            content: '🚫 You have been blocked from moving/assigning players. Contact an admin.',
            ephemeral: true
          });
        }

        const parts = id.split('_'); // ['assign','player','pos',clubKey,userId]
        const clubKey = parts[3];
        const userId = parts[4];
        const slotIndex = parseInt(interaction.values[0], 10);

        const club = getClubByKey(stateSel.clubs, clubKey);
        if (!club) {
          return interaction.reply({
            content: 'Unknown club in assignment request.',
            ephemeral: true
          });
        }

        const clubBoard = stateSel.boardState[clubKey];
        if (!clubBoard || !clubBoard.slots[slotIndex]) {
          return interaction.reply({
            content: 'Unknown spot for this club.',
            ephemeral: true
          });
        }

        // Clear any slots this user holds in this club
        clubBoard.slots.forEach((s, idx) => {
          if (s.takenBy === userId) {
            s.open = true;
            s.takenBy = null;
            handleSlotOpened(guildIdSel, clubKey, idx, s.label);
          }
        });

        // Assign to chosen slot (override previous occupant)
        const slot = clubBoard.slots[slotIndex];
        slot.open = false;
        slot.takenBy = userId;

        await refreshClubPanels(guildIdSel, clubKey);

        const playerLabel =
          userId === '__NOT_IN_VC__'
            ? 'a player not in VC (placeholder)'
            : `<@${userId}>`;

        return interaction.update({
          content: `Assigned ${playerLabel} to **${slot.label}** in **${club.name}**.`,
          components: []
        });
      }

      // vcspots: pick which club is playing in this VC
      if (id.startsWith('vcspots_pickclub_')) {
        const voiceChannelId = id.substring('vcspots_pickclub_'.length);
        const clubKey = interaction.values[0];

        const club = getClubByKey(stateSel.clubs, clubKey);
        if (!club || !club.enabled) {
          return interaction.reply({
            content: 'Unknown or disabled club selected.',
            ephemeral: true
          });
        }

        let vc;
        try {
          vc = await interaction.guild.channels.fetch(voiceChannelId);
        } catch (err) {
          console.error('⚠️ Failed to fetch voice channel for vcspots:', err);
        }

        // Try to reuse an existing panel for this VC, otherwise create one
        const existingPanel = stateSel.vcPanels[voiceChannelId];
        let panelMessage = null;

        try {
          if (existingPanel) {
            const channel = await interaction.guild.channels.fetch(
              existingPanel.textChannelId
            );
            panelMessage = await channel.messages.fetch(existingPanel.messageId);
            await panelMessage.edit({
              embeds: [buildEmbedForClub(guildIdSel, clubKey)],
              components: buildAdminComponents(guildIdSel, clubKey)
            });
          }
        } catch (err) {
          console.error(
            '⚠️ Failed to edit existing VC panel, sending a new one instead:',
            err
          );
          panelMessage = null;
        }

        if (!panelMessage) {
          panelMessage = await interaction.channel.send({
            embeds: [buildEmbedForClub(guildIdSel, clubKey)],
            components: buildAdminComponents(guildIdSel, clubKey)
          });
        }

        stateSel.vcPanels[voiceChannelId] = {
          clubKey,
          textChannelId: panelMessage.channel.id,
          messageId: panelMessage.id
        };

        // Auto-link the VC for this club
        if (!stateSel.clubVcLinks) stateSel.clubVcLinks = {};
        stateSel.clubVcLinks[clubKey] = voiceChannelId;

        return interaction.update({
          content: `Linked **${club.name}** to voice channel **${
            vc ? vc.name : 'this VC'
          }** and posted/updated the live panel in this chat.`,
          components: []
        });
      }

      // Manage players: pick which player to manage (manager-only)
      if (id.startsWith('manage_player_pick_')) {
        if (!isManager(interaction.member)) {
          return interaction.reply({
            content:
              'Only captains, managers, owners, media, or admins can remove or move players.',
            ephemeral: true
          });
        }

        // Check if user is blocked
        if (isUserBlocked(guildIdSel, interaction.user.id)) {
          return interaction.reply({
            content: '🚫 You have been blocked from moving/assigning players. Contact an admin.',
            ephemeral: true
          });
        }

        const clubKey = id.substring('manage_player_pick_'.length);
        const club = getClubByKey(stateSel.clubs, clubKey);
        if (!club) {
          return interaction.reply({
            content: 'Unknown club in manage request.',
            ephemeral: true
          });
        }

        const userId = interaction.values[0];
        const clubBoard = stateSel.boardState[clubKey];
        if (!clubBoard) {
          return interaction.reply({
            content: 'Club board not found.',
            ephemeral: true
          });
        }

        // Build slot options with numbering if duplicate labels
        const labelCounts = {};
        clubBoard.slots.forEach((slot) => {
          labelCounts[slot.label] = (labelCounts[slot.label] || 0) + 1;
        });

        const seenLabelIndex = {};
        const options = [];
        for (let idx = clubBoard.slots.length - 1; idx >= 0; idx--) {
          const slot = clubBoard.slots[idx];
          const total = labelCounts[slot.label];
          let label = slot.label;
          if (total > 1) {
            seenLabelIndex[slot.label] = (seenLabelIndex[slot.label] || 0) + 1;
            label = `${slot.label} (${seenLabelIndex[slot.label]})`;
          }
          options.push({
            label,
            value: String(idx)
          });
        }

        options.push({
          label: 'Remove from all spots',
          value: '__REMOVE__'
        });

        const posSelect = new StringSelectMenuBuilder()
          .setCustomId(`manage_player_pos_${clubKey}_${userId}`)
          .setPlaceholder('Choose a new spot or remove from all')
          .addOptions(options);

        const row = new ActionRowBuilder().addComponents(posSelect);

        return interaction.update({
          content: `Manage ${
            userId === '__NOT_IN_VC__'
              ? 'the player not in VC placeholder'
              : `<@${userId}>`
          } in **${club.name}**:`,
          components: [row]
        });
      }

      // Manage players: choose new position or remove (manager-only)
      if (id.startsWith('manage_player_pos_')) {
        if (!isManager(interaction.member)) {
          return interaction.reply({
            content:
              'Only captains, managers, owners, media, or admins can remove or move players.',
            ephemeral: true
          });
        }

        // Check if user is blocked
        if (isUserBlocked(guildIdSel, interaction.user.id)) {
          return interaction.reply({
            content: '🚫 You have been blocked from moving/assigning players. Contact an admin.',
            ephemeral: true
          });
        }

        const parts = id.split('_'); // ['manage','player','pos',clubKey,userId]
        const clubKey = parts[3];
        const userId = parts[4];
        const choice = interaction.values[0];

        const club = getClubByKey(stateSel.clubs, clubKey);
        if (!club) {
          return interaction.reply({
            content: 'Unknown club in manage request.',
            ephemeral: true
          });
        }

        const clubBoard = stateSel.boardState[clubKey];
        if (!clubBoard) {
          return interaction.reply({
            content: 'Club board not found.',
            ephemeral: true
          });
        }

        // Clear all slots this user holds in this club
        for (let i = 0; i < clubBoard.slots.length; i++) {
          const s = clubBoard.slots[i];
          if (s.takenBy === userId) {
            s.open = true;
            s.takenBy = null;
            await handleSlotOpened(guildIdSel, clubKey, i, s.label);
          }
        }

        if (choice !== '__REMOVE__') {
          const slotIndex = parseInt(choice, 10);
          const slot = clubBoard.slots[slotIndex];
          if (!slot) {
            return interaction.reply({
              content: 'Unknown position for this club.',
              ephemeral: true
            });
          }
          slot.open = false;
          slot.takenBy = userId;
        }

        await refreshClubPanels(guildIdSel, clubKey);

        if (choice === '__REMOVE__') {
          if (userId === '__NOT_IN_VC__') {
            return interaction.update({
              content: `Removed the "player not in VC" placeholder from all spots in **${club.name}**.`,
              components: []
            });
          } else {
            return interaction.update({
              content: `Removed <@${userId}> from all spots in **${club.name}**.`,
              components: []
            });
          }
        } else {
          const slotIndex = parseInt(choice, 10);
          const newSlot = clubBoard.slots[slotIndex];
          const movedLabel =
            userId === '__NOT_IN_VC__'
              ? 'the player not in VC placeholder'
              : `<@${userId}>`;

          return interaction.update({
            content: `Moved ${movedLabel} to **${newSlot.label}** in **${club.name}**.`,
            components: []
          });
        }
      }

      // Formation selection (everyone) – grouped selects
      if (id.startsWith('formation_select_')) {
        const parts = id.split('_'); // ['formation','select',clubKey,groupId]
        const clubKey = parts[2];
        const formationName = interaction.values[0];
        return setClubFormation(interaction, guildIdSel, clubKey, formationName);
      }
    }
  } catch (err) {
    console.error('❌ Error handling interaction:', err);
    if (!interaction.replied && !interaction.deferred) {
      try {
        await interaction.reply({
          content: 'Error.',
          ephemeral: true
        });
      } catch (e) {
        // ignore
      }
    }
  }
});

// When someone leaves voice, clear any slots they held in any club
client.on(Events.VoiceStateUpdate, async (oldState, newState) => {
  try {
    if (!oldState.guild || !oldState.channelId) return;
    // If they are still in *some* voice channel (moved), don't clear yet
    if (newState.channelId) return;

    const guildId = oldState.guild.id;
    const state = getGuildState(guildId);
    if (!state) return;

    const userId = oldState.id;
    const touchedClubKeys = new Set();

    for (const clubKey of Object.keys(state.boardState)) {
      const clubBoard = state.boardState[clubKey];
      if (!clubBoard || !clubBoard.slots) continue;

      let changed = false;
      for (let i = 0; i < clubBoard.slots.length; i++) {
        const slot = clubBoard.slots[i];
        if (slot && slot.takenBy === userId) {
          slot.open = true;
          slot.takenBy = null;
          changed = true;
          // Notify queue
          await handleSlotOpened(guildId, clubKey, i, slot.label);
        }
      }
      if (changed) touchedClubKeys.add(clubKey);
    }

    for (const clubKey of touchedClubKeys) {
      await refreshClubPanels(guildId, clubKey);
    }
  } catch (err) {
    console.error('❌ Error in VoiceStateUpdate handler:', err);
  }
});

// ---------- LOGIN ----------

client.login(token);
