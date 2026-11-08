import { toast as show } from "@/hooks/use-toast";

// One toast system for the whole app (the shadcn Toaster). Same call shape the pages used with sonner:
// toast.success("Saved"), toast.error("Couldn't save").
const say = (message: string, variant?: "destructive") => show({ title: message, ...(variant ? { variant } : {}) });

export const toast = Object.assign((message: string) => say(message), {
  success: (message: string) => say(message),
  info: (message: string) => say(message),
  warning: (message: string) => say(message),
  error: (message: string) => say(message, "destructive"),
});
