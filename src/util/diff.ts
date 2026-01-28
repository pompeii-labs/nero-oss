import { diffLines, Change } from 'diff';

export interface DiffResult {
    lines: DiffLine[];
    linesAdded: number;
    linesRemoved: number;
    truncated: boolean;
}

export interface DiffLine {
    type: 'add' | 'remove' | 'context';
    content: string;
}

export function generateDiff(
    oldContent: string | null,
    newContent: string,
    maxLines = 100,
): DiffResult {
    const old = oldContent ?? '';
    const changes = diffLines(old, newContent);

    const lines: DiffLine[] = [];
    let linesAdded = 0;
    let linesRemoved = 0;

    for (const change of changes) {
        const changeLines = change.value.split('\n');
        if (changeLines[changeLines.length - 1] === '') {
            changeLines.pop();
        }

        for (const line of changeLines) {
            if (change.added) {
                lines.push({ type: 'add', content: line });
                linesAdded++;
            } else if (change.removed) {
                lines.push({ type: 'remove', content: line });
                linesRemoved++;
            } else {
                lines.push({ type: 'context', content: line });
            }
        }
    }

    const truncated = lines.length > maxLines;
    const truncatedLines = truncated ? lines.slice(0, maxLines) : lines;

    return {
        lines: truncatedLines,
        linesAdded,
        linesRemoved,
        truncated,
    };
}

export function formatDiffStats(diff: DiffResult): string {
    const parts: string[] = [];
    if (diff.linesAdded > 0) parts.push(`+${diff.linesAdded}`);
    if (diff.linesRemoved > 0) parts.push(`-${diff.linesRemoved}`);
    return parts.join(' ');
}
