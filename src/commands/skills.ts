import { Command } from 'commander';
import chalk from 'chalk';
import fs from 'fs';
import { resolve } from 'path';
import {
    discoverSkills,
    getSkillsDir,
    installSkillFromPath,
    installSkillFromGitRepo,
    isGitSource,
    createSkill,
    removeSkill,
    loadSkill,
} from '../skills/index.js';

export function registerSkillsCommands(program: Command) {
    const skills = program.command('skills').description('Manage agent skills');

    skills
        .command('list', { isDefault: true })
        .alias('ls')
        .description('List installed skills')
        .action(async () => {
            const installedSkills = await discoverSkills();
            const skillsDir = getSkillsDir();

            if (installedSkills.length === 0) {
                console.log(chalk.yellow('No skills installed.\n'));
                console.log(chalk.dim('Install skills with:'));
                console.log(chalk.cyan(`  npx skills add <repo> --path ${skillsDir}`));
                console.log(chalk.dim('\nOr create your own:'));
                console.log(chalk.cyan('  nero skills create my-skill'));
                return;
            }

            console.log(chalk.bold(`\nInstalled Skills (${skillsDir}):\n`));
            for (const skill of installedSkills) {
                console.log(`  ${chalk.cyan(skill.name)}`);
                if (skill.metadata.description) {
                    console.log(`    ${chalk.dim(skill.metadata.description)}`);
                }
            }
            console.log(chalk.dim(`\nInstall more: npx skills add <repo> --path ${skillsDir}`));
            console.log();
        });

    skills
        .command('add <source>')
        .description('Install a skill from a local path or git repository')
        .action(async (source) => {
            const resolvedPath = resolve(source);

            if (fs.existsSync(resolvedPath)) {
                try {
                    const skillName = await installSkillFromPath(resolvedPath);
                    console.log(chalk.green(`Installed skill: ${skillName}`));
                } catch (error) {
                    const err = error as Error;
                    console.error(chalk.red(`Failed to install: ${err.message}`));
                    process.exit(1);
                }
                return;
            }

            if (isGitSource(source)) {
                console.log(chalk.dim(`Cloning from git...`));
                try {
                    const installedSkills = await installSkillFromGitRepo(source);
                    if (installedSkills.length === 1) {
                        console.log(chalk.green(`Installed skill: ${installedSkills[0]}`));
                    } else {
                        console.log(chalk.green(`Installed ${installedSkills.length} skills:`));
                        for (const name of installedSkills) {
                            console.log(chalk.green(`  - ${name}`));
                        }
                    }
                } catch (error) {
                    const err = error as Error;
                    console.error(chalk.red(`Failed to install: ${err.message}`));
                    process.exit(1);
                }
                return;
            }

            console.log(chalk.yellow(`Source not found: ${source}\n`));
            console.log(chalk.dim('Examples:'));
            console.log(chalk.cyan('  nero skills add ./my-skill'));
            console.log(chalk.cyan('  nero skills add user/repo'));
            console.log(chalk.cyan('  nero skills add user/repo/skill-name'));
            console.log(chalk.cyan('  nero skills add github.com/user/repo'));
        });

    skills
        .command('create <name>')
        .description('Create a new skill from template')
        .action(async (name) => {
            const validName = /^[a-z0-9-]+$/;
            if (!validName.test(name)) {
                console.error(
                    chalk.red('Skill name must be lowercase with hyphens only (e.g., my-skill)'),
                );
                process.exit(1);
            }

            try {
                const skillPath = await createSkill(name);
                console.log(chalk.green(`Created skill: ${name}`));
                console.log(chalk.dim(`\nEdit: ${skillPath}`));
                console.log(chalk.dim(`Test: nero, then /${name}`));
            } catch (error) {
                const err = error as Error;
                console.error(chalk.red(`Failed to create: ${err.message}`));
                process.exit(1);
            }
        });

    skills
        .command('remove <name>')
        .alias('rm')
        .description('Remove an installed skill')
        .action(async (name) => {
            try {
                await removeSkill(name);
                console.log(chalk.green(`Removed skill: ${name}`));
            } catch (error) {
                const err = error as Error;
                console.error(chalk.red(`Failed to remove: ${err.message}`));
                process.exit(1);
            }
        });

    skills
        .command('show <name>')
        .description('Display skill content')
        .action(async (name) => {
            const skill = await loadSkill(name);
            if (!skill) {
                console.error(chalk.red(`Skill not found: ${name}`));
                process.exit(1);
            }

            console.log(chalk.bold(`\n${skill.name}`));
            if (skill.metadata.description) {
                console.log(chalk.dim(skill.metadata.description));
            }
            console.log(chalk.dim(`Path: ${skill.path}`));
            console.log(chalk.dim('\n--- Content ---\n'));
            console.log(skill.content);
            console.log();
        });
}
