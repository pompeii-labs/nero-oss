/** The component tree Nero throws into a panel. Kept in sync with the
 *  `create_panel` tool's documented schema on the server. */

// A button press is either an interaction Nero receives as a labeled event, or a
// `call` that runs one of the panel's named server-side functions (no LLM turn).
export type PanelAction =
    | { type: 'interact'; intent?: string; value?: unknown }
    | { type: 'call'; fn: string };

// Any dynamic field can be a literal or a binding to panel state ({"bind":"key"}),
// which lets a `call` patch the state and have the component update live.
export type Bind = { bind: string };
export type Str = string | Bind;
export type Num = number | Bind;

export type Comp =
    | { type: 'text'; text: Str; variant?: 'title' | 'heading' | 'body' | 'caption' | 'mono' }
    | {
          type: 'button';
          label: string;
          variant?: 'primary' | 'default' | 'ghost' | 'danger';
          action?: PanelAction;
      }
    | { type: 'image'; src: Str; alt?: string; height?: number; fit?: 'cover' | 'contain' }
    | { type: 'youtube'; videoId: Str; start?: number; autoplay?: boolean; cmd?: Bind }
    | { type: 'browser'; session: string; url?: string }
    | { type: 'metric'; label: Str; value: Str; sub?: Str }
    | {
          type: 'chart';
          data?: number[] | Bind;
          value?: Num;
          window?: number;
          sampleMs?: number;
          kind?: 'line' | 'area' | 'bar';
          height?: number;
          min?: number;
          max?: number;
      }
    | { type: 'progress'; label?: Str; value: Num; max?: number }
    | { type: 'list'; items: string[] | Bind; ordered?: boolean }
    | { type: 'badge'; text: Str; tone?: 'info' | 'good' | 'warn' | 'bad' }
    | { type: 'divider' }
    | { type: 'row'; children: Comp[]; gap?: number; align?: 'start' | 'center' | 'end' }
    | { type: 'stack'; children: Comp[]; gap?: number };

/** Resolve a possibly-bound value against panel state. */
export function resolve<T>(v: T | Bind, state: Record<string, unknown>): T | undefined {
    if (v && typeof v === 'object' && 'bind' in (v as object)) {
        return state[(v as Bind).bind] as T | undefined;
    }
    return v as T;
}
