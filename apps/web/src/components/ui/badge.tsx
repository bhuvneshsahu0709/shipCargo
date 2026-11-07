import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium", {
  variants: {
    variant: {
      neutral: "bg-surface-muted text-muted-foreground border-border",
      navy: "bg-navy-50 text-navy-900 border-navy-900/15",
      teal: "bg-teal-50 text-teal-600 border-teal-600/20",
      amber: "bg-amber-50 text-amber-600 border-amber-600/20",
      red: "bg-red-50 text-red-600 border-red-600/20",
    },
  },
  defaultVariants: { variant: "neutral" },
});

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant, className }))} {...props} />;
}
