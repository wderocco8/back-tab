# Scenarios

## Scenario 1 (normal new URL)

- type link and hit enter
- page updates
- `navigation-tracker` detects the `currentEntry` and sends message to background
- background sees the corresponding nodeId is in neither `TabStack` nor `Graph`
  - this is a brand new node
  - adds node to graph
  - clears `TabStack` beyond `cursor`
  - adds node to `TabStack`
  - tells popuop to refresh graph

## Scenario 2 (click to node in graph and stack)

- click on node using `Graph`
- `background` worker sees node is IN `TabStack` (and `Graph`)
- runs `history.go` with `delta` derived from diff between cursor and index of node
- `navigation-tracker` detects the `currentEntry` and sends message to background
- `background` worker sees node is IN `TabStack` (and `Graph`)
  - updates `cursor` to indexOf node
  - tells popuop to refresh graph

## Scenario 3 (click to node in graph but not in stack)

- click on node using `Graph`
- `background` worker sees node is NOT IN `TabStack` (but in `Graph`)
- runs `chrome.tabs.update`
- `navigation-tracker` detects the `currentEntry` and sends message to background
- `background` worker sees node is NOT IN `TabStack` (but in `Graph`)
  - clears `TabStack` beyond `cursor`
  - adds node to `TabStack`
  - tells popuop to refresh graph
