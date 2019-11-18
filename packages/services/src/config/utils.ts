import { UserConfig, normalizeHints } from '@hint/utils';
import { validateConfig } from 'hint/dist/src/lib/config/config-validator';

/**
 * Check if an array of webhint configurations is valid.
 * @param {UserConfig[]} configs - Array of webhint configurations.
 */
export const validateServiceConfig = (configs: UserConfig[]) => {
    const hints = new Set<string>();

    for (const config of configs) {
        if (!validateConfig(config)) {
            throw new Error(`Invalid Configuration
${JSON.stringify(config)}`);
        }

        const normalizedHints = normalizeHints(config.hints!);

        for (const [key] of Object.entries(normalizedHints)) {
            if (hints.has(key)) {
                throw new Error(`Hint ${key} repeated`);
            }

            hints.add(key);
        }
    }
};
