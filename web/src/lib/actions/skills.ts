import { getServerUrl, buildServerResponse, type ServerResponse } from './helpers';

export interface SkillSummary {
    name: string;
    description: string;
}

export interface SkillDetail {
    name: string;
    path: string;
    metadata: {
        name: string;
        description: string;
    };
    content: string;
}

export interface SkillInvocation {
    skill: {
        name: string;
        description: string;
    };
    content: string;
}

export async function getSkills(): Promise<
    ServerResponse<{ skills: SkillSummary[]; skillsDir: string }>
> {
    try {
        const response = await fetch(getServerUrl('/api/skills'));
        if (!response.ok) {
            return buildServerResponse({ error: 'Failed to get skills' });
        }
        const data = await response.json();
        return buildServerResponse({ data });
    } catch (error) {
        return buildServerResponse({ error: (error as Error).message });
    }
}

export async function getSkill(name: string): Promise<ServerResponse<SkillDetail>> {
    try {
        const response = await fetch(getServerUrl(`/api/skills/${encodeURIComponent(name)}`));
        if (!response.ok) {
            if (response.status === 404) {
                return buildServerResponse({ error: 'Skill not found' });
            }
            return buildServerResponse({ error: 'Failed to get skill' });
        }
        const data = await response.json();
        return buildServerResponse({ data });
    } catch (error) {
        return buildServerResponse({ error: (error as Error).message });
    }
}

export async function invokeSkill(
    name: string,
    args: string[],
): Promise<ServerResponse<SkillInvocation>> {
    try {
        const response = await fetch(
            getServerUrl(`/api/skills/${encodeURIComponent(name)}/invoke`),
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ args }),
            },
        );
        if (!response.ok) {
            if (response.status === 404) {
                return buildServerResponse({ error: 'Skill not found' });
            }
            if (response.status === 403) {
                return buildServerResponse({ error: 'Skill is not user-invocable' });
            }
            return buildServerResponse({ error: 'Failed to invoke skill' });
        }
        const data = await response.json();
        return buildServerResponse({ data });
    } catch (error) {
        return buildServerResponse({ error: (error as Error).message });
    }
}

export async function getLoadedSkills(): Promise<ServerResponse<{ skills: string[] }>> {
    try {
        const response = await fetch(getServerUrl('/api/skills/loaded'));
        if (!response.ok) {
            return buildServerResponse({ error: 'Failed to get loaded skills' });
        }
        const data = await response.json();
        return buildServerResponse({ data });
    } catch (error) {
        return buildServerResponse({ error: (error as Error).message });
    }
}

export async function loadSkillIntoContext(
    name: string,
    args: string[],
): Promise<ServerResponse<{ loadedSkills: string[] }>> {
    try {
        const response = await fetch(getServerUrl('/api/skills/load'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, args }),
        });
        if (!response.ok) {
            if (response.status === 404) {
                return buildServerResponse({ error: 'Skill not found' });
            }
            return buildServerResponse({ error: 'Failed to load skill' });
        }
        const data = await response.json();
        return buildServerResponse({ data });
    } catch (error) {
        return buildServerResponse({ error: (error as Error).message });
    }
}

export async function unloadSkillFromContext(
    name: string,
): Promise<ServerResponse<{ loadedSkills: string[] }>> {
    try {
        const response = await fetch(getServerUrl('/api/skills/unload'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name }),
        });
        if (!response.ok) {
            return buildServerResponse({ error: 'Failed to unload skill' });
        }
        const data = await response.json();
        return buildServerResponse({ data });
    } catch (error) {
        return buildServerResponse({ error: (error as Error).message });
    }
}
