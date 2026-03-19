import { PompeiiAgent } from '@pompeii-ai/sdk';
import type { Nero, ToolActivity } from '../agent/nero.js';
import { Logger } from '../util/logger.js';

const logger = new Logger('Pompeii');

let pompeiiAgent: PompeiiAgent | null = null;

export async function connectPompeii(agent: Nero): Promise<PompeiiAgent> {
    const apiKey = process.env.POMPEII_API_KEY;
    if (!apiKey) throw new Error('POMPEII_API_KEY is required');

    pompeiiAgent = new PompeiiAgent({
        apiKey,
        baseUrl: process.env.POMPEII_API_URL || undefined,
    });

    const handler = async (ctx: any) => {
        const body = ctx.payload;
        const userName = body.message?.user_name || 'User';
        const content = body.message?.content || '';

        logger.info(`From ${userName}: ${content.slice(0, 50)}${content.length > 50 ? '...' : ''}`);

        agent.setMedium('pompeii');
        agent.setPompeiiConversationId(body.conversation_id);

        agent.setActivityCallback((activity: ToolActivity) => {
            ctx.activity({
                tool: activity.tool,
                display_name: activity.displayName,
                status: activity.status,
                args: activity.args,
                result: activity.result,
                error: activity.error,
            });
        });

        try {
            let message = content;
            if (body.context && body.context.length > 0) {
                const contextLines = body.context
                    .map((c: any) => `${c.user_name}: ${c.content}`)
                    .join('\n');
                message = `[Conversation context]\n${contextLines}\n\n${content}`;
            }

            const onChunk = (chunk: string) => {
                ctx.stream(chunk);
            };

            const response = await agent.chat(message, onChunk);
            ctx.done(response.content);
            logger.info('Response complete');
        } catch (error) {
            const err = error as Error;
            logger.error(`Error: ${err.message}`);
            ctx.error(err.message);
        } finally {
            agent.setActivityCallback(undefined);
            agent.setPompeiiConversationId(null);
        }
    };

    pompeiiAgent.on('mention', handler);
    pompeiiAgent.on('dm', handler);

    pompeiiAgent.on('connected', () => logger.info('Connected to Pompeii realtime'));
    pompeiiAgent.on('disconnected', ({ code, reason }: any) =>
        logger.warn(`Disconnected from Pompeii: ${code} ${reason}`),
    );
    pompeiiAgent.on('reconnecting', ({ attempt }: any) =>
        logger.info(`Reconnecting to Pompeii (attempt ${attempt})`),
    );

    await pompeiiAgent.connect();
    logger.success('Pompeii realtime agent is online');

    return pompeiiAgent;
}

export function disconnectPompeii(): void {
    pompeiiAgent?.disconnect();
    pompeiiAgent = null;
}

export function getPompeiiAgent(): PompeiiAgent | null {
    return pompeiiAgent;
}
