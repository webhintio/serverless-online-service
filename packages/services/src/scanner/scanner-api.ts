import * as _ from 'lodash';
import * as moment from 'moment';
import { UserConfig } from '@hint/utils';
import {
    database,
    Hint,
    HintStatus,
    IJob,
    IJobModel,
    IServiceConfig,
    JobStatus,
    logger,
    ntp,
    Queue
} from '@online-service/utils';

const { getTime } = ntp;
const { QueueConnection: queueConnection } = process.env; // eslint-disable-line no-process-env

let queue: Queue | null = null;
const moduleName: string = 'Scanner API';
const categories = require('./categories.json');
const hintExtends = require('./hint-extends.json');

const connectToQueue = () => {
    if (queue) {
        return queue;
    }

    /* istanbul ignore else */
    if (queueConnection) {
        queue = new Queue('webhint-jobs', queueConnection);
    } else {
        logger.log('Queue connection string not found', moduleName);

        throw new Error('Queue connection string not found');
    }

    return queue;
};

/**
 * Split the job in as many messages as configurations it has.
 * @param {IJob} job - Job to send to the queue.
 */
const sendMessagesToQueue = async (job: IJob) => {
    queue = connectToQueue();

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

const getHintsFromExtends = (configsExtended: Array<string> | undefined): Array<Hint> => {
    if (!configsExtended) {
        return [];
    }

    const hints: Array<Hint> = [];

    for (const ext of configsExtended) {
        const partialHints = hintExtends[ext];

        for (const hintName of partialHints) {
            const currentHint = hints.find((hint) => {
                return hint.name === hintName;
            });

            /* istanbul ignore else */
            if (!currentHint) {
                hints.push({
                    category: categories[hintName],
                    messages: [],
                    name: hintName,
                    status: HintStatus.pending
                });
            }
        }
    }

    return hints;
};

const getHints = (userConfigs: Array<UserConfig>) => {
    let hints: Array<Hint> = [];

    userConfigs.forEach((userConfig) => {
        let partialHints = getHintsFromExtends(userConfig.extends);

        partialHints = Object.entries(userConfig.hints!).reduce((total: Array<Hint>, [hintName, severity]) => {
            if (severity === HintStatus.off) {
                return total;
            }

            const hintExists = total.some((hint) => {
                return hint.name === hintName;
            });

            /* istanbul ignore else */
            if (!hintExists) {
                total.push({
                    category: categories[hintName],
                    messages: [],
                    name: hintName,
                    status: HintStatus.pending
                });
            }

            return total;
        }, partialHints);

        hints = hints.concat(partialHints);
    });

    return hints;
};

/**
 * Create a new Job in the database.
 * @param {string} url - The url that the job will be use.
 * @param {UserConfig} config - The configuration for the job.
 */
const createNewJob = async (url: string, configs: Array<UserConfig>, jobRunTime: number): Promise<IJob> => {
    const hints: Array<Hint> = getHints(configs);

    const databaseJob = await database.job.add(url, JobStatus.pending, hints, configs, jobRunTime);

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
        webhintVersion: ''
    };
};

/**
 * Get the current active configuration.
 */
const getActiveConfig = async (): Promise<IServiceConfig> => {
    const currentConfig = await database.serviceConfig.getActive();

    /* istanbul ignore if */
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
export const createJob = async (url: string): Promise<IJob> => {
    /*
     *   1. Validate input data
     *   2. Get current configuration
     *   3. Lock database by url
     *   4. Check if the job exists having into account if the configuration is the same
     *       a) If the job exists
     *           I) The job is obsolete
     *               i) Create a new job
     *               ii) Add job to the queue
     *           II) The job isn't obsolte => return existing job
     *       b) If the job doesn't exist
     *           I) Create a new job
     *           II) Add job to the queue
     *   5. Unlock database by url
     */

    if (!url) {
        throw new Error('Url is required');
    }

    const serviceConfig: IServiceConfig = await getActiveConfig();
    const lock = await database.lock(url);
    const config = serviceConfig.webhintConfigs;
    const jobs: Array<IJob> = await database.job.getByUrl(url);
    let job = getActiveJob(jobs, config, serviceConfig.jobCacheTime);

    if (jobs.length === 0 || !job) {
        logger.log('Active job not found, creating a new job', moduleName);

        job = await createNewJob(url, config, serviceConfig.jobRunTime);

        logger.log(`Created new Job with id ${job.id}`, moduleName);

        try {
            queue = connectToQueue();

            job.messagesInQueue = await queue.getMessagesCount();
            await sendMessagesToQueue(job);

            logger.log(`all messages sent to Service Bus`, moduleName);
        } catch (err) {
            // Update the job status to Error.
            const dbJob = await database.job.get(job.id as string) as IJobModel;

            dbJob.status = JobStatus.error;

            let finished = await getTime();

            /* istanbul ignore if */
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

            /* istanbul ignore else */
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
export const getJobStatus = async (id: string): Promise<IJob | null> => {
    try {
        return await database.job.get(id);
    } catch (err) /* istanbul ignore next */ {
        logger.error(err, moduleName);
        throw err;
    }
};
