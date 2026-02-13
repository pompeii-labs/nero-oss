import { Command } from 'commander';
import chalk from 'chalk';
import { loadConfig, isOpenRouter } from '../config.js';

export function registerModelsCommand(program: Command) {
    program
        .command('models')
        .description('List available models from your configured provider')
        .action(async () => {
            const config = await loadConfig();
            const baseUrl = config.settings.baseUrl;

            if (isOpenRouter(config)) {
                console.log(
                    chalk.dim('Using OpenRouter. Browse models at https://openrouter.ai/models'),
                );
                console.log(`Current model: ${chalk.cyan(config.settings.model)}`);
                return;
            }

            console.log(chalk.dim(`Fetching models from ${baseUrl}...`));

            try {
                const response = await fetch(`${baseUrl}/models`);
                if (!response.ok) {
                    console.error(chalk.red(`Failed to fetch models: ${response.status}`));
                    return;
                }

                const data = (await response.json()) as {
                    data?: Array<{ id: string; owned_by?: string }>;
                };
                const models = data.data || [];

                if (models.length === 0) {
                    console.log(chalk.yellow('No models found.'));
                    return;
                }

                console.log(chalk.bold(`\nAvailable Models (${models.length}):\n`));
                for (const model of models) {
                    const isCurrent = model.id === config.settings.model;
                    const marker = isCurrent ? chalk.green(' (active)') : '';
                    console.log(`  ${chalk.cyan(model.id)}${marker}`);
                }
                console.log();
            } catch (error) {
                const err = error as Error;
                console.error(chalk.red(`Failed to connect: ${err.message}`));
                console.log(chalk.dim(`Is the server running at ${baseUrl}?`));
            }
        });
}
