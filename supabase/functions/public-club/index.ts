// Public club lookup (no sign-in): see handler.ts
import { handle } from "./handler.ts";

Deno.serve(handle);
