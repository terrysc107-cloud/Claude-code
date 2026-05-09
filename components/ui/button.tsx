import * as React from "react";
import { cn } from "@/lib/utils";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "ghost" | "outline" | "green";
  size?: "sm" | "md" | "lg";
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", size = "md", ...props }, ref) => {
    const variants = {
      default:
        "bg-surface-2 text-text-primary border border-border hover:border-accent-green/50 hover:text-accent-green",
      ghost: "text-text-secondary hover:text-text-primary hover:bg-surface-2",
      outline:
        "border border-border text-text-primary hover:bg-surface-2",
      green:
        "bg-accent-green/10 text-accent-green border border-accent-green/30 hover:bg-accent-green/20",
    };

    const sizes = {
      sm: "px-2 py-1 text-xs",
      md: "px-3 py-1.5 text-sm",
      lg: "px-4 py-2 text-base",
    };

    return (
      <button
        ref={ref}
        className={cn(
          "inline-flex items-center justify-center gap-2 rounded-sm font-mono font-medium transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed",
          variants[variant],
          sizes[size],
          className
        )}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button };
