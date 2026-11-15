// Public transfer board (no sign-in): see handler.ts
import { createAdminClient } from "../_shared/auth.ts";
import { createHandler } from "./handler.ts";

const db = createAdminClient();
Deno.serve(createHandler(() => db));
