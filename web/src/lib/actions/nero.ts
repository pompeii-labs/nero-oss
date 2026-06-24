import { post } from './helpers';

export interface AttachmentUpload {
    data: string; // base64
    name: string;
    mimeType: string;
}

/** Kick off a dispatch. Returns the dispatch id; if a run is already active the
 *  message is steered onto it (steered=true) and shares its id. */
export async function sendMessage(
    text: string,
    attachments?: AttachmentUpload[],
): Promise<{ dispatchId: string; steered: boolean } | null> {
    const res = await post<{ dispatchId: string; steered: boolean }>('/v1/nero', {
        text,
        attachments,
    });
    return res.success ? res.data : null;
}

/** Cancel the in-flight dispatch. */
export async function cancelDispatch(): Promise<string | null> {
    const res = await post<{ cancelled: string | null }>('/v1/nero/cancel');
    return res.success ? res.data.cancelled : null;
}
