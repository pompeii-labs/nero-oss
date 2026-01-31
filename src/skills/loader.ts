import { readFile, readdir, mkdir, writeFile, rm, cp, stat } from 'fs/promises';
import { existsSync } from 'fs';
import { join, basename, dirname } from 'path';
import { homedir, tmpdir } from 'os';
import { execSync } from 'child_process';
import { getNeroHome } from '../config.js';
import type { Skill, SkillMetadata } from './types.js';

const SKILL_FILE = 'SKILL.md';

export function getSkillsDir(): string {
    return join(getNeroHome(), '.nero', 'skills');
}

function parseFrontmatter(content: string): { metadata: Record<string, unknown>; body: string } {
    const frontmatterRegex = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/;
    const match = content.match(frontmatterRegex);

    if (!match) {
        return { metadata: {}, body: content };
    }

    const [, frontmatterStr, body] = match;
    const metadata: Record<string, unknown> = {};

    for (const line of frontmatterStr.split('\n')) {
        const colonIndex = line.indexOf(':');
        if (colonIndex === -1) continue;

        const key = line.slice(0, colonIndex).trim();
        let value: string | boolean = line.slice(colonIndex + 1).trim();

        if (value === 'true') value = true;
        else if (value === 'false') value = false;
        else if (value.startsWith('"') && value.endsWith('"')) {
            value = value.slice(1, -1);
        } else if (value.startsWith("'") && value.endsWith("'")) {
            value = value.slice(1, -1);
        }

        metadata[key] = value;
    }

    return { metadata, body };
}

function toKebabCase(str: string): string {
    return str
        .replace(/([a-z])([A-Z])/g, '$1-$2')
        .replace(/_/g, '-')
        .toLowerCase();
}

function parseMetadata(raw: Record<string, unknown>, name: string): SkillMetadata {
    return {
        name: String(raw.name || name),
        description: String(raw.description || ''),
    };
}

export async function discoverSkills(): Promise<Skill[]> {
    const skillsDir = getSkillsDir();
    const skills: Skill[] = [];

    if (!existsSync(skillsDir)) {
        return skills;
    }

    try {
        const entries = await readdir(skillsDir, { withFileTypes: true });

        for (const entry of entries) {
            if (!entry.isDirectory()) continue;

            const skillPath = join(skillsDir, entry.name, SKILL_FILE);
            if (!existsSync(skillPath)) continue;

            try {
                const skill = await loadSkillFromPath(skillPath, entry.name);
                if (skill) {
                    skills.push(skill);
                }
            } catch {
                continue;
            }
        }
    } catch {
        return skills;
    }

    return skills.sort((a, b) => a.name.localeCompare(b.name));
}

async function loadSkillFromPath(skillPath: string, dirName: string): Promise<Skill | null> {
    try {
        const content = await readFile(skillPath, 'utf-8');
        const { metadata: rawMetadata, body } = parseFrontmatter(content);
        const metadata = parseMetadata(rawMetadata, dirName);

        return {
            name: metadata.name,
            path: dirname(skillPath),
            metadata,
            content: body.trim(),
        };
    } catch {
        return null;
    }
}

export async function loadSkill(name: string): Promise<Skill | null> {
    const skillsDir = getSkillsDir();
    const skillPath = join(skillsDir, name, SKILL_FILE);

    if (!existsSync(skillPath)) {
        return null;
    }

    return loadSkillFromPath(skillPath, name);
}

export function applyArgumentSubstitution(content: string, args: string[]): string {
    let result = content;

    const argsString = args.join(' ');
    result = result.replace(/\$ARGUMENTS/g, argsString);

    for (let i = 0; i < args.length; i++) {
        result = result.replace(new RegExp(`\\$ARGUMENTS\\[${i}\\]`, 'g'), args[i]);
        result = result.replace(new RegExp(`\\$${i}`, 'g'), args[i]);
    }

    return result;
}

export function getSkillContent(skill: Skill, args: string[]): string {
    let content = skill.content;

    content = applyArgumentSubstitution(content, args);

    const hasArgsPlaceholder =
        skill.content.includes('$ARGUMENTS') ||
        skill.content.match(/\$\d/) ||
        skill.content.match(/\$ARGUMENTS\[\d\]/);

    if (!hasArgsPlaceholder && args.length > 0) {
        content += `\n\nARGUMENTS: ${args.join(' ')}`;
    }

    return content;
}

export async function createSkill(name: string): Promise<string> {
    const skillsDir = getSkillsDir();
    const skillDir = join(skillsDir, name);

    if (!existsSync(skillsDir)) {
        await mkdir(skillsDir, { recursive: true });
    }

    if (existsSync(skillDir)) {
        throw new Error(`Skill '${name}' already exists`);
    }

    await mkdir(skillDir, { recursive: true });

    const template = `---
name: ${name}
description: Describe when this skill should be used
argument-hint: [optional] [arguments]
user-invocable: true
disable-model-invocation: false
---

# ${name}

Write your skill instructions here.

Use $ARGUMENTS to access all arguments passed to the skill.
Use $0, $1, etc. for positional arguments.
`;

    const skillPath = join(skillDir, SKILL_FILE);
    await writeFile(skillPath, template);

    return skillPath;
}

export async function removeSkill(name: string): Promise<void> {
    const skillsDir = getSkillsDir();
    const skillDir = join(skillsDir, name);

    if (!existsSync(skillDir)) {
        throw new Error(`Skill '${name}' not found`);
    }

    await rm(skillDir, { recursive: true });
}

export async function installSkillFromPath(sourcePath: string): Promise<string> {
    const skillsDir = getSkillsDir();

    if (!existsSync(skillsDir)) {
        await mkdir(skillsDir, { recursive: true });
    }

    const sourceStats = await stat(sourcePath);
    let skillSourceDir: string;
    let skillName: string;

    if (sourceStats.isDirectory()) {
        const skillFile = join(sourcePath, SKILL_FILE);
        if (!existsSync(skillFile)) {
            throw new Error(`No ${SKILL_FILE} found in ${sourcePath}`);
        }
        skillSourceDir = sourcePath;
        skillName = basename(sourcePath);
    } else if (sourcePath.endsWith(SKILL_FILE)) {
        skillSourceDir = dirname(sourcePath);
        skillName = basename(skillSourceDir);
    } else {
        throw new Error('Source must be a directory containing SKILL.md or a SKILL.md file');
    }

    const destDir = join(skillsDir, skillName);

    if (existsSync(destDir)) {
        throw new Error(
            `Skill '${skillName}' already exists. Remove it first with: nero skills remove ${skillName}`,
        );
    }

    await cp(skillSourceDir, destDir, { recursive: true });

    return skillName;
}

export function findSkill(nameOrAlias: string, skills: Skill[]): Skill | undefined {
    return skills.find(
        (s) =>
            s.name.toLowerCase() === nameOrAlias.toLowerCase() ||
            s.metadata.name.toLowerCase() === nameOrAlias.toLowerCase(),
    );
}

interface GitRepoInfo {
    repoUrl: string;
    subpath: string | null;
}

function parseGitSource(source: string): GitRepoInfo | null {
    let normalized = source;

    if (normalized.startsWith('https://')) {
        normalized = normalized.replace(/^https:\/\//, '');
    } else if (normalized.startsWith('git@')) {
        normalized = normalized.replace(/^git@github\.com:/, 'github.com/');
    }

    normalized = normalized.replace(/\.git$/, '');

    const parts = normalized.split('/').filter(Boolean);

    if (parts.length < 2) {
        return null;
    }

    let repoOwner: string;
    let repoName: string;
    let subpath: string | null = null;

    if (parts[0] === 'github.com') {
        if (parts.length < 3) return null;
        repoOwner = parts[1];
        repoName = parts[2];
        if (parts.length > 3) {
            subpath = parts.slice(3).join('/');
        }
    } else {
        repoOwner = parts[0];
        repoName = parts[1];
        if (parts.length > 2) {
            subpath = parts.slice(2).join('/');
        }
    }

    return {
        repoUrl: `https://github.com/${repoOwner}/${repoName}.git`,
        subpath,
    };
}

export function isGitSource(source: string): boolean {
    if (source.startsWith('https://') || source.startsWith('git@')) {
        return true;
    }

    const parts = source.split('/').filter(Boolean);
    if (parts.length >= 2) {
        const firstPart = parts[0];
        if (firstPart.includes('.') && firstPart !== '..' && !firstPart.startsWith('.')) {
            return true;
        }
        if (/^[a-zA-Z0-9_-]+$/.test(firstPart) && /^[a-zA-Z0-9_.-]+$/.test(parts[1])) {
            return true;
        }
    }

    return false;
}

export async function installSkillFromGitRepo(source: string): Promise<string[]> {
    const repoInfo = parseGitSource(source);
    if (!repoInfo) {
        throw new Error(`Invalid git source: ${source}`);
    }

    const tempDir = join(tmpdir(), `nero-skill-${Date.now()}`);
    const installedSkills: string[] = [];

    try {
        execSync(`git clone --depth 1 ${repoInfo.repoUrl} ${tempDir}`, {
            stdio: ['pipe', 'pipe', 'pipe'],
            timeout: 60000,
        });

        let searchDir = tempDir;
        if (repoInfo.subpath) {
            searchDir = join(tempDir, repoInfo.subpath);
            if (!existsSync(searchDir)) {
                throw new Error(`Path '${repoInfo.subpath}' not found in repository`);
            }
        }

        const skillDirs = await findSkillsInDirectory(searchDir);

        if (skillDirs.length === 0) {
            throw new Error(`No skills found in ${repoInfo.subpath || 'repository'}`);
        }

        for (const skillDir of skillDirs) {
            try {
                const skillName = await installSkillFromPath(skillDir);
                installedSkills.push(skillName);
            } catch (error) {
                const err = error as Error;
                if (!err.message.includes('already exists')) {
                    throw error;
                }
            }
        }

        return installedSkills;
    } finally {
        if (existsSync(tempDir)) {
            await rm(tempDir, { recursive: true, force: true });
        }
    }
}

async function findSkillsInDirectory(dir: string): Promise<string[]> {
    const skillDirs: string[] = [];

    const directSkill = join(dir, SKILL_FILE);
    if (existsSync(directSkill)) {
        skillDirs.push(dir);
        return skillDirs;
    }

    try {
        const entries = await readdir(dir, { withFileTypes: true });
        for (const entry of entries) {
            if (!entry.isDirectory()) continue;
            if (entry.name.startsWith('.')) continue;

            const skillPath = join(dir, entry.name, SKILL_FILE);
            if (existsSync(skillPath)) {
                skillDirs.push(join(dir, entry.name));
            }
        }
    } catch {
        // ignore
    }

    return skillDirs;
}
