export type NeroMode = 'integrated' | 'contained';

export interface DockerConfig {
    name: string;
    port: string;
    mode: NeroMode;
    image: string;
}

export interface ComposeService {
    image: string;
    container_name: string;
    restart: string;
    network_mode?: string;
    ports?: string[];
    environment: string[];
    env_file?: string[];
    volumes: string[];
    depends_on?: Record<string, { condition: string }>;
    healthcheck?: {
        test: string[];
        interval: string;
        timeout: string;
        retries: number;
    };
}

export interface ComposeFile {
    services: Record<string, ComposeService>;
    volumes: Record<string, object>;
}
