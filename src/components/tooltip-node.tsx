import { BaseNode } from "@/components/base-node"
import {
  NodeToolbar,
  type NodeProps,
  type NodeToolbarProps
} from "@xyflow/react"
import React, {
  createContext,
  forwardRef,
  useCallback,
  useContext,
  useState,
  type HTMLAttributes,
  type ReactNode
} from "react"

/* TOOLTIP CONTEXT ---------------------------------------------------------- */

const TooltipContext = createContext(false)

/* TOOLTIP NODE ------------------------------------------------------------- */

export type TooltipNodeProps = Partial<NodeProps> & {
  children?: ReactNode
}

/**
 * A component that wraps a node and provides tooltip visibility context.
 */
export const TooltipNode = forwardRef<HTMLDivElement, TooltipNodeProps>(
  ({ selected, children }, ref) => {
    const [isTooltipVisible, setTooltipVisible] = useState(false)

    const showTooltip = useCallback(() => setTooltipVisible(true), [])
    const hideTooltip = useCallback(() => setTooltipVisible(false), [])

    return (
      <TooltipContext.Provider value={isTooltipVisible}>
        <BaseNode
          ref={ref}
          onMouseEnter={showTooltip}
          onMouseLeave={hideTooltip}
          onFocus={showTooltip}
          onBlur={hideTooltip}
          tabIndex={0}
          selected={selected}>
          {children}
        </BaseNode>
      </TooltipContext.Provider>
    )
  }
)

TooltipNode.displayName = "TooltipNode"

/* TOOLTIP CONTENT ---------------------------------------------------------- */

export type TooltipContentProps = NodeToolbarProps

/**
 * A component that displays the tooltip content based on visibility context.
 */
export const TooltipContent = forwardRef<HTMLDivElement, TooltipContentProps>(
  ({ position, children }, ref) => {
    const isTooltipVisible = useContext(TooltipContext)

    return (
      <div ref={ref}>
        <NodeToolbar
          isVisible={isTooltipVisible}
          className="rounded-sm bg-primary p-2 text-primary-foreground"
          tabIndex={1}
          position={position}>
          {children}
        </NodeToolbar>
      </div>
    )
  }
)

TooltipContent.displayName = "TooltipContent"

/* TOOLTIP TRIGGER ---------------------------------------------------------- */

export type TooltipTriggerProps = HTMLAttributes<HTMLParagraphElement>

/**
 * A component that triggers the tooltip visibility.
 */
export const TooltipTrigger = forwardRef<
  HTMLParagraphElement,
  TooltipTriggerProps
>(({ children, ...props }, ref) => {
  return (
    <div ref={ref} {...props}>
      {children}
    </div>
  )
})

TooltipTrigger.displayName = "TooltipTrigger"
