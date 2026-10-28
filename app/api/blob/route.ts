import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { errorResponse, serverError, unauthorized } from "@/lib/api";
import { isAdmin } from "@/lib/auth";
import { FILE_KINDS, MAX_UPLOAD_BYTES, UNSUPPORTED_FILE_MESSAGE, fileKind } from "@/lib/files";

// Vercel Blob client-upload handshake: the browser uploads the file straight to Blob storage.
export async function POST(req: Request) {
  let body: HandleUploadBody;
  try {
    body = (await req.json()) as HandleUploadBody;
  } catch {
    return errorResponse(400, "bad_request", "The upload request couldn't be read.");
  }

  try {
    if (body.type === "blob.generate-client-token" && !isAdmin(req)) return unauthorized();

    const result = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async (pathname) => {
        const kind = fileKind(pathname);
        if (!kind) throw new Error(UNSUPPORTED_FILE_MESSAGE);
        return {
          allowedContentTypes: [...FILE_KINDS[kind]],
          maximumSizeInBytes: MAX_UPLOAD_BYTES,
          addRandomSuffix: true,
        };
      },
    });
    return Response.json(result);
  } catch (err) {
    if (err instanceof Error && err.message === UNSUPPORTED_FILE_MESSAGE) {
      return errorResponse(400, "unsupported_file", UNSUPPORTED_FILE_MESSAGE);
    }
    return serverError(err);
  }
}
