import { ManageBody, managePhotos } from './manage.ts';

Deno.test('photo management rejects another player before any database access', async () => {
  const result = await managePhotos({}, { action: 'delete', requester_id: '12345', discord_user_id: '67890', photo_asset_id: '11111111-1111-4111-8111-111111111111' });
  if (result.status !== 403) throw new Error('Owner check missing');
});

Deno.test('photo management validates photo UUIDs and pagination', () => {
  if (ManageBody.safeParse({ action: 'delete', requester_id: '12345', discord_user_id: '12345', photo_asset_id: 'bad' }).success) throw new Error('Invalid UUID accepted');
  if (ManageBody.safeParse({ action: 'list', requester_id: '12345', discord_user_id: '12345', offset: -1 }).success) throw new Error('Invalid offset accepted');
});

Deno.test('deleting the last original photo removes storage, owner-scoped source and compatibility fallback', async () => {
  const calls: string[] = [];
  const photo = { id: '11111111-1111-4111-8111-111111111111', storage_path: 'owner/original.png', image_url: 'old' };
  const db = {
    from(table: string) {
      let deleting = false;
      const query = {
        select() { return query; },
        delete() { deleting = true; calls.push(`delete:${table}`); return query; },
        eq(column: string, value: string) { calls.push(`${table}:${column}=${value}`); return query; },
        order() { return query; }, limit() { return query; },
        maybeSingle() { return Promise.resolve({ data: calls.filter(c => c === 'pro_photo_assets:id=' + photo.id).length && !calls.includes('delete:pro_photo_assets') ? photo : null, error: null }); },
        then(resolve: (value: unknown) => unknown) { return Promise.resolve({ data: null, error: deleting ? null : 'unexpected' }).then(resolve); },
      };
      return query;
    },
    storage: { from() { return { remove(paths: string[]) { calls.push(`storage:${paths.join(',')}`); return Promise.resolve({ error: null }); } }; } },
  };
  const result = await managePhotos(db, { action: 'delete', requester_id: '12345', discord_user_id: '12345', photo_asset_id: photo.id });
  if (result.status !== 200 || !('deleted' in result.body) || !result.body.deleted) throw new Error('Deletion failed');
  for (const expected of ['storage:owner/original.png', 'delete:pro_photo_assets', 'delete:pro_photos', 'pro_photo_assets:source_kind=upload', 'pro_photo_assets:discord_user_id=12345']) {
    if (!calls.includes(expected)) throw new Error(`Missing ${expected}`);
  }
});