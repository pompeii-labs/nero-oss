import { get, post, type NeroResult } from './helpers';

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

export function getSkills(): Promise<NeroResult<{ skills: SkillSummary[]; skillsDir: string }>> {
    return get('/api/skills');
}

export function getSkill(name: string): Promise<NeroResult<SkillDetail>> {
    return get(`/api/skills/${encodeURIComponent(name)}`);
}

export function invokeSkill(name: string, args: string[]): Promise<NeroResult<SkillInvocation>> {
    return post(`/api/skills/${encodeURIComponent(name)}/invoke`, { args });
}

export function getLoadedSkills(): Promise<NeroResult<{ skills: string[] }>> {
    return get('/api/skills/loaded');
}

export function loadSkillIntoContext(
    name: string,
    args: string[],
): Promise<NeroResult<{ loadedSkills: string[] }>> {
    return post('/api/skills/load', { name, args });
}

export function unloadSkillFromContext(
    name: string,
): Promise<NeroResult<{ loadedSkills: string[] }>> {
    return post('/api/skills/unload', { name });
}
