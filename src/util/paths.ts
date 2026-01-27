const HOST_HOME = process.env.HOST_HOME || '';
const CONTAINER_HOME = '/host/home';

export function hostToContainer(hostPath: string): string {
    if (!HOST_HOME) return hostPath;
    if (hostPath.startsWith(HOST_HOME)) {
        return hostPath.replace(HOST_HOME, CONTAINER_HOME);
    }
    return hostPath;
}

export function containerToHost(containerPath: string): string {
    if (!HOST_HOME) return containerPath;
    if (containerPath.startsWith(CONTAINER_HOME)) {
        return containerPath.replace(CONTAINER_HOME, HOST_HOME);
    }
    return containerPath;
}

export function isHostPath(p: string): boolean {
    return HOST_HOME ? p.startsWith(HOST_HOME) : false;
}

export function isContainerPath(p: string): boolean {
    return p.startsWith(CONTAINER_HOME);
}
