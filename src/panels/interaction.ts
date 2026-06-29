import type { Panel } from '../data/panels';

export interface InteractionPayload {
    control?: string;
    intent?: string;
    value?: unknown;
}

/** The agent-facing text for a panel interaction. Shared so chat (HTTP) and voice
 *  (WS) deliver the exact same labeled event. */
export function formatInteraction(panel: Panel, p: InteractionPayload): string {
    const control = String(p.control ?? 'a control');
    const value = p.value != null ? ` Value: ${JSON.stringify(p.value)}.` : '';
    const intent = p.intent ? ` (You set this up meaning: ${p.intent}.)` : '';
    return `[interaction] On your panel "${panel.title}", the user pressed "${control}".${value}${intent}`;
}
