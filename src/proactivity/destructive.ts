import { minimatch } from 'minimatch';

export interface ToolCall {
    tool: string;
    args: Record<string, any>;
}

export interface DestructiveCheckResult {
    isDestructive: boolean;
    reason?: string;
    canOverride?: boolean;
}

const DESTRUCTIVE_BASH_PATTERNS = [
    'rm *',
    'rm',
    'rmdir *',
    'rmdir',
    'sudo *',
    'chmod *',
    'chown *',
    'kill *',
    'pkill *',
    'killall *',
    'docker rm *',
    'docker rmi *',
    'docker stop *',
    'docker kill *',
    'docker prune *',
    'docker system prune *',
    'git reset --hard*',
    'git checkout .',
    'git checkout -- .',
    'git restore .',
    'git restore --staged .',
    'git clean *',
    'truncate *',
    'mv *',
    '> *',
    'cat * > *',
    'echo * > *',
];

const GIT_PUSH_PATTERN = /^git\s+push/;
const GIT_PUSH_BRANCH_PATTERN = /^git\s+push\s+\S+\s+(\S+)/;
const GIT_PUSH_CURRENT = /^git\s+push(\s+--[^\s]+)*\s*$/;

export function isDestructiveToolCall(
    call: ToolCall,
    protectedBranches: string[] = ['main', 'master'],
    currentBranch?: string,
): DestructiveCheckResult {
    if (call.tool === 'bash' || call.tool === 'execute_command') {
        const command = call.args.command || call.args.cmd || '';
        return checkBashCommand(command, protectedBranches, currentBranch);
    }

    if (call.tool === 'write_file' || call.tool === 'create_file') {
        return {
            isDestructive: true,
            reason: 'File write operation',
            canOverride: true,
        };
    }

    if (call.tool === 'edit_file' || call.tool === 'patch_file') {
        return {
            isDestructive: true,
            reason: 'File edit operation',
            canOverride: true,
        };
    }

    if (call.tool === 'delete_file' || call.tool === 'remove_file') {
        return {
            isDestructive: true,
            reason: 'File deletion',
            canOverride: true,
        };
    }

    if (call.tool === 'browser' && call.args?.operation === 'evaluate') {
        return {
            isDestructive: true,
            reason: 'Browser JavaScript execution',
            canOverride: true,
        };
    }

    return { isDestructive: false };
}

function checkBashCommand(
    command: string,
    protectedBranches: string[],
    currentBranch?: string,
): DestructiveCheckResult {
    const trimmed = command.trim();

    if (GIT_PUSH_PATTERN.test(trimmed)) {
        return checkGitPush(trimmed, protectedBranches, currentBranch);
    }

    for (const pattern of DESTRUCTIVE_BASH_PATTERNS) {
        if (matchCommand(trimmed, pattern)) {
            return {
                isDestructive: true,
                reason: `Matches destructive pattern: ${pattern}`,
                canOverride: true,
            };
        }
    }

    return { isDestructive: false };
}

function checkGitPush(
    command: string,
    protectedBranches: string[],
    currentBranch?: string,
): DestructiveCheckResult {
    if (command.includes('--force') || command.includes('-f')) {
        return {
            isDestructive: true,
            reason: 'Force push is always destructive',
            canOverride: false,
        };
    }

    const branchMatch = command.match(GIT_PUSH_BRANCH_PATTERN);
    let targetBranch: string | undefined;

    if (branchMatch) {
        targetBranch = branchMatch[1];
        if (targetBranch.includes(':')) {
            targetBranch = targetBranch.split(':')[1];
        }
    } else if (GIT_PUSH_CURRENT.test(command) && currentBranch) {
        targetBranch = currentBranch;
    }

    if (targetBranch) {
        for (const protected_ of protectedBranches) {
            if (minimatch(targetBranch, protected_)) {
                return {
                    isDestructive: true,
                    reason: `Push to protected branch: ${targetBranch}`,
                    canOverride: false,
                };
            }
        }

        return {
            isDestructive: false,
            reason: `Push to feature branch: ${targetBranch}`,
        };
    }

    return {
        isDestructive: true,
        reason: 'Could not determine target branch',
        canOverride: true,
    };
}

function matchCommand(command: string, pattern: string): boolean {
    const cmdParts = command.split(/\s+/);
    const patternParts = pattern.split(/\s+/);

    for (let i = 0; i < patternParts.length; i++) {
        const patternPart = patternParts[i];

        if (patternPart === '*') {
            return true;
        }

        if (i >= cmdParts.length) {
            return false;
        }

        if (patternPart.endsWith('*')) {
            if (!cmdParts[i].startsWith(patternPart.slice(0, -1))) {
                return false;
            }
        } else if (cmdParts[i] !== patternPart) {
            return false;
        }
    }

    return patternParts.length <= cmdParts.length;
}

export function getDestructiveReason(call: ToolCall, protectedBranches?: string[]): string {
    const result = isDestructiveToolCall(call, protectedBranches);
    return result.reason || 'Unknown';
}
