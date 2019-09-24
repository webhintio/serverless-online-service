const debug = (process.argv.includes('--debug'));

import * as d from 'debug';

// This initialization needs to be done *before* other requires in order to work.
if (debug) {
    d.enable('config-manager:*');
}

import * as table from 'text-table';
import { CLIOptions, database, logger } from '@online-service/utils';

import { options } from './options';
import * as configManager from './config-manager';

const moduleName = 'Configuration Manager';

const addConfig = async (cliOptions: CLIOptions) => {
    try {
        const newConfig = await configManager.add({
            filePath: cliOptions.file,
            jobCacheTime: cliOptions.cache,
            jobRunTime: cliOptions.run,
            name: cliOptions.name
        });

        logger.log(`Configuration '${newConfig.name}' created.`, moduleName);

        return 0;
    } catch (err) {
        if (err.code === 11000) {
            logger.error(`Already exists a configuration with name '${cliOptions.name}'`, moduleName, err);
        } else {
            logger.error(err.message, moduleName, err);
        }

        return 1;
    }
};

const activateConfiguration = async (cliOptions: CLIOptions) => {
    try {
        const config = await configManager.activate(cliOptions.name);

        logger.log(`Configuration '${config.name}' activated.`);

        return 0;
    } catch (err) {
        logger.error(`Error activating config ${cliOptions.name}`, moduleName, err);

        return 1;
    }
};

const listConfigurations = async () => {
    const configurations = await configManager.list();

    if (configurations.length === 0) {
        logger.log('There is no configuration stored in database');

        return 0;
    }

    const tableData = [['Name', 'Active'], ['====', '======']];

    for (const serviceConfig of configurations) {
        tableData.push([serviceConfig.name, serviceConfig.active ? 'true' : 'false']);
    }

    logger.log('==================================');
    logger.log('=== Configurations in database ===');
    logger.log('==================================');
    logger.log(table(tableData));

    return 0;
};

const configurationDetails = async (cliOptions: CLIOptions): Promise<0 | 1> => {
    const configuration = await configManager.get(cliOptions.name);

    if (!configuration) {
        logger.log(`There is no configuration with name ${cliOptions.name}`);

        return 0;
    }

    logger.log('=====================================');
    logger.log('======= Scanner configuration =======');
    logger.log('=====================================');
    logger.log(`Configuration name: ${configuration.name}${configuration.active ? ' (Active)' : ''}`);
    logger.log(`Cache for jobs: ${configuration.jobCacheTime} seconds`);
    logger.log(`Time to run webhint: ${configuration.jobRunTime} seconds`);
    logger.log('======================================');
    logger.log('======= Webhint configurations =======');
    logger.log('======================================');
    logger.log(JSON.stringify(configuration.webhintConfigs, null, 4));

    return 0;
};

const methods = {
    activate: activateConfiguration,
    details: configurationDetails,
    file: addConfig,
    list: listConfigurations
};

/**
 * Execute the function indicated in the options.
 * @param {CLIOptions} cliOptions Options from the CLI.
 */
const run = async (cliOptions: CLIOptions) => {
    await database.connect();

    let exitCode;
    const entries = Object.entries(methods);

    for (const [key, method] of entries) {
        if (cliOptions[key as keyof CLIOptions]) {
            exitCode = await method(cliOptions);

            break;
        }
    }

    if (typeof exitCode === undefined) {
        logger.log(options.generateHelp());
        exitCode = 0;
    }

    await database.disconnect();

    return exitCode;
};

try {
    const currentOptions: CLIOptions = options.parse(process.argv);

    run(currentOptions);
} catch (e) {
    logger.error(e.message, moduleName);

    process.exitCode = 1;
}
