/** A tool-execution event emitted during a run, mirrored to the dispatch row +
 *  realtime so the web shows live per-tool status. */
export interface AgentActivity {
    id: string;
    status: 'running' | 'success' | 'error';
    details: {
        display_name: string;
        fn_name: string;
        args: Record<string, unknown>;
        result: unknown;
    };
}
