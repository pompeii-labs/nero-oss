import { NeroClient, ActivityEvent } from './index.js';
import { Logger } from '../util/logger.js';
import type {
    LoadedMessage,
    PermissionCallback,
    ActivityCallback,
    ToolActivity,
} from '../agent/nero.js';

export class NeroProxy {
    private client: NeroClient;
    private logger = new Logger('Proxy');
    private activityCallback?: ActivityCallback;
    private permissionCallback?: PermissionCallback;
    private loadedMessages: LoadedMessage[] = [];
    private hasSummary = false;
    private cachedMcpTools: string[] = [];
    private cachedContext: { tokens: number; limit: number; percentage: number } = {
        tokens: 0,
        limit: 180000,
        percentage: 0,
    };
    private cwd?: string;

    constructor(serviceUrl: string, cwd?: string, licenseKey?: string) {
        this.client = new NeroClient({ baseUrl: serviceUrl, licenseKey });
        this.cwd = cwd;
    }

    async setup(): Promise<void> {
        const context = await this.client.getContext();
        this.cachedContext = {
            tokens: context.tokens,
            limit: context.limit,
            percentage: context.percentage,
        };
        this.cachedMcpTools = context.mcpTools;
        this.logger.info(`Connected to service (${context.percentage}% context used)`);

        const history = await this.client.getHistory();
        this.loadedMessages = history.messages;
        this.hasSummary = history.hasSummary;
        if (history.messages.length > 0) {
            this.logger.info(
                `Loaded ${history.messages.length} messages${history.hasSummary ? ' (with summary)' : ''}`,
            );
        }
    }

    async cleanup(): Promise<void> {
        // Nothing to clean up for client
    }

    async chat(
        message: string,
        onChunk?: (chunk: string) => void,
    ): Promise<{ content: string; streamed: boolean }> {
        const handlePermission = async (id: string, activity: ActivityEvent) => {
            if (!this.permissionCallback) {
                await this.client.respondToPermission(id, true);
                return;
            }

            const toolActivity: ToolActivity = {
                id: activity.id,
                tool: activity.tool,
                args: activity.args as Record<string, any>,
                status: activity.status,
                result: activity.result,
                error: activity.error,
            };

            const approved = await this.permissionCallback(toolActivity);
            await this.client.respondToPermission(id, approved);
        };

        const response = await this.client.chat(
            message,
            (chunk) => onChunk?.(chunk),
            (activity) => this.activityCallback?.(activity),
            this.cwd,
            handlePermission,
        );

        return response;
    }

    setActivityCallback(cb: ActivityCallback): void {
        this.activityCallback = cb;
    }

    setPermissionCallback(cb: PermissionCallback): void {
        this.permissionCallback = cb;
    }

    getLoadedMessages(): LoadedMessage[] {
        return this.loadedMessages;
    }

    hasPreviousSummary(): boolean {
        return this.hasSummary;
    }

    clearHistory(): void {
        // TODO: Call service endpoint to clear history
        this.logger.warn('clearHistory not yet implemented for service mode');
    }

    setModel(model: string): void {
        // TODO: Call service endpoint to set model
        this.logger.warn('setModel not yet implemented for service mode');
    }

    async getMemories(): Promise<Array<{ body: string; created_at: string }>> {
        // TODO: Call service endpoint
        return [];
    }

    async getActions(): Promise<Array<{ request: string; timestamp: string }>> {
        // TODO: Call service endpoint
        return [];
    }

    getMcpToolNames(): string[] {
        // TODO: Get from context endpoint
        return this.cachedMcpTools;
    }

    async performCompaction(): Promise<string> {
        const result = await this.client.compact();
        return result.summary;
    }

    async getMessageHistory(
        limit = 20,
    ): Promise<Array<{ role: string; content: string; created_at: string }>> {
        // TODO: Call service endpoint
        return [];
    }

    getContextUsage(): { tokens: number; limit: number; percentage: number } {
        return this.cachedContext;
    }

    async runThink(
        onStatus?: (status: string) => void,
    ): Promise<{ thought: string | null; urgent: boolean }> {
        return this.client.think((activity) => this.activityCallback?.(activity), onStatus);
    }
}
