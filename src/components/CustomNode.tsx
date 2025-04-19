import {
  TooltipContent,
  TooltipNode,
  TooltipTrigger
} from "@/components/tooltip-node"
import { Handle, Position, type NodeProps } from "@xyflow/react"
import React, { memo } from "react"

const CustomNode = memo(({ data, selected }: NodeProps) => {  
  return (
    <TooltipNode selected={selected}>
      {/* TODO: fix data?.url type errors */}
      <TooltipContent position={Position.Top}>{String(data?.url)}</TooltipContent>
      <TooltipTrigger>
        <Handle type="target" position={Position.Top} />
        <Handle type="source" position={Position.Bottom} />
      </TooltipTrigger>
    </TooltipNode>
  )
})

export default CustomNode
