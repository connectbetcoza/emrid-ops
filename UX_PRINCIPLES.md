# EMRID Operations — UX Principles

> The product philosophy. These principles are **frozen** at Sprint 4. Every future decision — a feature, a screen, a control — must be justifiable against them. When two principles tension, the one higher in this list wins. Benchmarks: Linear, Arc, Raycast, Superhuman, Notion.

## The product in one line
EMRID Operations is the operating system for protecting lives. Its job is to move every customer toward **Protected** with the least operator effort.

## Principles

1. **Every click reduces work.** A click that doesn't advance real work is a defect. Prefer one decisive action over a sequence of navigations.

2. **Operators should never wonder what to do next.** The interface always surfaces the next action — Mission Control shows priorities, queues hand over work, the Workspace presents the action. "What now?" is a design failure.

3. **Search before navigation.** ⌘K is the fastest path anywhere. The command palette is the primary navigation system; the sidebar is the map, not the route.

4. **Queues deliver work; they don't own it.** A queue is a filtered view of Work Items that drops the operator into the Workspace. Work lives in the Work Engine, never in a queue.

5. **The Workspace is the product.** Work is understood and completed in the one Customer Workspace. Most future effort refines the Workspace rather than adding screens. Before building a new screen, ask: *can this happen in the Workspace?*

6. **Mission Control provides priorities, not reports.** It answers what/who needs attention, what's next, and whether we're becoming more protected — then gets out of the way. It is a command centre, not a dashboard of charts.

7. **Progress over reports.** Show movement toward protection and the work that creates it, not static metrics. Numbers exist to explain why Protected Lives is moving.

8. **One customer. One workspace. One queue. One source of truth.** There is one Customer Workspace, one Queue framework, one Work Engine. No per-domain customer views, no bespoke queues. Sameness is a feature: operators learn one surface.

9. **Whitespace over density.** Calm beats crowded. Remove anything that doesn't help complete meaningful work. If it exists "in case we need it later," remove it.

10. **Automation before AI.** Solve with deterministic rules and good defaults first; reserve AI for where it clearly outperforms. Engines are deterministic today and swappable for richer/LLM logic later — behind the same contracts.

11. **Honest affordances.** Nothing pretends to work. Mock/unwired actions say so (toast feedback, "mock" pills). Trust is built by never misleading the operator.

12. **Standardise behaviour.** The same interaction means the same thing everywhere — a status chip, a work action, a queue row, a keyboard shortcut. Consistency lowers cognitive load more than cleverness.

13. **Accessible and keyboard-first.** Every workflow is reachable and operable from the keyboard, with visible focus, semantic structure, and motion that respects `prefers-reduced-motion`. Fast for power users *is* accessible.

14. **Protection is the point.** Every surface, queue, and action ultimately moves a customer toward Protected. If a feature doesn't, question why it exists.

## How to apply these in review
For any screen or control, ask:
- Does it answer one clear question / advance one clear action?
- Can it be simpler, or removed?
- Does it make the next step obvious?
- Does it reuse the one Workspace / one Queue / one Work Engine, or invent a parallel concept?
- Is it honest about what is and isn't wired?

If a change can't be defended against the list above, it doesn't ship.
