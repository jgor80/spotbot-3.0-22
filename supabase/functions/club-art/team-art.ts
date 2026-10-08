export type TeamReference = { file: File; kitNumber: number | null; userId: string };

export function teamPrompt(b: { kind: string; club_name: string; mood: string; pose: string; variation?: string; competition?: string }, refs: TeamReference[], look: string, kit: string) {
  const identities = refs.map((r, i) => `Reference image ${i + 1} is player ${i + 1}: preserve that player's own face, skin tone, hair, beard, glasses and accessories without mixing identities. ${r.kitNumber ? `Only this player may wear verified number ${r.kitNumber}.` : 'This player must have no shirt or shorts number.'}`).join(' ');
  const action = b.kind === 'banner' || b.mood === 'win'
    ? 'A shared team celebration. Players interact naturally, cheering together; reuse each uploaded celebration as their signature move where visible. For a banner, gather around a large trophy on a stage.'
    : b.mood === 'loss' ? 'A united, determined team regrouping, focused expressions and calm poses.'
    : b.pose === 'stride' ? 'A dynamic squad moving forward together with varied running and ball-control poses.'
    : 'An editorial squad portrait with staggered shoulders, varied relaxed and captain stances; never clone one posture across every player.';
  return `Team-focused artwork for ${b.club_name}${b.competition ? ` · ${b.competition}` : ''}. Show exactly ${refs.length} distinct saved players together in the foreground, one per reference, not a single featured player with anonymous filler. ${identities} ${kit} Apply the same club kit to every player regardless of reference clothing. Preserve EA FC Virtual Pro 3D game-engine materials, never humanize them. ${action} Style: ${look}. Creative edition ${b.variation || 'team'}: vary camera, player arrangement and lighting. ${b.kind === 'banner' ? 'Wide landscape composition: group and trophy in the upper two thirds, lower third clear for lettering.' : 'Vertical composition: staggered group across the upper half, all faces within the top half, lower third clear for lettering.'} Every head, hair, face and visible hand must be fully inside the frame with clear margins; no faces hidden behind other players. Players stay opaque in front of all background effects. No text, letters, logos or watermarks; no numbers except the individually verified kit numbers specified above. Do not copy reference backgrounds or typography.`;
}

export function appendReferences(form: FormData, refs: { file: File }[]) {
  for (const ref of refs) form.append(refs.length > 1 ? 'image[]' : 'image', ref.file);
}