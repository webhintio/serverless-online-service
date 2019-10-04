import * as moment from 'moment';
import * as _ from 'lodash';
const { Severity } = require('./severity');

import {
    database as db,
    Hint,
    HintStatus,
    IJob,
    IStatus,
    IStatusHintDetail,
    IStatusHints,
    IStatusModel,
    IStatusUrl,
    JobStatus,
    logger,
    Queue,
    StatusAverage,
    StatusHintDetailList,
    StatusFinished,
    StatusQueue,
    StatusScans
} from '@online-service/utils';


const moduleName = 'Status service';
const { QueueConnection: queueConnectionString } = process.env; // eslint-disable-line no-process-env
let queueJobs: Queue;
let queueResults: Queue;

class StatusHints implements IStatusHints {
    public errors: number;
    public passes: number;
    public warnings: number;
    public hints: StatusHintDetailList;

    public constructor() {
        this.errors = 0;
        this.passes = 0;
        this.warnings = 0;
        this.hints = {};
    }
}

class Status implements IStatus {
    public average: StatusAverage;
    public date: Date;
    public queues?: StatusQueue;
    public scans: StatusScans;
    public hints: StatusHints;

    public constructor(status: IStatus) {
        this.average = status.average;
        this.date = status.date;
        this.queues = status.queues;
        this.hints = status.hints;
        this.scans = status.scans;
    }
}

class StatusUrl implements IStatusUrl {
    public errors: number;
    public passes: number;
    public warnings: number;
    public url: string;

    public constructor(url: string) {
        this.errors = 0;
        this.passes = 0;
        this.warnings = 0;
        this.url = url;
    }
}

class StatusHintDetail implements IStatusHintDetail {
    public errors: number;
    public passes: number;
    public warnings: number;
    public urls: IStatusUrl[];

    public constructor() {
        this.errors = 0;
        this.passes = 0;
        this.urls = [];
        this.warnings = 0;
    }
}

/**
 * Calculate the average time in an array of jobs.
 * @param {IJob[]} jobs - Jobs to calculate the average.
 * @param {string} fieldEnd - First field to calculate the average.
 * @param {string} fieldStart - Second field to calculate the average.
 */
const avg = (jobs: IJob[], fieldEnd: keyof IJob, fieldStart: keyof IJob): number => {
    if (jobs.length === 0) {
        return 0;
    }

    const result = jobs.reduce((total: { acc: number; length: number }, job: IJob) => {
        let field;

        if (!job[fieldEnd]) {
            field = fieldEnd;
        } else if (!job[fieldStart]) {
            field = fieldStart;
        }

        if (field) {
            console.log(`Field: ${field} doesn't exists in job ${job.id}`);

            /*
             * If we are missing any field, ignore the value.
             */
            total.length--;

            return total;
        }

        const delta = job[fieldEnd].getTime() - job[fieldStart].getTime();

        if (delta === 0) {
            /*
             * If the time difference is 0, ignore the value.
             * This should happen only when there was an error
             * with the time service, or when there was an error
             * sending messages to the queue for a new job.
             */
            total.length--;

            return total;
        }

        total.acc += delta;

        return total;
    }, {
        acc: 0,
        length: jobs.length
    });

    if (result.length === 0) {
        return Number.MAX_SAFE_INTEGER;
    }

    return result.acc / result.length;
};

/**
 * Split finished jobs in `error` or `success`.
 * @param {IJob[]} jobs - Array of jobs.
 */
const getFinishedByStatus = (jobs: IJob[]): StatusFinished => {
    return jobs.reduce((total: StatusFinished, job: IJob) => {
        if (job.status === JobStatus.error) {
            total.error++;
        } else {
            total.success++;
        }

        return total;
    },
    {
        error: 0,
        success: 0
    });
};

/**
 * Set the number of errors and warnings in a hint.
 * @param {StatusUrl} url - Url status where we want to set the number of errors and warnings.
 * @param {Hint} hint - Hint with the error messages.
 */
const setUrlCounts = (url: StatusUrl, hint: Hint) => {
    const messagesGrouped = _.groupBy(hint.messages, 'severity');
    const errors = messagesGrouped[Severity.error.toString()];
    const warnings = messagesGrouped[Severity.warning.toString()];

    url.errors = errors ? errors.length : 0;
    url.warnings = warnings ? warnings.length : 0;
};

/**
 * Get the status of the hints in a collection of IJobs.
 * @param {IJob[]} jobs -Jobs to get the Status of the hints.
 */
const getHintsStatus = (jobs: IJob[]) => {
    const result: IStatusHints = new StatusHints();

    jobs.reduce((total, job) => {
        const hints = job.hints;

        hints.forEach((hint) => {
            let detail = total.hints[hint.name];

            if (!detail) {
                detail = new StatusHintDetail();

                total.hints[hint.name] = detail;
            }

            const url = new StatusUrl(job.url);

            detail.urls.push(url);

            switch (hint.status) {
                case HintStatus.pass:
                    url.passes++;
                    detail.passes++;
                    total.passes++;
                    break;
                case HintStatus.error: {
                    setUrlCounts(url, hint);

                    detail.errors++;
                    total.errors++;
                    break;
                }
                case HintStatus.warning:
                    setUrlCounts(url, hint);
                    detail.warnings++;
                    total.warnings++;
                    break;
                /* istanbul ignore next */
                default:
                    break;
            }
        });

        return total;
    }, result);

    return result;
};

/**
 * Update the statuses since a date.
 * @param {Date} since - Date to start calculating the statuses.
 */
const updateStatusesSince = async (since: Date) => {
    let from = moment(since);
    let to = moment(from).add(15, 'm');
    let last: IStatusModel | null = null;

    while (to.isBefore(moment())) {
        const fromDate = from.toDate();
        const toDate = to.toDate();

        const [jobsCreated, jobsStarted, jobsFinished]: [IJob[], IJob[], IJob[]] = await Promise.all([
            db.job.getByDate('queued', fromDate, toDate),
            db.job.getByDate('started', fromDate, toDate),
            db.job.getByDate('finished', fromDate, toDate)
        ]);

        logger.log(`Found: ${jobsCreated.length} jobs created from ${from.toISOString()} to ${to.toISOString()}`, moduleName);
        logger.log(`Found: ${jobsStarted.length} jobs started from ${from.toISOString()} to ${to.toISOString()}`, moduleName);
        logger.log(`Found: ${jobsFinished.length} jobs finished from ${from.toISOString()} to ${to.toISOString()}`, moduleName);

        const result: IStatus = {
            average: {
                finish: avg(jobsFinished, 'finished', 'started'),
                start: avg(jobsStarted, 'started', 'queued')
            },
            date: to.toDate(),
            hints: getHintsStatus(jobsFinished),
            scans: {
                created: jobsCreated.length,
                finished: getFinishedByStatus(jobsFinished),
                started: jobsStarted.length
            }
        };

        last = await db.status.add(result);

        from = to;
        to = moment(from).add(15, 'm');
    }

    if (last) {
        const [messagesJobs, messagesResults] = await Promise.all([
            queueJobs.getMessagesCount(),
            queueResults.getMessagesCount()
        ]);

        last.queues = {
            jobs: messagesJobs,
            results: messagesResults
        };

        await db.status.update(last, 'queues');
    }
};

/**
 * Update the scanner status.
 */
export const updateStatuses = async () => {
    let error = false;

    try {
        /* istanbul ignore else */
        if (!queueJobs) {
            queueJobs = new Queue('webhint-jobs', queueConnectionString!);
        }

        /* istanbul ignore else */
        if (!queueResults) {
            queueResults = new Queue('webhint-results', queueConnectionString!);
        }

        const lastStatus = await db.status.getMostRecent();
        // Online scanner was published in this date, no results before.
        let since: Date = moment('2017-10-15').toDate();

        /* istanbul ignore else */
        if (lastStatus) {
            since = lastStatus.date;
        }

        logger.log(`Updating status since: ${since.toISOString()}`);
        await updateStatusesSince(since);
        logger.log(`Status database updated`);
    } catch (err) {
        error = true;
        logger.log(`Error updating status database: ${err.message}`);
    } finally {
        await db.disconnect();
        logger.log(`Service finished with${error ? '' : 'out'} error(s)`, moduleName);
    }
};

/**
 * Calculate the closest quarter of an hour.
 * @param {Date} date - Date to calculate the closest quarter of an hour.
 */
const getCloserQuarter = (date: Date): moment.Moment => {
    const d = moment(date);
    const currentMinute = d.minutes();

    return d.minutes(Math.floor(currentMinute / 15) * 15).startOf('minute');
};

/**
 * Get the online scanner status.
 * @param {Date} from - Time since we want to get results.
 * @param {Date} to - Time until we want to get results.
 */
export const getStatus = async (from: Date = new Date(), to: Date = new Date()): Promise<IStatus[]> => {
    const fromQuarter = getCloserQuarter(from).toDate();
    const toQuarter = getCloserQuarter(to).toDate();
    const result = await db.status.getByDate(fromQuarter, toQuarter);

    return result.map((status) => {
        return new Status(status);
    });
};
