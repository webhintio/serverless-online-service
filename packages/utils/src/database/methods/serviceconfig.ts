import { UserConfig } from '@hint/utils';
import { DocumentQuery } from 'mongoose';

import { debug as d } from '../../debug';
import { IServiceConfig } from '../../types';
import { IServiceConfigModel, ServiceConfig } from '../models/serviceconfig';
import { connect } from './common';

const debug: debug.IDebugger = d(__filename);

/**
 * Create a new configuration in the database.
 * @param {string} name - New configuration name.
 * @param {number} jobCacheTime - Cache time in seconds for jobs.
 * @param {number} jobRunTime - Time before throw a timeout for jobs.
 * @param {UserConfig} options - Configuration data.
 */
export const add = async (name: string, jobCacheTime: number, jobRunTime: number, options: Array<UserConfig>): Promise<IServiceConfig> => {
    debug(`Creating config with name: ${name}`);
    await connect();

    const config: IServiceConfigModel = new ServiceConfig({
        active: false,
        jobCacheTime,
        jobRunTime,
        name,
        webhintConfigs: options
    });

    await config.save();

    debug(`Config with name: ${name} saved in the database`);

    return config;
};

/**
 * Mark a configuration as active.
 * @param {string} name - Name of the configuration to activate.
 */
export const activate = async (name: string): Promise<IServiceConfig> => {
    debug(`Getting config by name: ${name}`);
    await connect();
    const query: DocumentQuery<Array<IServiceConfigModel>, IServiceConfigModel> = ServiceConfig.find({});
    const configs: Array<IServiceConfigModel> = await query.exec();

    // First we will check if the config exists or not.
    const configuration = configs.find((config) => {
        return config.name === name;
    });

    if (!configuration) {
        throw new Error(`Configuration '${name}' doesn't exist`);
    }

    for (const config of configs) {
        if (config && config.name !== name) {
            config.active = false;

            await config.save();

            debug(`Configuration ${config.name} is not the default`);
        }
    }

    configuration.active = true;

    await configuration.save();

    debug(`Configuration ${configuration.name} is the new default configuration`);

    return configuration;
};

/**
 * Get all the configurations stored in the database.
 */
export const getAll = async (): Promise<Array<IServiceConfig>> => {
    await connect();
    const query: DocumentQuery<Array<IServiceConfigModel>, IServiceConfigModel> = ServiceConfig.find({});
    const configs: Array<IServiceConfig> = await query.exec();

    return configs;
};

/**
 * Get a configuration from the database by name.
 * @param {string} name - Configuration name.
 */
export const get = async (name: string): Promise<IServiceConfig | null> => {
    await connect();
    const query: DocumentQuery<IServiceConfigModel | null, IServiceConfigModel> = ServiceConfig.findOne({ name });

    const config: IServiceConfig | null = await query.exec();

    return config;
};

/**
 * Remove configuration from database by name.
 * @param {string} name - Configuration name.
 */
export const remove = async (name: string) => {
    await connect();
    const query: DocumentQuery<IServiceConfigModel | null, IServiceConfigModel> = ServiceConfig.findOne({ name });

    await query.remove().exec();
};

/**
 * Get the current active configuration.
 */
export const getActive = async (): Promise<IServiceConfig | null> => {
    await connect();
    const query: DocumentQuery<IServiceConfigModel | null, IServiceConfigModel> = ServiceConfig.findOne({ active: true });
    const config: IServiceConfig | null = await query.exec();

    return config;
};

/**
 * Edit a configuration.
 * @param {string} oldName - Old configuration name.
 * @param {string} newName - New configuration name.
 * @param {number} jobCacheTime - Cache time in seconds for jobs.
 * @param {number} jobRunTime - Time before throw a timeout for jobs.
 * @param {UserConfig} options - Configuration data.
 */
export const edit = async (oldName: string, newName: string, jobCacheTime: number, jobRunTime: number, configs: Array<UserConfig> | null): Promise<IServiceConfig | null> => {
    await connect();
    const query: DocumentQuery<IServiceConfigModel | null, IServiceConfigModel> = ServiceConfig.findOne({ name: oldName });
    const config: IServiceConfigModel | null = await query.exec();

    if (!config) {
        return config;
    }

    config.name = newName;
    config.jobCacheTime = jobCacheTime;
    config.jobRunTime = jobRunTime;

    if (configs) {
        config.webhintConfigs = configs;
        config.markModified('webhintConfigs');
    }

    await config.save();

    return config;
};
