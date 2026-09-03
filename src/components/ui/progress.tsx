import * as React from "react";
import { cn, clamp } from "@/lib/utils";

type ProgressProps = React.HTMLAttributes<HTMLDivElement> & {
  value: number;
};

function Progress({ value, className, ...props }: ProgressProps) {
  return (
    <div
      className={cn("h-2 w-full overflow-hidden rounded-sm bg-muted", className)}
      {...props}
    >
      <div
        className="h-full bg-studio-cyan transition-all"
        style={{ width: `${clamp(value, 0, 100)}%` }}
      />
    </div>
  );
}

export { Progress };
