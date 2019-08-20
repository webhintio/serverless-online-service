import * as uuid from 'uuid/v4';

import { UserConfig } from '@hint/utils';
import { DocumentQuery } from 'mongoose';
import * as moment from 'moment';

import { debug as d } from '../../../utils/debug';
import { IJob } from '../../../types';
import { IJobModel, Job } from '../models/job';
import { JobStatus } from '../../../enums/status';
import { Hint } from '../../../types';
import { getTime } from '../../ntp/ntp';
import { connect } from './common';

const debug: debug.IDebugger = d(__filename);

/**
 * Get all the jobs from the database for a given url.
 * @param {string} url - Url we want to look for.
 */
export const getByUrl = async (url: string): Promise<Array<IJob>> => {
    await connect();
    debug(`Getting jobs by url: ${url}`);
    const query = Job.find({ url });

    const jobs = await query.exec();

    debug(`${jobs.length} found for the url ${url}`);

    return jobs;
};

/**
 * Get a job from the database.
 * @param {string} id - Id we want to look for.
 */
export const get = async (id: string): Promise<IJobModel> => {
    debug(`Getting job by id: ${id}`);
    await connect();
    const query = Job.findOne({ id });

    const job: IJobModel = await query.exec();

    debug(`job with id ${id} ${job ? 'found' : 'not found'}`);

    return job;
};

/**
 * Create a new Job into the database.
 * @param {string} url - Url for the job.
 * @param {JobStatus} status - Current status for the job.
 * @param {Array<Hint>} hints - Hints the job will check.
 * @param config - Configuration for the job.
 */
export const add = async (url: string, status: JobStatus, hints: Array<Hint>, config: Array<UserConfig>, jobRunTime: number): Promise<IJob> => {
    debug(`Creating new job for url: ${url}`);
    await connect();

    let queued = await getTime();

    /*
     * If ntp service has some problem, use the current
     * date in the machine.
     */
    if (!queued) {
        queued = new Date();
    }

    const job = new Job({
        config,
        hints,
        id: uuid(),
        maxRunTime: jobRunTime,
        queued,
        status,
        url
    });

    await job.save();

    debug(`job for url ${url} saved in database `);

    return job;
};

/**
 * Update a job in database.
 * @param {IJobModel} job Job we want to update.
 */
export const update = async (job: IJobModel) => {
    await connect();
    job.markModified('hints');

    await job.save();
};

/**
 * Get all jobs between two dates using an specific field.
 * @param {string} field - Field to filter.
 * @param {Date} from - Initial date.
 * @param {Date} to - End date.
 */
export const getByDate = async (field: string, from: Date, to: Date): Promise<Array<IJob>> => {
    await connect();
    const x = {
        [field]: {
            $gte: from,
            $lt: to
        }
    };
    const query: DocumentQuery<Array<IJobModel>, IJobModel> = Job.find(x);

    const results: Array<IJob> = await query.exec();

    return results;
};
