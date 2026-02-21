import OpenAI from 'openai';
import { OPENROUTER_BASE_URL } from '../config.js';

const EMBEDDING_MODEL = 'openai/text-embedding-3-small';

let client: OpenAI | null = null;

function getClient(): OpenAI {
    if (!client) {
        const apiKey = process.env.OPENROUTER_API_KEY;
        if (!apiKey) throw new Error('OPENROUTER_API_KEY required for embeddings');

        client = new OpenAI({
            baseURL: OPENROUTER_BASE_URL,
            apiKey,
        });
    }
    return client;
}

export async function embed(text: string): Promise<number[]> {
    const openai = getClient();
    const response = await openai.embeddings.create({
        model: EMBEDDING_MODEL,
        input: text.slice(0, 8000),
    });

    return response.data[0].embedding;
}

export async function embedBatch(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];

    const openai = getClient();
    const truncated = texts.map((t) => t.slice(0, 8000));
    const response = await openai.embeddings.create({
        model: EMBEDDING_MODEL,
        input: truncated,
    });

    return response.data.sort((a, b) => a.index - b.index).map((d) => d.embedding);
}
