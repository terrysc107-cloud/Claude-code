import * as React from "react";
import { cn } from "@/lib/utils";

interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "green" | "amber" | "red" | "outline";
}

function Badge({ className, variant = "default", ...props }: BadgeProps) {
  const variants = {
    default: "bg-surface-2 text-text-secondary border-border",
    green: "bg-accent-green/10 text-accent-green border-accent-green/30",
    amber: "bg-accent-amber/10 text-accent-amber border-accent-amber/30",
    red: "bg-accent-red/10 text-accent-red border-accent-red/30",
    outline: "border-border text-text-secondary",
  };

  return (
    <div
      className={cn(
        "inline-flex items-center rounded-sm border px-2 py-0.5 text-xs font-mono font-semibold transition-colors",
        variants[variant],
        className
      )}
      {...props}
    />
  );
}

export { Badge };
