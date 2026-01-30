import type { DockerConfig, ComposeFile, ComposeService } from './types.js';

const IMAGE = 'ghcr.io/pompeii-labs/nero-oss:latest';

function buildNeroService(config: DockerConfig): ComposeService {
    const isIntegrated = config.mode === 'integrated';

    const service: ComposeService = {
        image: config.image,
        container_name: config.name,
        restart: 'unless-stopped',
        environment: [
            `HOST_HOME=${isIntegrated ? '${HOME}' : ''}`,
            `DATABASE_URL=postgresql://nero:nero@${isIntegrated ? 'localhost' : 'db'}:5432/nero`,
            'GIT_DISCOVERY_ACROSS_FILESYSTEM=1',
            `NERO_MODE=${config.mode}`,
        ],
        env_file: ['.env'],
        volumes: isIntegrated
            ? [
                  '${HOME}/.nero:/host/home/.nero',
                  '${HOME}:/host/home',
                  '/var/run/docker.sock:/var/run/docker.sock',
              ]
            : ['nero_config:/app/config'],
    };

    if (isIntegrated) {
        service.network_mode = 'host';
    } else {
        service.ports = [`${config.port}:4848`];
        service.depends_on = {
            db: { condition: 'service_healthy' },
        };
    }

    return service;
}

function buildDbService(isIntegrated: boolean): ComposeService {
    const service: ComposeService = {
        image: 'postgres:16-alpine',
        container_name: 'nero-db',
        restart: 'unless-stopped',
        environment: ['POSTGRES_USER=nero', 'POSTGRES_PASSWORD=nero', 'POSTGRES_DB=nero'],
        volumes: ['nero_data:/var/lib/postgresql/data'],
        healthcheck: {
            test: ['CMD-SHELL', 'pg_isready -U nero'],
            interval: '5s',
            timeout: '5s',
            retries: 5,
        },
    };

    if (isIntegrated) {
        service.network_mode = 'host';
    }

    return service;
}

export function generateComposeFile(config: DockerConfig): ComposeFile {
    const isIntegrated = config.mode === 'integrated';

    return {
        services: {
            nero: buildNeroService(config),
            db: buildDbService(isIntegrated),
        },
        volumes: isIntegrated ? { nero_data: {} } : { nero_data: {}, nero_config: {} },
    };
}

export function composeToYaml(compose: ComposeFile): string {
    const lines: string[] = ['services:'];

    for (const [name, service] of Object.entries(compose.services)) {
        lines.push(`  ${name}:`);
        lines.push(`    image: ${service.image}`);
        lines.push(`    container_name: ${service.container_name}`);
        lines.push(`    restart: ${service.restart}`);

        if (service.network_mode) {
            lines.push(`    network_mode: ${service.network_mode}`);
        }

        if (service.ports && service.ports.length > 0) {
            lines.push('    ports:');
            for (const port of service.ports) {
                lines.push(`      - "${port}"`);
            }
        }

        lines.push('    environment:');
        for (const env of service.environment) {
            lines.push(`      - ${env}`);
        }

        if (service.env_file && service.env_file.length > 0) {
            lines.push('    env_file:');
            for (const file of service.env_file) {
                lines.push(`      - ${file}`);
            }
        }

        lines.push('    volumes:');
        for (const vol of service.volumes) {
            lines.push(`      - ${vol}`);
        }

        if (service.depends_on) {
            lines.push('    depends_on:');
            for (const [dep, cond] of Object.entries(service.depends_on)) {
                lines.push(`      ${dep}:`);
                lines.push(`        condition: ${cond.condition}`);
            }
        }

        if (service.healthcheck) {
            lines.push('    healthcheck:');
            lines.push(`      test: ${JSON.stringify(service.healthcheck.test)}`);
            lines.push(`      interval: ${service.healthcheck.interval}`);
            lines.push(`      timeout: ${service.healthcheck.timeout}`);
            lines.push(`      retries: ${service.healthcheck.retries}`);
        }

        lines.push('');
    }

    lines.push('volumes:');
    for (const vol of Object.keys(compose.volumes)) {
        lines.push(`  ${vol}:`);
    }

    return lines.join('\n');
}

export function generateComposeYaml(config: DockerConfig): string {
    return composeToYaml(generateComposeFile(config));
}

export const DEFAULT_IMAGE = IMAGE;
