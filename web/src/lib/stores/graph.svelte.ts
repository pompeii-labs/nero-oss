import { getGraph, type GraphData } from '$lib/actions/graph';

export type ToolFire = { name: string; seq: number };

function createGraphStore() {
    let graphData = $state<GraphData | null>(null);
    let activatedNodeIds = $state<number[]>([]);
    let toolFires = $state<ToolFire[]>([]);
    let pollInterval: ReturnType<typeof setInterval> | null = null;
    let toolSeq = 0;

    async function refresh() {
        const result = await getGraph();
        if (result.success) {
            graphData = result.data;
        }
    }

    function fireNodes(ids: number[]) {
        activatedNodeIds = [...activatedNodeIds, ...ids];
        setTimeout(() => {
            activatedNodeIds = activatedNodeIds.filter((id) => !ids.includes(id));
        }, 2000);
    }

    function fireToolName(name: string) {
        const entry: ToolFire = { name, seq: toolSeq++ };
        toolFires = [...toolFires, entry];
        setTimeout(() => {
            toolFires = toolFires.filter((e) => e.seq !== entry.seq);
        }, 2000);
    }

    function startPolling(intervalMs = 30000) {
        if (pollInterval) return;
        refresh();
        pollInterval = setInterval(refresh, intervalMs);
    }

    function stopPolling() {
        if (pollInterval) {
            clearInterval(pollInterval);
            pollInterval = null;
        }
    }

    return {
        get graphData() {
            return graphData;
        },
        get activatedNodeIds() {
            return activatedNodeIds;
        },
        get toolFires() {
            return toolFires;
        },
        refresh,
        fireNodes,
        fireToolName,
        startPolling,
        stopPolling,
    };
}

export const graph = createGraphStore();
