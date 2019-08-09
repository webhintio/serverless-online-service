/**
 * @fileoverview Options configuration for optionator.
 */

import * as optionator from 'optionator';

export const options = optionator({
    defaults: {
        concatRepeatedArrays: true,
        mergeRepeatedObjects: true
    },
    mutuallyExclusive: ['file', 'activate', 'list', 'help'],
    options: [
        { heading: 'Basic configuration' },
        {
            alias: 'n',
            description: 'Name for the configuration',
            option: 'name',
            type: 'String'
        }, {
            alias: 'c',
            description: 'Cache time in seconds for jobs',
            option: 'cache',
            type: 'Int'
        }, {
            alias: 'r',
            description: 'Time in seconds a job has to complete the execution in webhint',
            option: 'run',
            type: 'Int'
        }, {
            alias: 'f',
            dependsOn: ['and', 'name', 'cache', 'run'],
            description: 'Path to a file with an array of webhint configurations to store in database',
            example: 'config-manager-cli --name new-config-name --file config-file.json --cache 120 --run 120',
            option: 'file',
            type: 'path::String'
        }, {
            alias: 'a',
            dependsOn: 'name',
            description: 'Activate a configuration by name',
            example: 'config-manager-cli --activate --name config-name',
            option: 'activate',
            type: 'Boolean'
        }, {
            alias: 'l',
            description: 'List all the configuration available',
            example: 'config-manager-cli --list',
            option: 'list',
            type: 'Boolean'
        }, {
            alias: 'd',
            dependsOn: 'name',
            description: 'Get the details of a configuration',
            example: 'config-manager-cli --details',
            option: 'details',
            type: 'Boolean'
        },
        { heading: 'Miscellaneous' },
        {
            default: false,
            description: 'Output debugging information',
            option: 'debug',
            type: 'Boolean'
        },
        {
            alias: 'h',
            description: 'Show help',
            option: 'help',
            type: 'Boolean'
        }
    ],
    prepend: 'config-manager-cli [options]'
});
