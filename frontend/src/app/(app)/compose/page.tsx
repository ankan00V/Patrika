import type { Metadata } from "next";
import { ComposeForm } from "@/components/compose/ComposeForm";

export const metadata: Metadata = { title: "Compose" };

export default function ComposePage() {
  return <ComposeForm />;
}
