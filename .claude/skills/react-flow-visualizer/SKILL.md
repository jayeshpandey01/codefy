---
name: react-flow-visualizer
description: Use when building or modifying the interactive attack-path / data-flow graph in packages/ui — @xyflow/react node and edge components, elkjs auto-layout, or rendering a TaintTrace as a visual diagram.
---

# React Flow Visualizer (packages/ui)

Guidance for the visual attack-path diagram — the part of WhoAmI that turns a `TaintTrace` (from [[taint-engine]]) into an interactive graph a developer can actually read.

## Stack

- `@xyflow/react` — rendering, pan/zoom, selection, custom nodes/edges.
- `elkjs` — layout engine. React Flow does **not** auto-layout; elkjs computes node positions before they're handed to `<ReactFlow>`.

## Core rules

1. **Graph shape comes from `@whoami/types`, not from ad-hoc props.** `GraphNode`/`GraphEdge` are defined once in packages/types; the visualizer maps them to React Flow's `Node`/`Edge` shape at the boundary, it doesn't invent its own graph model.
2. **Layout is computed off the render path.** Run elkjs on the TaintTrace → GraphNode/Edge list once (on data change), memoize the positioned result, then pass static positions into `<ReactFlow>`. Don't re-run elkjs on every render/pan/zoom.
3. **One custom node type per Finding severity/role**, not per individual finding. A "source" node, "sink" node, "sanitizer" node, "passthrough" node — reused components driven by props, not bespoke components per vulnerability class.
4. **Edges represent data flow direction, not just connectivity.** Source → sink direction must be visually unambiguous (arrowheads, consistent left-to-right or top-to-bottom elk layout direction) since the whole point is showing propagation.
5. **The graph is read-only for now** — clicking a node opens/focuses the corresponding finding card (see the bridge in [[webview-bridge]]); it does not mutate source. Don't build editing affordances that aren't asked for.

## elkjs layout pattern

```
TaintTrace nodes/edges
  → map to elkjs graph format (id, width/height estimate, children, edges)
  → elk.layout(graph)  // async
  → map elk's computed x/y back onto React Flow Node.position
  → render <ReactFlow nodes={positioned} edges={edges} nodeTypes={...} />
```

Keep the elk options (`elk.algorithm: 'layered'`, direction, spacing) in one shared config file — don't scatter layout tuning across components.

## Where this lives

- `packages/ui/src/visualization/` — graph container, elkjs adapter, custom node/edge components.
- `packages/ui/src/components/` — finding cards, list views (non-graph UI).

## Performance notes

- Large traces (many hops) should collapse intermediate passthrough nodes by default with an expand affordance — don't force the developer to parse a 30-node chain to find the source and sink.
- Virtualize/limit rendering for workspaces with many simultaneous findings; the graph view shows one trace at a time, not the whole findings list overlaid.

## Related

- [[taint-engine]] — produces the TaintTrace data this visualizes.
- [[webview-bridge]] — delivers Finding/TaintTrace data from core to this UI, and carries node-click events back out.
