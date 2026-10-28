import type { Metadata } from "next";
import { AskView } from "./AskView";

export const metadata: Metadata = { title: "Ask · AML Compass" };

export default function AskPage() {
  return <AskView />;
}
