import { getServerUrl } from './helpers';

export type Conversation = {
    id: string;
    title?: string;
    preview?: string;
    created_at: string;
    message_count?: number;
};

export type HistoryMessage = {
    role: 'user' | 'assistant' | 'system';
    content: string;
    timestamp?: string;
};

type HistoryResponse = {
    messages: HistoryMessage[];
    hasSummary: boolean;
};

export async function getConversations(): Promise<{ success: boolean; data: Conversation[] }> {
    try {
        const url = getServerUrl('/history');
        const response = await fetch(url);

        if (!response.ok) {
            return { success: false, data: [] };
        }

        const data: HistoryResponse = await response.json();

        if (!data.messages || data.messages.length === 0) {
            return { success: true, data: [] };
        }

        const messagesByDay = new Map<string, HistoryMessage[]>();

        for (const msg of data.messages) {
            const dateStr = msg.timestamp
                ? new Date(msg.timestamp).toDateString()
                : new Date().toDateString();
            const existing = messagesByDay.get(dateStr) || [];
            existing.push(msg);
            messagesByDay.set(dateStr, existing);
        }

        const conversations: Conversation[] = [];
        let id = 1;

        for (const [dateStr, messages] of messagesByDay) {
            const userMessages = messages.filter((m) => m.role === 'user');
            const firstUserMsg = userMessages[0]?.content || 'Conversation';

            conversations.push({
                id: String(id++),
                title: firstUserMsg.slice(0, 50) + (firstUserMsg.length > 50 ? '...' : ''),
                preview: userMessages
                    .slice(1)
                    .map((m) => m.content)
                    .join(' ')
                    .slice(0, 100),
                created_at: messages[0]?.timestamp || new Date(dateStr).toISOString(),
                message_count: messages.length,
            });
        }

        return { success: true, data: conversations };
    } catch {
        return { success: false, data: [] };
    }
}

export async function deleteConversation(id: string): Promise<{ success: boolean }> {
    return { success: false };
}
