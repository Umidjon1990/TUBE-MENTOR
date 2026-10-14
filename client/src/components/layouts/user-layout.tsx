import type { ReactNode } from "react";
import { useAuth } from "@/hooks/use-auth";
import { LearningShell } from "@/components/learning-shell";
export default function UserLayout({
  children,
  title,
  subtitle,
  headerExtra,
}: {
  children: ReactNode;
  title: string;
  subtitle?: string;
  noPadding?: boolean;
  headerExtra?: ReactNode;
}) {
  const { user } = useAuth();
  return (
    <LearningShell studio={user?.role !== "student"} title={title}>
      <div className="legacy-tools">
        {subtitle && <p className="muted">{subtitle}</p>}
        {headerExtra}
        {children}
      </div>
    </LearningShell>
  );
}
