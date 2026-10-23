import { AuthGate } from "@/components/layout/AuthGate";
import { SlackResultToast } from "@/components/slack/SlackResultToast";

/** Everything below requires a signed-in user. */
export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <AuthGate>
      <SlackResultToast />
      {children}
    </AuthGate>
  );
}
