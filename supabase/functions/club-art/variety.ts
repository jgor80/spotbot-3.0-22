// Shot variety for every render: pose, camera, lighting, scene and (for groups) arrangement are picked
// independently, so no two cards look alike. The bot picks keys and avoids each player's recent ones
// (public/spotbot/graphics-variants.cjs, same keys); anything it leaves out is picked here at random.
// Every line keeps faces visible and adds no text, so the identity and framing rules still hold.

export const POSES = {
  ready: "WAIST-UP three-quarter portrait, shoulders turned, looking towards the camera, camera at chest height",
  stride: "FULL-BODY action shot sprinting or dribbling at speed, dynamic lean, ball at the feet, boots fully visible",
  ball: "HALF-BODY shot (from mid-thigh up) holding a football under one arm, confident expression",
  celebrate: "KNEES-UP goal celebration, both arms out or one fist raised, mouth open shouting, joyful energy",
  profile: "CLOSE CHEST-UP portrait, head and shoulders filling much of the frame, intense focused stare",
  captain: "THREE-QUARTER-LENGTH (from knees up) hands-on-hips stance, slight low camera angle",
  headshot: "TIGHT HEAD-AND-SHOULDERS school portrait, facing the camera straight on with the head tilted very slightly, relaxed smile, shoulders square, camera at eye level",
  arms_crossed: "WAIST-UP portrait with arms folded across the chest, chin slightly raised, calm confident stare into the lens",
  chest_tap: "HALF-BODY shot thumping a fist against the chest over the heart, eyes on the camera, proud expression",
  knee_slide: "FULL-BODY knee-slide celebration across the grass, arms spread wide, spray of turf, face lifted towards the camera, boots inside the frame",
  walkout: "THREE-QUARTER-LENGTH walk-out shot striding towards the camera, arms relaxed, focused game-day expression",
  shush: "WAIST-UP celebration with one finger pressed to the lips, silencing the crowd, eyes locked on the camera",
  strike: "FULL-BODY shooting follow-through, kicking leg swung high after striking the ball, arms out for balance, face visible, boots inside the frame",
  header: "KNEES-UP leaping header, rising above the frame centre to meet the ball, neck muscles tense, face visible and eyes open",
  sky_point: "KNEES-UP celebration pointing both index fingers to the sky, head tilted up and face still clearly visible",
  keepy_uppy: "HALF-BODY shot juggling the ball on one knee, relaxed half-smile, eyes glancing at the camera",
  hands_on_head: "WAIST-UP shot with both hands on the head in disbelief at a near miss, mouth open, face fully visible",
} as const;

export const CAMERAS = {
  low_hero: "low hero angle looking up at the player",
  eye_level: "straight-on eye-level camera",
  high_three_quarter: "slightly high three-quarter angle",
  dutch_tilt: "dramatic Dutch tilt of about 10 degrees",
  telephoto: "long telephoto lens with heavy background bokeh",
  wide_close: "wide-angle lens close in, exaggerated depth",
  side_on: "side-on camera with the face turned back towards the lens",
  tracking: "sideline tracking-camera shot with motion streaks in the background",
  symmetrical: "perfectly symmetrical front-on framing",
  broadcast: "pitch-side broadcast camera at chest height",
} as const;

export const LIGHTING = {
  floodlit_rim: "night floodlights with a hard rim light outlining the player",
  golden_hour: "warm golden-hour sun low across the pitch",
  overcast: "soft overcast daylight with gentle shadows",
  spotlight: "a single spotlight from above, everything else falling into shadow",
  neon_accents: "neon accent lights in the club colours",
  rain_floodlights: "rain falling through the floodlight beams, wet sheen on the kit",
  broadcast_key: "clean TV broadcast key light with a cool fill",
  backlight_flare: "strong backlight with a lens flare behind the player",
  storm: "dark storm clouds with dramatic breaks of light",
  haze: "volumetric haze with shafts of light cutting through",
} as const;

export const SCENES = {
  packed_stands: "a packed stadium bowl, the crowd a soft blur of club colours",
  tunnel: "the players' tunnel mouth with the pitch glowing beyond",
  touchline: "the touchline beside the pitch with blank, out-of-focus advertising boards",
  empty_stadium: "an empty stadium at night, rows of seats and floodlight towers",
  ultras: "the ultras end, smoke and flares in the club colours drifting behind",
  training_ground: "a training ground at dusk with cones and a goal in soft focus",
  goalmouth: "in front of a goal, the net rippling behind",
  confetti: "a final-whistle scene with confetti and streamers in the air",
  centre_circle: "the centre circle seen from pitch level, the stands rising behind",
  city_rooftop: "a rooftop above the city at night, stadium lights glowing in the distance",
} as const;

export const ARRANGEMENTS = {
  staggered: "staggered shoulders at different depths, like a magazine cover",
  v_formation: "a V formation with the front player at the point",
  arms_linked: "a line with arms around each other's shoulders",
  walking_out: "walking out side by side towards the camera",
  steps: "standing on stadium steps at different heights",
  huddle_turn: "breaking from a huddle and turning to face the camera",
  celebration_pile: "jumping and celebrating together, every face still visible",
  back_to_back: "pairs standing back to back with heads turned to the camera",
} as const;

export type Pool = Record<string, string>;
export const keysOf = (pool: Pool) => Object.keys(pool) as [string, ...string[]];

/** The line for a picked key, or a random one when the caller sent none. */
export function line(pool: Pool, key?: string | null, exclude: string[] = []): string {
  const keys = Object.keys(pool).filter((k) => !exclude.includes(k));
  return pool[key && key in pool ? key : keys[Math.floor(Math.random() * keys.length)]];
}
