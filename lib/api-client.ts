// Browser helpers for the JSON error shape { error: { code, message } }.

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export async function apiError(res: Response, fallback: string): Promise<ApiError> {
  try {
    const body = (await res.json()) as { error?: { code?: string; message?: string } };
    return new ApiError(res.status, body.error?.code ?? "error", body.error?.message ?? fallback);
  } catch {
    return new ApiError(res.status, "error", fallback);
  }
}
