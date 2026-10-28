export type CheckStatus = "ok" | "missing" | "error";
// A one-click fix the Setup check can offer for this item.
export type SetupAction = "migrate" | "create-index";
export type Check = { name: string; status: CheckStatus; detail: string; action?: SetupAction };
export type SetupReport = { environment: string; settings: Check[]; services: Check[] };
