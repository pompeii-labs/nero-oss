import { Command } from 'commander';
import chalk from 'chalk';
import { writeFile, readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { resolve } from 'path';
import { loadConfig, getConfigDir } from '../config.js';
import { NeroClient } from '../client/index.js';
import { validateExportFile } from '../export-import.js';

async function getClient(): Promise<NeroClient> {
    const config = await loadConfig();
    const serviceUrl = process.env.NERO_SERVICE_URL || 'http://localhost:4848';
    const running = await NeroClient.checkServiceRunning(serviceUrl);

    if (!running) {
        console.error(chalk.red('Nero service not running.'));
        console.log(chalk.dim('\nStart the service with:'));
        console.log(chalk.cyan('  docker-compose up -d\n'));
        process.exit(1);
    }

    return new NeroClient({ baseUrl: serviceUrl, licenseKey: config.licenseKey });
}

export function registerExportImportCommands(program: Command) {
    program
        .command('export')
        .alias('backup')
        .description('Export Nero state to a .nro file')
        .argument('[path]', 'Output file path')
        .action(async (pathArg?: string) => {
            const date = new Date().toISOString().split('T')[0];
            const defaultPath = resolve(getConfigDir(), `export-${date}.nro`);
            const outputPath = pathArg ? resolve(pathArg) : defaultPath;

            const client = await getClient();

            console.log(chalk.dim('Exporting...'));

            try {
                const data = await client.exportData();

                const tableNames = Object.keys(data.data) as (keyof typeof data.data)[];
                let totalRows = 0;
                console.log(chalk.bold('\nExport Summary\n'));
                for (const table of tableNames) {
                    const count = data.data[table].length;
                    totalRows += count;
                    console.log(`  ${chalk.dim(table + ':')} ${count}`);
                }
                console.log(`\n  ${chalk.dim('Total:')} ${totalRows} rows`);

                await writeFile(outputPath, JSON.stringify(data, null, 2));
                console.log(`\n${chalk.green('Saved to')} ${chalk.cyan(outputPath)}\n`);
            } catch (error) {
                console.error(chalk.red(`Export failed: ${(error as Error).message}`));
                process.exit(1);
            }
        });

    program
        .command('import')
        .alias('restore')
        .description('Import Nero state from a .nro file')
        .argument('<path>', 'Path to .nro export file')
        .action(async (filePath: string) => {
            const resolvedPath = resolve(filePath);

            if (!existsSync(resolvedPath)) {
                console.error(chalk.red(`File not found: ${resolvedPath}`));
                process.exit(1);
            }

            let data: unknown;
            try {
                const content = await readFile(resolvedPath, 'utf-8');
                data = JSON.parse(content);
            } catch {
                console.error(chalk.red('Failed to parse file as JSON'));
                process.exit(1);
            }

            if (!validateExportFile(data)) {
                console.error(
                    chalk.red('Invalid export file (missing nero_export marker or wrong version)'),
                );
                process.exit(1);
            }

            const tableNames = Object.keys(data.data) as (keyof typeof data.data)[];
            console.log(
                chalk.bold(`\nImport Preview`) +
                    chalk.dim(` (v${data.version}, exported ${data.exported_at})\n`),
            );
            for (const table of tableNames) {
                console.log(`  ${chalk.dim(table + ':')} ${data.data[table].length}`);
            }
            console.log(`\n${chalk.yellow('This will replace all existing data.')}`);

            const client = await getClient();

            console.log(chalk.dim('\nImporting...'));

            try {
                const result = await client.importData(data);

                console.log(chalk.green('\nImport complete\n'));
                if (result.config) console.log(`  ${chalk.dim('Config:')} merged`);
                for (const [table, count] of Object.entries(result.counts)) {
                    console.log(`  ${chalk.dim(table + ':')} ${count} rows`);
                }
                console.log();
            } catch (error) {
                console.error(chalk.red(`Import failed: ${(error as Error).message}`));
                process.exit(1);
            }
        });
}
