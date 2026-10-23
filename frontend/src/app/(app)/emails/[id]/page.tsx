import type { Metadata } from "next";
import { EmailDetailView } from "@/components/emails/EmailDetailView";

export const metadata: Metadata = { title: "Email" };

export default async function EmailPage({ params }: PageProps<"/emails/[id]">) {
  const { id } = await params;
  return <EmailDetailView id={id} />;
}
