import { ARRANGEMENTS, CAMERAS, LIGHTING, SCENES, line } from './variety.ts';

export type TeamReference = { file: File; kitNumber: number | null; userId: string; name?: string | null; description?: string | null };

// Rear-facing shots show the number but no face, so a group render would have to invent the face.
export { isRearFacing } from './photo-selection.ts';

// Look description without kit details (every player is redressed in the club kit anyway).
function look(description?: string | null) {
  const d = (description || '').replace(/\s+/g, ' ').trim();
  return d ? d.slice(0, 260) : '';
}

export function teamPrompt(b: { kind: string; club_name: string; mood: string; pose: string; variation?: string; competition?: string; camera?: string; lighting?: string; scene?: string; arrangement?: string }, refs: TeamReference[], styleLook: string, kit: string) {
  const identities = refs.map((r, i) => {
    const who = r.name ? ` (${r.name})` : '';
    const traits = look(r.description);
    return `Reference image ${i + 1} is player ${i + 1}${who}: copy that player's own face, skin tone, hair colour and style, beard, glasses, headwear, tattoos and accessories exactly from image ${i + 1} only.${traits ? ` Player ${i + 1}'s look: ${traits}` : ''} ${r.kitNumber ? `Only player ${i + 1} may wear verified number ${r.kitNumber}, and only if their face is also clearly visible as player ${i + 1}.` : `Player ${i + 1} must have no shirt or shorts number.`}`;
  }).join(' ');
  const action = b.kind === 'banner' || b.mood === 'win'
    ? 'A shared team celebration. Players interact naturally, cheering together; reuse each uploaded celebration as their signature move where visible. For a banner, gather around a large trophy on a stage.'
    : b.mood === 'loss' ? 'A united, determined team regrouping, focused expressions and calm poses.'
    : b.pose === 'stride' ? 'A dynamic squad moving forward together with varied running and ball-control poses.'
    : 'An editorial squad portrait with varied relaxed and captain stances; never clone one posture across every player.';
  const separation = 'IDENTITY LOCK: likeness has priority over pose and style; each player must be instantly recognisable as the character in their own uploaded image. Preserve each original face geometry, nose and jaw, beard length and colour, moustache shape, glasses frame and lens tint. Do not replace sports glasses with ordinary eyeglasses. Keep identity-defining colours unchanged by vintage grading. Each player is a separate person. Never move, swap, merge or duplicate beards, facial hair colour, glasses or visors, headbands, hair colour, tattoos or gloves between players; a trait belongs only to the player whose reference shows it. Do not add glasses, beards or tattoos to a player whose reference lacks them, and do not remove them from a player whose reference has them. Every player faces the camera or three-quarters so their face is recognisable; no player shown from behind.';
  return `Team-focused artwork for ${b.club_name}${b.competition ? ` · ${b.competition}` : ''}. Show exactly ${refs.length} distinct saved players together in the foreground, one per reference, not a single featured player with anonymous filler. ${identities} ${separation} ${kit} Apply the same club kit to every player regardless of reference clothing. Preserve EA FC Virtual Pro 3D game-engine materials, never humanize them. ${action} Style: ${styleLook}. Creative edition ${b.variation || 'team'}. Camera: ${line(CAMERAS, b.camera)}. Lighting: ${line(LIGHTING, b.lighting)}, blended into the style. ${b.kind === 'banner' ? '' : `Background: ${line(SCENES, b.scene, b.mood === 'loss' ? ['confetti'] : [])}. Arrangement: ${line(ARRANGEMENTS, b.arrangement, b.mood === 'loss' ? ['celebration_pile'] : [])}. `} ${b.kind === 'banner' ? 'Wide landscape composition: group and trophy in the upper two thirds, lower third clear for lettering.' : 'Vertical composition: staggered group across the upper half, all faces within the top half, lower third clear for lettering.'} Every head, hair, face and visible hand must be fully inside the frame with clear margins; no faces hidden behind other players. Players stay opaque in front of all background effects. No text, letters, logos or watermarks; no numbers except the individually verified kit numbers specified above. Do not copy reference backgrounds or typography.`;
}

export function appendReferences(form: FormData, refs: { file: File }[]) {
  for (const ref of refs) form.append(refs.length > 1 ? 'image[]' : 'image', ref.file);
}
