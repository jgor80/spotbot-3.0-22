const url = process.env.SUPABASE_URL?.replace(/\/$/, '') ?? 'http://localhost:54321'
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!serviceRoleKey) {
  console.error('Missing SUPABASE_SERVICE_ROLE_KEY in environment.')
  process.exit(1)
}

const syncType = process.env.SYNC_TYPE ?? 'full'
const probeHidden = process.env.EA_PROBE_HIDDEN === 'true'

const body = { sync_type: syncType }
if (probeHidden) body.probe_hidden = true

const response = await fetch(`${url}/functions/v1/sync-ea-stats`, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${serviceRoleKey}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify(body)
})

const text = await response.text()
const prefix = response.ok ? 'Sync completed' : 'Sync failed'
console.log(`${prefix} (status ${response.status}):`)
console.log(text)
