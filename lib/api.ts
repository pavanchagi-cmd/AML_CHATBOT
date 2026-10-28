import { MissingEnvError } from "@/lib/env";

// Every API error has the same shape: { error: { code, message } } with a plain-language message.
export function errorResponse(status: number, code: string, message: string) {
  return Response.json({ error: { code, message } }, { status });
}

export const unauthorized = () =>
  errorResponse(401, "unauthorized", "Enter the admin passcode to upload, delete or re-index documents.");

export function serverError(err: unknown) {
  if (err instanceof MissingEnvError) {
    console.error(err.message);
    return errorResponse(500, "not_configured", "The app isn't fully set up yet. An admin can run the Setup check in the Library to see what's missing.");
  }
  console.error(err instanceof Error ? err.message : err);
  return errorResponse(500, "server_error", "Something went wrong. Try again in a minute.");
}
