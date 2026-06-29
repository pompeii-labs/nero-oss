import { post } from './helpers';

/** Answer an ask Nero is blocked on: one entry per question. */
export function answerQuestion(id: string, answers: string[][]): Promise<unknown> {
    return post(`/v1/ask/${id}/answer`, { answers });
}

export function dismissQuestion(id: string): Promise<unknown> {
    return post(`/v1/ask/${id}/answer`, { dismiss: true });
}
