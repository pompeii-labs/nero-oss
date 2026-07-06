declare module 'multicast-dns' {
    interface Answer {
        name: string;
        type: string;
        ttl?: number;
        data: string;
    }
    interface Question {
        name: string;
        type: string;
    }
    interface Query {
        questions: Question[];
    }
    interface Mdns {
        on(event: 'query', cb: (query: Query) => void): void;
        respond(response: { answers: Answer[] }): void;
        destroy(): void;
    }
    export default function mdns(options?: unknown): Mdns;
}
