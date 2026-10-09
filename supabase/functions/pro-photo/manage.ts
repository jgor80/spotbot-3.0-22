import { z } from "npm:zod@3";

const discordId = z.string().regex(/^\d{5,25}$/);
export const ManageBody = z.discriminatedUnion("action", [
  z.object({ action: z.literal("list"), discord_user_id: discordId, requester_id: discordId, offset: z.number().int().min(0).max(10000).default(0) }),
  z.object({ action: z.literal("delete"), discord_user_id: discordId, requester_id: discordId, photo_asset_id: z.string().uuid() }),
]);

// The authenticated bot supplies requester_id from interaction.user.id, never from a selected player.
// deno-lint-ignore no-explicit-any
export async function managePhotos(db: any, body: z.infer<typeof ManageBody>) {
  if (body.requester_id !== body.discord_user_id) return { status: 403, body: { error: "You can only manage your own pro photos." } };
  const owner = body.requester_id;
  if (body.action === "list") {
    const { data, count, error } = await db.from("pro_photo_assets")
      .select("id,storage_path,image_url,pose,analysis,created_at", { count: "exact" })
      .eq("discord_user_id", owner).eq("source_kind", "upload")
      .order("created_at", { ascending: false }).order("id").range(body.offset, body.offset);
    if (error) return { status: 500, body: { error: "Couldn't load your photos." } };
    const photo = data?.[0];
    if (!photo) return { status: 200, body: { photo: null, total: count ?? 0 } };
    const signed = await db.storage.from("pro-photos").createSignedUrl(photo.storage_path, 600);
    if (signed.error) return { status: 500, body: { error: "Couldn't open this photo." } };
    return { status: 200, body: { photo: { id: photo.id, image_url: signed.data.signedUrl, pose: photo.pose, description: photo.analysis?.description ?? null, created_at: photo.created_at }, total: count ?? 0 } };
  }
  const { data: photo, error: readError } = await db.from("pro_photo_assets")
    .select("id,storage_path,image_url").eq("id", body.photo_asset_id).eq("discord_user_id", owner).eq("source_kind", "upload").maybeSingle();
  if (readError) return { status: 500, body: { error: "Couldn't check this photo." } };
  if (!photo) return { status: 404, body: { error: "Photo not found in your original uploads." } };
  // Remove the actual private object as well as the reference. Saved cards and Discord posts are untouched.
  const { error: storageError } = await db.storage.from("pro-photos").remove([photo.storage_path]);
  if (storageError) return { status: 500, body: { error: "Couldn't delete the photo. Please try again." } };
  const { error: deleteError } = await db.from("pro_photo_assets").delete().eq("id", photo.id).eq("discord_user_id", owner).eq("source_kind", "upload");
  if (deleteError) return { status: 500, body: { error: "Couldn't remove the saved photo reference. Please try again." } };
  // Clear the compatibility record first: the deleted upload must never return as a fallback.
  const { error: clearError } = await db.from("pro_photos").delete().eq("discord_user_id", owner);
  if (clearError) return { status: 500, body: { error: "Photo removed, but couldn't refresh your profile photo. Please try again." } };
  const { data: remaining, error: remainingError } = await db.from("pro_photo_assets")
    .select("guild_id,discord_user_id,submitted_by,image_url,analysis").eq("discord_user_id", owner).eq("source_kind", "upload")
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (remainingError) return { status: 500, body: { error: "Photo removed, but couldn't refresh your remaining photos." } };
  if (remaining) {
    const a = remaining.analysis ?? {};
    const { error } = await db.from("pro_photos").upsert({
      guild_id: remaining.guild_id, discord_user_id: owner, submitted_by: remaining.submitted_by,
      image_url: remaining.image_url, analysis: a, position: a.position ?? null, overall: a.overall ?? null, archetype: a.archetype ?? null,
    }, { onConflict: "discord_user_id" });
    if (error) return { status: 500, body: { error: "Photo removed, but couldn't update your profile preview." } };
  }
  return { status: 200, body: { deleted: true, has_photos: !!remaining } };
}