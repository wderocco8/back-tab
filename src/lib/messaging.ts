import {
  type Message,
  type MessageOf,
  type MessageType,
  type ResponseFor
} from "@/types/messages"

/**
 * Narrows a value off the `chrome.runtime` bus to one of `allowed`.
 *
 * Listeners receive whatever any part of the extension broadcasts, so their
 * parameter is genuinely `unknown`. Annotating it with a message type instead
 * would be an unchecked assertion — and would narrow the discriminant before
 * the runtime check, making that necessary check look redundant.
 *
 * Only the discriminant is verified, not the payload. Since the extension sets
 * no `externally_connectable`, every sender is one of our own contexts; the
 * realistic mismatch is a stale content script from a previous build, which
 * this catches whenever the message *type* changed. A schema validator would
 * additionally catch a familiar type carrying an outdated payload — worth
 * revisiting if the protocol ever gets versioned across releases.
 *
 * @param value Untrusted value from a message listener.
 * @param allowed Message types this listener handles.
 * @returns The narrowed message, or null if it isn't one of `allowed`.
 */
export function parseMessage<K extends MessageType>(
  value: unknown,
  allowed: readonly K[]
): MessageOf<K> | null {
  if (typeof value !== "object" || value === null) return null
  const { type } = value as { type?: unknown }
  if (typeof type !== "string") return null
  return (allowed as readonly string[]).includes(type)
    ? (value as MessageOf<K>)
    : null
}

/**
 * Type-safe wrapper around `chrome.runtime.sendMessage`.
 *
 * Constrains the payload to a known {@link Message} and infers the reply type
 * from the message's `type`, so a handler can't read a field the sender never
 * sends.
 *
 * @param message Message to send.
 * @param onResponse Called with the reply. Omit for fire-and-forget messages —
 * their response type is `void`.
 */
export function sendMessage<M extends Message>(
  message: M,
  onResponse?: (response: ResponseFor<M>) => void
): void {
  if (onResponse) {
    chrome.runtime.sendMessage(message, onResponse)
    return
  }

  // Fire-and-forget. The background listener returns `true` for every message
  // it handles, which holds the port open and then closes it unanswered — that
  // rejects. Nothing is waiting on these, so swallow it rather than surface an
  // unhandled rejection on every navigation.
  void chrome.runtime.sendMessage(message).catch(() => {})
}
