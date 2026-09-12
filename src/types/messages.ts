import type { GraphNode, TraverseDirection } from "@/types/graph"

/**
 * Every message that crosses a context boundary.
 *
 * The values are the literal strings put on the wire, so treat them as a
 * stable protocol: after an extension reload, content scripts injected by the
 * *previous* build keep running in already-open tabs and will send the old
 * strings until those tabs are reloaded.
 */
export const MESSAGE_TYPES = {
  /** Popup → background. */
  GET_GRAPH: "GET_GRAPH",
  /** Popup → background. */
  SET_ACTIVE_NODE: "SET_ACTIVE_NODE",
  /** Content script → background. */
  NAVIGATION_PUSH: "NAVIGATION_PUSH",
  /** Content script → background. */
  NAVIGATION_TRAVERSE: "NAVIGATION_TRAVERSE",
  /** Background → extension pages. */
  GRAPH_UPDATED: "GRAPH_UPDATED"
} as const

export type MessageType = (typeof MESSAGE_TYPES)[keyof typeof MESSAGE_TYPES]

/** Reply to a {@link MESSAGE_TYPES.GET_GRAPH} request. */
export type GetGraphResponse = {
  /** Every node across every tab; callers filter by `tabId` themselves. */
  graph: GraphNode[]
  activeNodeId: string
}

/**
 * The wire contract: each message type paired with its payload and its reply.
 *
 * `request` holds the payload *without* the `type` discriminant — {@link
 * MessageOf} adds that from the key, so the two can never disagree. A `void`
 * response marks a fire-and-forget message that never replies.
 */
type MessageMapping = {
  [MESSAGE_TYPES.GET_GRAPH]: {
    request: { tabId: number }
    response: GetGraphResponse
  }
  [MESSAGE_TYPES.SET_ACTIVE_NODE]: {
    /**
     * Asks the background to move `tabId` to `nodeId`. The background decides
     * how: a real `history.go()` traversal when the node is still in the tab's
     * stack, or a fresh navigation (creating a revisit node) when Chrome has
     * already discarded that entry.
     */
    request: { tabId: number; nodeId: string }
    response: void
  }
  [MESSAGE_TYPES.NAVIGATION_PUSH]: {
    /**
     * A same-document (SPA) navigation observed by the content script.
     * `webNavigation.onCommitted` never fires for these, so this message is
     * the only way they reach the graph.
     */
    request: { url: string }
    response: void
  }
  [MESSAGE_TYPES.NAVIGATION_TRAVERSE]: {
    /**
     * A back/forward traversal observed by the content script. Only fires when
     * the destination is same-origin with the current document — the
     * Navigation API suppresses the event for cross-origin traversals — so the
     * background must not depend on this arriving.
     *
     * `internalNodeId` is set when the extension itself caused the traversal
     * via `history.go()`, carrying the node it aimed at. Non-null means the
     * background already moved the cursor in `Graph.targetNode` and should
     * only verify where it landed, never step again.
     */
    request: { direction: TraverseDirection; internalNodeId: string | null }
    response: void
  }
  [MESSAGE_TYPES.GRAPH_UPDATED]: {
    /** Broadcast after the graph changes, so open pages refetch. */
    request: { tabId: number }
    response: void
  }
}

/**
 * The on-the-wire form of one or more message types: payload plus discriminant.
 *
 * Distributes over unions, so `MessageOf<"A" | "B">` is a discriminated union
 * of both rather than an unsound mix of one's payload with the other's type.
 */
export type MessageOf<K extends MessageType> = K extends MessageType
  ? MessageMapping[K]["request"] & { type: K }
  : never

/** Any message on the wire, in either direction. */
export type Message = MessageOf<MessageType>

/** Resolves the response type for a given message. */
export type ResponseFor<M extends Message> =
  MessageMapping[M["type"]]["response"]

/**
 * Message types the background service worker accepts. A runtime list so
 * listeners can reject anything else on the shared bus; the matching types are
 * derived from it, so the list and the types cannot drift.
 */
export const BACKGROUND_MESSAGE_TYPES = [
  MESSAGE_TYPES.GET_GRAPH,
  MESSAGE_TYPES.SET_ACTIVE_NODE,
  MESSAGE_TYPES.NAVIGATION_PUSH,
  MESSAGE_TYPES.NAVIGATION_TRAVERSE
] as const satisfies readonly MessageType[]

/** Message types extension pages (popup, options, newtab) accept. */
export const EXTENSION_PAGE_MESSAGE_TYPES = [
  MESSAGE_TYPES.GRAPH_UPDATED
] as const satisfies readonly MessageType[]

/** Messages the background service worker can receive. */
export type BackgroundMessage = MessageOf<
  (typeof BACKGROUND_MESSAGE_TYPES)[number]
>

/**  Messages extension pages can receive. */
export type ExtensionPageMessage = MessageOf<
  (typeof EXTENSION_PAGE_MESSAGE_TYPES)[number]
>
