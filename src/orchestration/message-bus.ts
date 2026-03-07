import type { SpecialistMessage } from './specialist.js';

/**
 * Message Bus for inter-agent communication.
 *
 * Specialists use this to communicate with each other during orchestration.
 * This enables collaboration where one specialist's output feeds into another's input.
 */
export class MessageBus {
    private handlers: Map<string, (message: SpecialistMessage) => void> = new Map();
    private messageHistory: SpecialistMessage[] = [];

    /**
     * Register a handler for a specific specialist
     */
    register(specialistId: string, handler: (message: SpecialistMessage) => void): void {
        this.handlers.set(specialistId, handler);
    }

    /**
     * Unregister a specialist
     */
    unregister(specialistId: string): void {
        this.handlers.delete(specialistId);
    }

    /**
     * Send a message to a specific specialist
     */
    async send(message: SpecialistMessage): Promise<void> {
        this.messageHistory.push(message);

        if (message.to === 'broadcast') {
            // Send to all registered handlers
            for (const [id, handler] of this.handlers) {
                if (id !== message.from) {
                    handler(message);
                }
            }
        } else {
            // Send to specific recipient
            const handler = this.handlers.get(message.to);
            if (handler) {
                handler(message);
            }
        }
    }

    /**
     * Get message history for a session
     */
    getHistory(sessionId?: string): SpecialistMessage[] {
        if (sessionId) {
            // In a real implementation, messages would be tagged with session ID
            return this.messageHistory;
        }
        return this.messageHistory;
    }

    /**
     * Clear message history
     */
    clear(): void {
        this.messageHistory = [];
    }
}

// Singleton instance
let bus: MessageBus | null = null;

export function getMessageBus(): MessageBus {
    if (!bus) {
        bus = new MessageBus();
    }
    return bus;
}
