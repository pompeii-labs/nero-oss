import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
    plugins: [svelte()],
    resolve: {
        alias: { $lib: fileURLToPath(new URL('./src/lib', import.meta.url)) },
        conditions: ['browser'],
    },
    test: {
        environment: 'jsdom',
        globals: true,
        include: ['src/**/*.{test,spec}.ts'],
        setupFiles: ['./vitest-setup.ts'],
    },
});
