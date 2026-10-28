import { issueSignedToken } from "@vercel/blob";
import { handleUploadPresigned, type HandleUploadPresignedBody } from "@vercel/blob/client";
import { errorResponse, serverError, unauthorized } from "@/lib/api";
import { isAdmin } from "@/lib/auth";
import { blobCredentialsConfigured, isAllowedUploadPath } from "@/lib/blob";
import { FILE_KINDS, MAX_UPLOAD_BYTES, UNSUPPORTED_FILE_MESSAGE, fileKind } from "@/lib/files";

const UPLOAD_WINDOW_MS = 15 * 60 * 1000;

// Presigned client upload: the browser asks for a short-lived URL, then sends the file straight to
// Vercel Blob. Works with OIDC-connected stores (BLOB_STORE_ID) and with BLOB_READ_WRITE_TOKEN.
export async function POST(req: Request) {
  let body: HandleUploadPresignedBody;
  try {
    body = (await req.json()) as HandleUploadPresignedBody;
  } catch {
    return errorResponse(400, "bad_request", "The upload request couldn't be read.");
  }
  // The app records uploads through /api/ingest, so it never registers completion callbacks.
  if (body?.type !== "blob.generate-presigned-url") {
    return errorResponse(400, "bad_request", "Unsupported upload request.");
  }

  try {
    if (!isAdmin(req)) return unauthorized();
    if (!blobCredentialsConfigured()) {
      return errorResponse(
        503,
        "blob_not_configured",
        "File storage isn't connected. Connect a Vercel Blob store to this project (Storage tab), then redeploy.",
      );
    }
    const { pathname } = body.payload;
    const kind = fileKind(pathname);
    if (!kind || !isAllowedUploadPath(pathname)) {
      return errorResponse(400, "unsupported_file", UNSUPPORTED_FILE_MESSAGE);
    }
    const constraints = {
      allowedContentTypes: [...FILE_KINDS[kind]],
      maximumSizeInBytes: MAX_UPLOAD_BYTES,
      validUntil: Date.now() + UPLOAD_WINDOW_MS,
    };

    const result = await handleUploadPresigned({
      body,
      request: req,
      // Only checked for presence by the SDK; it verifies completion callbacks, which this route rejects above.
      webhookPublicKey: process.env.BLOB_WEBHOOK_PUBLIC_KEY ?? "unused-no-completion-callbacks",
      getSignedToken: async () => ({
        // Upload-only, for this one path, with the type and size limits.
        token: await issueSignedToken({ pathname, operations: ["put"], ...constraints }),
        urlOptions: { ...constraints, allowOverwrite: false },
      }),
    });
    return Response.json(result);
  } catch (err) {
    return serverError(err);
  }
}
