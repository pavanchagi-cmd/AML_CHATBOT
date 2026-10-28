import { del, get, put } from "@vercel/blob";

// Documents may be internal SOPs, so files are stored as private blobs (readable only with the store token).
export const BLOB_ACCESS = "private" as const;

// Only URLs in a Vercel Blob store are accepted, so the server never fetches an arbitrary address.
export function isBlobStoreUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname.endsWith(".blob.vercel-storage.com");
  } catch {
    return false;
  }
}

export async function downloadBlob(url: string): Promise<{ data: Uint8Array; contentType: string }> {
  if (!isBlobStoreUrl(url)) throw new Error("Not a Vercel Blob URL.");
  const res = await get(url, { access: BLOB_ACCESS, useCache: false });
  if (!res || res.statusCode !== 200) throw new Error("The uploaded file could not be found. Upload it again.");
  const data = new Uint8Array(await new Response(res.stream).arrayBuffer());
  return { data, contentType: res.blob.contentType };
}

export async function uploadBlob(pathname: string, body: Buffer, contentType: string) {
  return put(pathname, body, { access: BLOB_ACCESS, addRandomSuffix: true, contentType });
}

export async function deleteBlob(url: string) {
  if (isBlobStoreUrl(url)) await del(url);
}
