import * as _ from 'lodash';
import * as moment from 'moment';
import { UserConfig, utils } from 'hint';

import * as database from '../../common/database/database';
import * as statusManager from '../../common/status/status';
import { Hint, IJob, IServiceConfig, IStatus, JobData, RequestData } from '../../types';
import * as logger from '../../utils/logging';
import { validateServiceConfig, readFileAsync } from '../../utils/misc';
import { ConfigSource } from '../../enums/configsource';
import { JobStatus, HintStatus } from '../../enums/status';
import { debug as d } from '../../utils/debug';
import { getTime } from '../../common/ntp/ntp';
import { Queue } from '../../common/queue/queue';

const debug: debug.IDebugger = d(__filename);
const { QueueConnection, DatabaseConnection: dbConnectionString, NODE_ENV: env, port } = process.env; // eslint-disable-line no-process-env
let queue: Queue = null;
const moduleName: string = 'Scanner API';

/**
 * Parse data sent in the request is valid
 * @param {RequestData} data - Data received in the request
 */
const parseRequestData = async (data: RequestData): Promise<JobData> => {
    if (!data.fields.url || !data.fields.url[0]) {
        throw new Error('Url is required');
    }

    const file = data.files['config-file'] ? data.files['config-file'][0] : null;

    try {
        return {
            config: file && file.size > 0 ? JSON.parse(await readFileAsync(file.path)) : null,
            hints: data.fields.hints,
            source: data.fields.source ? data.fields.source[0] : ConfigSource.default,
            url: data.fields.url ? data.fields.url[0] : null
        };
    } catch (err) {
        throw new Error('Error parsing request data');
    }
};

/**
 * Split the job in as many messages as configurations it has.
 * @param {IJob} job - Job to send to the queue.
 */
const sendMessagesToQueue = async (job: IJob) => {
    if (QueueConnection && !queue) {
        queue = new Queue('webhint-jobs', QueueConnection);
    } else {
        logger.log('Queue connection string not found', moduleName);
    }

    let counter = 0;

    logger.log(`Splitting the Job in ${job.config.length} tasks`, moduleName);

    for (const config of job.config) {
        const jobCopy = _.cloneDeep(job);

        jobCopy.partInfo = {
            part: ++counter,
            totalParts: job.config.length
        };
        jobCopy.config = [config];
        await queue.sendMessage(jobCopy);
        logger.log(`Part ${jobCopy.partInfo.part} of ${jobCopy.partInfo.totalParts} sent to the Service Bus`, moduleName);
    }
};


/**
 * Validate if a webhint configuration or an array of them is valid.
 * @param {UserConfig | Array<UserConfig>} config - Webhint configuration.
 */
const validateConfigs = (config: UserConfig | Array<UserConfig>) => {
    const configs = Array.isArray(config) ? config : [config];

    validateServiceConfig(configs);
};

/**
 * Get the right configuration for the job.
 * @param {RequestData} data - The data the user sent in the request.
 */
const getConfig = (data: JobData, serviceConfig: IServiceConfig): Array<UserConfig> => {
    const source: ConfigSource = data.source;
    let config: Array<UserConfig>;

    debug(`Configuration source: ${source}`);
    switch (source) {
        case ConfigSource.file:
            validateConfigs(data.config);
            config = Array.isArray(data.config) ? data.config : [data.config];
            break;
        // TODO: TBD.
        // case ConfigSource.manual:
        default:
            config = serviceConfig.webhintConfigs;
            break;
    }

    return config;
};

/**
 * Get a Job that it is still valid.
 * @param {Array<IJob>} jobs - All the jobs for that url in the database.
 * @param config - Job configuration.
 */
const getActiveJob = (jobs: Array<IJob>, config: Array<UserConfig>, cacheTime: number) => {
    return jobs.find((job) => {
        // job.config in cosmosdb is undefined if the config saved was an empty object.
        return _.isEqual(job.config || [{}], config) && job.status !== JobStatus.error && (job.status !== JobStatus.finished || moment(job.finished).isAfter(moment().subtract(cacheTime, 'seconds')));
    });
};


/**
 * Create a new Job in the database.
 * @param {string} url - The url that the job will be use.
 * @param {UserConfig} config - The configuration for the job.
 */
const createNewJob = async (url: string, configs: Array<UserConfig>, jobRunTime: number): Promise<IJob> => {
    let hints: Array<Hint> = [];

    configs.forEach((config) => {
        const partialHints: Array<Hint> = Object.entries(config.hints).reduce((total, [key, value]) => {
            if (value === HintStatus.off) {
                return total;
            }

            total.push({
                category: utils.loadHint(key, []).meta.docs.category,
                messages: [],
                name: key,
                status: HintStatus.pending
            });

            return total;
        }, []);

        hints = hints.concat(partialHints);
    });

    let databaseJob: IJob;

    try {
        await database.connect(dbConnectionString);
        databaseJob = await database.job.add(url, JobStatus.pending, hints, configs, jobRunTime);
    } catch (e) {
        logger.error(`Could not connect to databse`, moduleName, e);
        throw e;
    }

    return {
        config: databaseJob.config,
        error: databaseJob.error,
        finished: databaseJob.finished,
        hints: databaseJob.hints,
        id: databaseJob.id,
        isNew: true,
        maxRunTime: databaseJob.maxRunTime,
        queued: databaseJob.queued,
        started: databaseJob.started,
        status: databaseJob.status,
        url: databaseJob.url,
        webhintVersion: null
    };
};


/**
 * Get the current active configuration.
 */
const getActiveConfig = async (): Promise<IServiceConfig> => {
    let currentConfig: IServiceConfig;

    try {
        await database.connect(dbConnectionString);
        currentConfig = await database.serviceConfig.getActive();

    } catch (e) {
        logger.error(`Could not connect to databse`, moduleName, e);
        throw e;
    }

    if (!currentConfig) {
        throw new Error('There is no active configuration');
    }

    const result: IServiceConfig = {
        active: currentConfig.active,
        jobCacheTime: currentConfig.jobCacheTime,
        jobRunTime: currentConfig.jobRunTime,
        name: currentConfig.name,
        webhintConfigs: currentConfig.webhintConfigs
    };

    return result;
};

/** Create a job to scan an url if it doesn't exist. */
export const createJob = async (request: RequestData): Promise<IJob> => {
    /*
        1. Validate input data
        2. Parse input data
        3. Lock database by url
        4. Check if the job exists having into account if the configuration is the same
            a) If the job exists
                I) The job is obsolete
                    i) Create a new job
                    ii) Add job to the queue
                II) The job isn't obsolte => return existing job
            b) If the job doesn't exist
                I) Create a new job
                II) Add job to the queue
        5. Unlock database by url
     */
    // const requestData: RequestData =  await getDataFromRequest(request);
    const jobData: JobData = await parseRequestData(request);

    const serviceConfig: IServiceConfig = await getActiveConfig();

    try {
        await database.connect(dbConnectionString);
    } catch (e) {
        logger.error(`Could not connect to databse`, moduleName, e);
        throw e;
    }

    const lock = await database.lock(jobData.url);

    const config: Array<UserConfig> = getConfig(jobData, serviceConfig);
    const jobs: Array<IJob> = await database.job.getByUrl(jobData.url);
    let job = getActiveJob(jobs, config, serviceConfig.jobCacheTime);

    if (jobs.length === 0 || !job) {
        logger.log('Active job not found, creating a new job', moduleName);

        job = await createNewJob(jobData.url, config, serviceConfig.jobRunTime);

        logger.log(`Created new Job with id ${job.id}`, moduleName);

        try {
            job.messagesInQueue = await queue.getMessagesCount();
            await sendMessagesToQueue(job);

            logger.log(`all messages sent to Service Bus`, moduleName);
        } catch (err) {
            // Update the job status to Error.
            const dbJob = await database.job.get(job.id);

            dbJob.status = JobStatus.error;

            let finished = await getTime();

            if (!finished) {
                finished = new Date();
                const queued = new Date(dbJob.queued);

                /*
                 * Ensure times are consistent.
                 */
                if (finished < new Date(dbJob.queued)) {
                    finished = queued;
                }
            }

            dbJob.started = finished;
            dbJob.finished = finished;

            if (err instanceof Error) {
                dbJob.error = JSON.stringify({
                    message: err.message,
                    stack: err.stack
                });
            } else {
                dbJob.error = JSON.stringify(err);
            }

            await database.job.update(dbJob);
        }
    }

    await database.unlock(lock);

    return job;
};

/** Get the status of a job. */
export const getJobStatus = async (id: string): Promise<IJob> => {
    try {
        await database.connect(dbConnectionString);
    } catch (e) {
        logger.error(`Could not connect to databse`, moduleName, e);
        throw e;
    }

    try {
        return await database.job.get(id);
    } catch (err) {
        logger.error(err, moduleName);
        throw err;
    }
};

export const getScannerStatus = async (): Promise<IStatus[]> => {
    const from = moment().subtract(1, 'day');

    try {
        return await statusManager.getStatus(from.toDate());
    } catch (err) {
        logger.error(err, moduleName);
        throw err;
    }
};
