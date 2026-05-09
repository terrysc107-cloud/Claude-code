import * as React from "react";
import { cn } from "@/lib/utils";

interface ProgressProps extends React.HTMLAttributes<HTMLDivElement> {
  value: number;
  max?: number;
  color?: "green" | "amber" | "red";
}

function Progress({
  className,
  value,
  max = 100,
  color = "green",
  ...props
}: ProgressProps) {
  const percentage = Math.min((value / max) * 100, 100);

  const colors = {
    green: "bg-accent-green",
    amber: "bg-accent-amber",
    red: "bg-accent-red",
  };

  return (
    <div
      className={cn(
        "relative h-1 w-full overflow-hidden rounded-full bg-surface-2",
        className
      )}
      {...props}
    >
      <div
        className={cn("h-full rounded-full transition-all duration-500", colors[color])}
        style={{ width: `${percentage}%` }}
      />
    </div>
  );
}

export { Progress };
