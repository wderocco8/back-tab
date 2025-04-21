import { cn } from "@/lib/utils"
import { forwardRef, type HTMLAttributes } from "react"

export const BaseNode = forwardRef<
  HTMLDivElement,
  HTMLAttributes<HTMLDivElement> & { selected?: boolean, isActive?: boolean }
>(({ className, selected, isActive, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "relative rounded-md border bg-card p-5 text-card-foreground",
      className,
      selected ? "border-muted-foreground shadow-lg" : "",
      isActive ? "border-red-500 ring-2 ring-red-300" : "",
      "hover:ring-1"
    )}
    tabIndex={0}
    {...props}
  />
))

BaseNode.displayName = "BaseNode"
