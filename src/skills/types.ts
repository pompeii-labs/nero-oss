export interface SkillMetadata {
    name: string;
    description: string;
}

export interface Skill {
    name: string;
    path: string;
    metadata: SkillMetadata;
    content: string;
}
