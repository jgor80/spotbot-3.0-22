// Public community meta builds (no sign-in): see handler.ts
import { createAdminClient } from "../_shared/auth.ts";
import { futDb } from "../_shared/fut/service.ts";
import { createHandler } from "./handler.ts";

const db = futDb(createAdminClient());
Deno.serve(createHandler(() => db));
