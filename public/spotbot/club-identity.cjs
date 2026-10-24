// Club identity: the voice, newspaper and hometown each club picks for itself, stored on the club
// (club.identity) next to club.kit and club.autopilot. Everything the Chronicle, the AI writer and
// the Fun Zone used to hard-code for Palermo reads from here, so any club can get the same depth.
// Clubs that never picked keep the original Palermo look: the Italian sports-daily voice.

const VOICE_KEYS = ['italian', 'british', 'american', 'spanish', 'plain'];
const DEFAULT_VOICE = 'italian';

const RULES =
  "Teasing the opponent is fine; never mock our own players. No stock phrases repeated from story to story.";
const GAGS =
  " When an opponent's name invites it, slip in one cheeky innuendo or pun on it (PG-13, aimed at the club name only, never at real people, gender, race or bodies); if no gag is genuinely funny, skip it.";

const VOICES = {
  italian: {
    label: 'Italian sports daily',
    emoji: '🇮🇹',
    desc: 'Operatic and passionate: Mamma mia! Catenaccio! Forza!',
    outlet: (city) => `Gazzetta di ${city}`,
    columnist: { name: 'Enzo Bellini', title: 'Il Commento' },
    overheard: {
      win: ["the espresso machine in the manager's office has been running non-stop.", 'someone is playing music way too loud in the dressing room. Nobody is complaining.', 'the kit man was seen kissing the match ball. Twice.'],
      loss: ['the video room is booked for a long session tomorrow.', 'nobody touched the post-match cannoli.', 'the tactics board has been turned to face the wall.'],
      mixed: ['"We take the points and we go again." Classic.', 'the whiteboard in the tactics room has been wiped and redrawn twice.', 'two senior players are arguing about the best pizza in town. Again.'],
    },
    style:
      'Write like an original columnist for an Italian sports daily (think Gazzetta dello Sport): operatic, passionate, a little melodramatic, with a few natural Italian words or exclamations (mamma mia, che partita, catenaccio, fantasista, tifosi, forza) but never a whole sentence in Italian.',
    kickers: {
      demolition: ['MAMMA MIA!', 'CHE SPETTACOLO!'],
      lockdown: ['CATENACCIO!', 'PORTA CHIUSA'],
      shootout: ['CHE PARTITA!', 'PAZZESCO!'],
      'smash-and-grab': ["FURTO D'AUTORE", 'COLPO GROSSO'],
      'arm-wrestle': ['SOFFERENZA!', 'CUORE E BATTICUORE'],
      heartbreaker: ['CHE BEFFA', 'AMARO IN BOCCA'],
      stalemate: ['ZERO A ZERO', 'NOIA? NO, TATTICA'],
      'trade-off': ['PAREGGIO', 'UN PUNTO A TESTA'],
      collapse: ['NOTTE FONDA', 'DISASTRO'],
      win: ['VITTORIA!', 'TRE PUNTI'],
      loss: ['SCONFITTA', 'SI RIPARTE'],
    },
    flavor: {
      demolition: ' Mamma mia: over by half time in spirit, if not on the clock.',
      lockdown: ' Pure catenaccio; the opposition barely got a sniff.',
      shootout: ' Che partita! Defending was optional; entertainment was not.',
      'smash-and-grab': ' A robbery, and a beautiful one.',
      heartbreaker: ' One moment either way and this is a different column. Che beffa.',
      collapse: ' The film session will be long, and the espresso strong.',
      stalemate: ' Two goalkeepers will sleep well tonight.',
    },
    signOff: {
      win: (c) => [`Forza ${c}!`, `Avanti così, ${c}.`, `Che serata. Forza ${c}!`, `Tre punti, zero dubbi. Forza ${c}!`, `Pop the prosecco, ${c}.`, `Bellissimo, ${c}. Bellissimo.`],
      draw: (c) => [`Un punto è un punto. Avanti, ${c}.`, `Pazienza. Si continua, ${c}.`, `Half a cannoli is still a cannoli, ${c}.`, `Così così, ${c}.`],
      loss: (c) => [`Testa alta, ${c}. Si riparte.`, `Domani è un altro giorno, ${c}.`, `Chin up, ${c}. The espresso is still hot.`, `Pazienza, ${c}. Next one.`],
    },
  },
  british: {
    label: 'British back pages',
    emoji: '🇬🇧',
    desc: 'Tabloid puns and terrace banter: GET IN! Daylight robbery!',
    outlet: (city) => `The ${city} Evening Post`,
    columnist: { name: 'Reg Hollis', title: 'From the Terraces' },
    overheard: {
      win: ['the dressing room speaker is on its third play of the same song. Nobody minds.', 'the gaffer was spotted smiling. Witnesses are being interviewed.', 'someone has ordered a celebratory curry for the whole squad.'],
      loss: ['the kettle in the gaffer\'s office has not stopped boiling.', 'the video room is booked for a long session tomorrow.', 'the post-match pies went untouched.'],
      mixed: ['"We go again." Of course we do.', 'the tactics board has been wiped and redrawn twice.', 'a heated debate about who should take free kicks is ongoing.'],
    },
    style:
      "Write like a British back-page tabloid football writer: punchy, pun-loving, terrace banter, British spelling and football slang (gaffer, worldie, bottled it, scenes, get in) without overdoing it.",
    kickers: {
      demolition: ['GET IN!', 'SCENES!'],
      lockdown: ['SHUT OUT!', 'NOTHING DOING'],
      shootout: ['GOAL FEST!', 'BONKERS!'],
      'smash-and-grab': ['DAYLIGHT ROBBERY', 'SMASH AND GRAB'],
      'arm-wrestle': ['SQUEAKY BUM TIME', 'HANGING ON'],
      heartbreaker: ['GUTTED', 'SO CLOSE'],
      stalemate: ['BORE DRAW?', 'STALEMATE'],
      'trade-off': ['HONOURS EVEN', 'A POINT APIECE'],
      collapse: ['SHAMBLES', 'ONE TO FORGET'],
      win: ['THREE POINTS', 'JOB DONE'],
      loss: ['BEATEN', 'BACK TO THE DRAWING BOARD'],
    },
    flavor: {
      demolition: ' Game over by half time; the rest was a lap of honour.',
      lockdown: ' Parked the bus and polished it; the opposition barely got a sniff.',
      shootout: ' Defending was optional; entertainment was not.',
      'smash-and-grab': ' Daylight robbery, and nobody here is complaining.',
      heartbreaker: ' Fine margins, and this column could have read very differently.',
      collapse: ' The gaffer will want words, and a long video session.',
      stalemate: ' Two goalkeepers will sleep well tonight.',
    },
    signOff: {
      win: (c) => [`Up the ${c}!`, `Get in, ${c}.`, `Scenes. Come on ${c}!`],
      draw: (c) => [`A point's a point, ${c}.`, `We go again, ${c}.`],
      loss: (c) => [`Heads up, ${c}. We go again.`, `Onwards, ${c}.`],
    },
  },
  american: {
    label: 'American beat writer',
    emoji: '🇺🇸',
    desc: 'Box-score storytelling, momentum and grit, ESPN-style.',
    outlet: (city) => `${city} Daily Herald`,
    columnist: { name: 'Dana Brooks', title: 'Postgame Notebook' },
    overheard: {
      win: ['the locker room playlist has been turned up to eleven.', 'somebody ordered wings for the whole squad.', 'the film room is quiet tonight. Nobody needs it.'],
      loss: ['the film room is booked for a long session tomorrow.', 'the postgame pizza went cold.', 'the whiteboard still has the game plan on it. Nobody is looking at it.'],
      mixed: ['"Next man up." You know the drill.', 'the whiteboard in the war room has been wiped and redrawn twice.', 'the group chat has gone suspiciously quiet.'],
    },
    style:
      'Write like an American sports beat writer (think ESPN or The Athletic): crisp, confident, stats-forward storytelling about momentum, grit and clutch moments, with natural American sports phrasing.',
    kickers: {
      demolition: ['BLOWOUT!', 'STATEMENT WIN'],
      lockdown: ['SHUTOUT', 'LOCKED DOWN'],
      shootout: ['SHOOTOUT!', 'BACK-AND-FORTH'],
      'smash-and-grab': ['STOLEN!', 'HEIST'],
      'arm-wrestle': ['GRIND IT OUT', 'CLUTCH'],
      heartbreaker: ['SO CLOSE', 'HEARTBREAK'],
      stalemate: ['DEADLOCK', 'SCORELESS'],
      'trade-off': ['SPLIT DECISION', 'EVEN STEVEN'],
      collapse: ['ROUGH NIGHT', 'OFF NIGHT'],
      win: ['WIN', 'IN THE BOOKS'],
      loss: ['SETBACK', 'RESET'],
    },
    flavor: {
      demolition: ' It was over by halftime in spirit, if not on the clock.',
      lockdown: ' The opposition barely got a look.',
      shootout: ' Defense was optional; entertainment was not.',
      'smash-and-grab': ' A heist, and a clean one.',
      heartbreaker: ' One play either way and this is a different story.',
      collapse: ' The film session will be long.',
      stalemate: ' Two goalkeepers will sleep well tonight.',
    },
    signOff: {
      win: (c) => [`Let's go, ${c}!`, `On to the next one, ${c}.`],
      draw: (c) => [`Bank the point, ${c}.`, `Back to work, ${c}.`],
      loss: (c) => [`Heads up, ${c}. Next game.`, `Short memory, ${c}.`],
    },
  },
  spanish: {
    label: 'Spanish sports daily',
    emoji: '🇪🇸',
    desc: 'Marca-style drama: ¡Golazo! ¡Qué partido! ¡Vamos!',
    outlet: (city) => `Diario Deportivo de ${city}`,
    columnist: { name: 'Paco Ferrer', title: 'La Columna' },
    overheard: {
      win: ['the dressing room speaker is blasting reggaetón. Nobody is complaining.', 'the café machine has not stopped since full time.', 'someone has started a conga line. Again.'],
      loss: ['the video room is booked for a long session tomorrow.', 'the post-match tortilla went untouched.', 'the tactics board has been turned to face the wall.'],
      mixed: ['"A seguir." The only way.', 'the tactics board has been wiped and redrawn twice.', 'a debate about the best paella in town is getting out of hand.'],
    },
    style:
      'Write like an original columnist for a Spanish sports daily (think Marca or AS): dramatic, emotional, a little hyperbolic, with a few natural Spanish words or exclamations (golazo, qué partido, remontada, afición, vamos) but never a whole sentence in Spanish.',
    kickers: {
      demolition: ['¡GOLEADA!', '¡QUÉ ESPECTÁCULO!'],
      lockdown: ['¡MURALLA!', 'PORTERÍA A CERO'],
      shootout: ['¡QUÉ PARTIDO!', '¡LOCURA!'],
      'smash-and-grab': ['¡ATRACO!', 'GOLPE MAESTRO'],
      'arm-wrestle': ['¡SUFRIMIENTO!', 'A PULSO'],
      heartbreaker: ['¡QUÉ PENA!', 'POR UN GOL'],
      stalemate: ['CERO A CERO', 'EMPATE TÁCTICO'],
      'trade-off': ['EMPATE', 'REPARTO DE PUNTOS'],
      collapse: ['NOCHE NEGRA', '¡DESASTRE!'],
      win: ['¡VICTORIA!', 'TRES PUNTOS'],
      loss: ['DERROTA', 'A LEVANTARSE'],
    },
    flavor: {
      demolition: ' ¡Goleada! Over by half time in spirit, if not on the clock.',
      lockdown: ' A wall at the back; the opposition barely got a sniff.',
      shootout: ' ¡Qué partido! Defending was optional; entertainment was not.',
      'smash-and-grab': ' An atraco, and a beautiful one.',
      heartbreaker: ' One moment either way and this is a different column. Qué pena.',
      collapse: ' The film session will be long, and the café strong.',
      stalemate: ' Two goalkeepers will sleep well tonight.',
    },
    signOff: {
      win: (c) => [`¡Vamos ${c}!`, `¡Aúpa ${c}!`],
      draw: (c) => [`Un punto es un punto, ${c}.`, `A seguir, ${c}.`],
      loss: (c) => [`Cabeza alta, ${c}.`, `Mañana será otro día, ${c}.`],
    },
  },
  plain: {
    label: 'Straight news',
    emoji: '📰',
    desc: 'Clean, neutral match reporting with no accent or slang.',
    outlet: (city) => `${city} Sports Desk`,
    columnist: { name: 'The Desk', title: 'Analysis' },
    overheard: {
      win: ['the dressing room music got noticeably louder after full time.', 'spirits are high in the squad chat.'],
      loss: ['the video room is booked for a long session tomorrow.', 'the squad chat has gone quiet.'],
      mixed: ['"We go again." Fair enough.', 'the tactics board has been wiped and redrawn twice.'],
    },
    style: 'Write clean, neutral, professional sports reporting: clear and lively, but with no regional slang or foreign words.',
    kickers: {},
    flavor: {
      demolition: ' It was over by half time in spirit, if not on the clock.',
      lockdown: ' The opposition barely got a sniff.',
      shootout: ' Defending was optional; entertainment was not.',
      heartbreaker: ' One moment either way and this is a different column.',
      collapse: ' The film session will be long.',
      stalemate: ' Two goalkeepers will sleep well tonight.',
    },
    signOff: null,
  },
};

// Older clubs named Palermo keep their hometown; everyone else falls back to their club name
function defaultCity(club) {
  return /palermo/i.test(club?.name || '') ? 'Palermo' : (club?.name || 'the club');
}

// The club's identity with every default filled in
function identityOf(club) {
  const saved = club?.identity || {};
  const voice = VOICE_KEYS.includes(saved.voice) ? saved.voice : DEFAULT_VOICE;
  const city = String(saved.home_city || '').trim() || defaultCity(club);
  const paper = String(saved.paper_name || '').trim() || `The ${club?.name || 'Club'} Chronicle`;
  return { voice, city, paper, nameJokes: saved.name_jokes !== false, def: VOICES[voice], picked: !!saved.voice };
}

// The AI writer's tone line for this club
function aiStyle(club) {
  const id = identityOf(club);
  return `${id.def.style}${id.nameJokes ? GAGS : ''} ${RULES}`;
}

module.exports = { VOICES, VOICE_KEYS, DEFAULT_VOICE, identityOf, aiStyle };
