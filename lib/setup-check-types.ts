export type CheckStatus = "ok" | "missing" | "error";
export type Check = { name: string; status: CheckStatus; detail: string };
export type SetupReport = { environment: string; settings: Check[]; services: Check[] };
