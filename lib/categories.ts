export const CATEGORIES = ["FATF report", "Indian AML rules", "Internal SOP", "Other"] as const;
export type Category = (typeof CATEGORIES)[number];
