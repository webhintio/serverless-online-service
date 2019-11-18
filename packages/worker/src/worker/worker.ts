import * as _ from 'lodash';
import { fork, ChildProcess } from 'child_process';
import * as path from 'path';

import { HintConfig, Problem, Severity } from 'hint';
import { getHintsFromConfiguration, HintsConfigObject } from '@hint/utils';
import {
    debug as d,
    generateLog,
    Hint,
    HintStatus,
    IJob,
    JobStatus,
    logger,
    ntp,
    Queue,
    JobResult
} from '@online-service/utils';

const { QueueConnection: queueConnectionString } = process.env; // eslint-disable-line no-process-env
const { getTime } = ntp;
const debug = d(__filename);
const moduleName = 'Worker Service';
const MAX_MESSAGE_SIZE = 220 * 1024; // size in kB

/**
 * Parse the result returned for webhint.
 * @param {IJob} job - Job to write the result.
 * @param normalizedHints - Normalized job hints.
 */
const parseResult = (job: IJob, result: Problem[], normalizedHints: HintsConfigObject) => {
    const hints = job.hints;
    const groupedData = _.groupBy(result, 'hintId');

    hints.forEach((hint: Hint) => {
        // Skip hint if it is not in the configuration file.
        if (!normalizedHints[hint.name]) {
            return;
        }
        const messages: Problem[] = groupedData[hint.name];

        if (!messages || messages.length === 0) {
            hint.status = HintStatus.pass;

            return;
        }

        hint.status = Severity.error === messages[0].severity ? HintStatus.error : HintStatus.warning;
        hint.messages = messages;
    });
};

/**
 * Determine if a hint is off or not.
 * @param hintConfiguration Hint configuration.
 */
const hintOff = (hintConfiguration: HintConfig | HintConfig[]) => {
    if (Array.isArray(hintConfiguration)) {
        return hintConfiguration[0] === 'off';
    }

    return hintConfiguration === 'off';
};

/**
 * Set each hint in the configuration to error.
 * @param {IJob} job - Job to write the errors.
 * @param normalizedHints - Normalized job hints.
 */
const setHintsToError = (job: IJob, normalizedHints: HintsConfigObject, error: Error) => {
    const hints = job.hints;
    const isTimeOutError = error.message === 'TIMEOUT';
    const messageOptions = {
        general: 'Error in webhint analyzing this hint',
        timeout: `webhint didn't return the result fast enough. Please try later and if the problem continues, contact us.`
    };

    hints.forEach((hint: Hint) => {
        const hintConfiguration = normalizedHints[hint.name];

        // Skip hint if it is not in the configuration file.
        if (!hintConfiguration) {
            return;
        }

        if (hintOff(hintConfiguration)) {
            hint.status = HintStatus.off;

            return;
        }

        hint.status = isTimeOutError ? HintStatus.warning : HintStatus.error;
        const message = isTimeOutError ? messageOptions.timeout : messageOptions.general;
        const severity = isTimeOutError ? Severity.warning : Severity.error;

        hint.messages = [{
            category: hint.category,
            hintId: hint.name,
            location: {
                column: -1,
                elementColumn: -1,
                elementLine: -1,
                line: -1
            },
            message,
            resource: null as any,
            severity,
            sourceCode: null as any
        }];
    });
};

/**
 * Return the webhint version the worker is using.
 */
const getWebhintVersion = (): string => {
    const pkg = require('hint/package.json');

    return pkg.version;
};

/**
 * Directly removes the messages for a hint with a "Too many errors" message.
 * @param {Hint} hint The hint to clean.
 */
const tooManyErrorsMessage = (hint: Hint): Hint => {
    hint.messages = [{
        category: hint.category,
        hintId: hint.messages[0].hintId,
        location: {
            column: -1,
            elementColumn: -1,
            elementLine: -1,
            line: -1
        },
        message: 'This hint has too many errors, please use webhint locally for more details',
        resource: null as any,
        severity: hint.messages[0].severity,
        sourceCode: null as any
    }];

    return hint;
};

/**
 * Clean all messages in hints and set a default one.
 * @param {IJob} job Job to clean.
 * @param normalizedHints - Normalized job hints.
 */
const cleanMessagesInHints = (job: IJob, normalizedHints: HintsConfigObject) => {
    job.hints.forEach((hint) => {
        if (hint.status === HintStatus.pending || hint.status === HintStatus.pass || !normalizedHints[hint.name]) {
            return;
        }

        tooManyErrorsMessage(hint);
    });
};

/**
 * Sends a message with the results of a job.
 * @param {Queue} queue - Queue where to send the message.
 * @param job - Job processed that needs update.
 * @param normalizedHints - Normalized job hints.
 */
const sendMessage = async (queue: Queue, job: IJob, normalizedHints: HintsConfigObject) => {
    try {
        logger.log(generateLog('Sending message for Job', job, { showHint: true }), moduleName);
        await queue.sendMessage(job);
    } catch (err) {
        // The status code can be 413 or 400.
        /* istanbul ignore else */
        if (err.statusCode === 413 || (err.statusCode === 400 && err.message.includes('The body of the message is too large.'))) {
            cleanMessagesInHints(job, normalizedHints);
            await queue.sendMessage(job);
        } else {
            throw err;
        }
    }
};

/**
 * Sends the results to the results queue.
 * @param {Queue} queue - Queue where to send the messages.
 * @param {IJob} job - Job to get the messages.
 * @param normalizedHints - Normalized job hints.
 */
const sendResults = async (queue: Queue, job: IJob, normalizedHints: HintsConfigObject) => {
    let messageSize = JSON.stringify(job).length;

    if (messageSize <= MAX_MESSAGE_SIZE) {
        await sendMessage(queue, job, normalizedHints);

        return;
    }

    const cloneHints = job.hints.slice(0);
    const cloneJob = _.cloneDeep(job);

    cloneJob.hints = [];

    while (cloneHints.length > 0) {
        let hint = cloneHints.pop()!;
        let hintSize = JSON.stringify(hint).length;

        /* istanbul ignore if */
        if (!normalizedHints[hint.name]) {
            continue; // eslint-disable-line no-continue
        }

        if (hintSize > MAX_MESSAGE_SIZE) {
            hint = tooManyErrorsMessage(hint);
            hintSize = JSON.stringify(hint).length;
        }

        messageSize = JSON.stringify(cloneJob).length;

        // Size is too big with the latest hint, we have to send all the previous ones
        if (messageSize + hintSize > MAX_MESSAGE_SIZE) {
            // We send the previous version of `cloneJob`
            await sendMessage(queue, cloneJob, normalizedHints);
            // We clean `cloneJob`'s hints to not repeat results and add the new one
            cloneJob.hints = [hint];
        } else {
            // Add hint to job
            cloneJob.hints.push(hint);
        }
    }

    // We might not have reached MAX_MESSAGE_SIZE with the last hint, send any remaining ones
    if (cloneJob.hints.length > 0) {
        await sendMessage(queue, cloneJob, normalizedHints);
    }
};

const getConsistentTime = async (previousTime: Date) => {
    let result = await getTime();

    /* istanbul ignore else */
    if (!result) {
        const previousDate = new Date(previousTime);

        result = new Date();

        /*
         * Ensure times are consistent.
         */
        /* istanbul ignore if */
        if (result < previousDate) {
            result = previousDate;
        }
    }

    return result;
};

/**
 * Send the job to the queue with the status `started`
 * @param {Queue} queue - Queue to send the message.
 * @param {IJob} job - Job to send in the message.
 */
const sendStartedMessage = async (queue: Queue, job: IJob) => {
    job.started = await getConsistentTime(job.queued);
    job.status = JobStatus.started;

    debug(`Changing job status to ${job.status}`);
    await queue.sendMessage(job);

    logger.log(generateLog('Started message sent for Job', job), moduleName);
};

/**
 * Send a job with an error to the queue.
 * @param error - Error to set in the job.
 * @param {Queue} queue - Queue to send the message
 * @param {IJob} job - Job to send to the queue
 */
const sendErrorMessage = async (error: Error, queue: Queue, job: IJob) => {
    const isTimeOutError = error.message === 'TIMEOUT';

    /* istanbul ignore else */
    if (error instanceof Error) {
        // When we try to stringify an instance of Error, we just get an empty object.
        job.error = {
            message: error.message,
            stack: error.stack
        };
    } else {
        job.error = error;
    }

    job.log = (error as any).log;
    job.status = isTimeOutError ? JobStatus.finished : JobStatus.error;
    job.finished = await getConsistentTime(job.started);

    debug(`Sending job result with status: ${job.status}`);
    await queue.sendMessage(job);
};

/**
 * Kill a given process.
 * @param {ChildProcess} runner Process to kill.
 */
const killProcess = (runner: ChildProcess) => {
    try {
        runner.kill('SIGTERM');
    } catch (err) /* istanbul ignore next */ {
        logger.error('Error closing webhint process', moduleName);
    }
};

const getLastLogLines = (log: string, numberOfLines = 5): string => {
    const rawLines = log.split('\n');

    const lines = rawLines.reduce((total, line) => {
        /* istanbul ignore if */
        if (line) {
            total.push(line);
        }

        return total;
    }, [] as string[]);

    return lines.slice(lines.length - numberOfLines).join('\n');
};

/**
 * Create a child process to run webhint.
 * @param {IJob} job - Job to run in webhint.
 */
const runWebhint = (job: IJob): Promise<Problem[]> => {
    return new Promise((resolve, reject) => {
        /*
         * If we don't set execArgv to [], when the process is created, the execArgv
         * has the same parameters as his father so if we are debugging, the child
         * process try to debug in the same port, and that throws an error.
         *
         * We need to run webhint in another process because we need to be able to capture
         * `uncaughtException` and `unhandledRejection` to close the browser. If we don't
         * do that, we can have memory and cpu leaks.
         */
        const runner = fork(path.join(__dirname, 'webhint-runner.js'), ['--debug'], { execArgv: [], stdio: ['pipe', 'pipe', 'pipe', 'ipc'] });
        let timeoutId: NodeJS.Timer | null;

        let log = '';

        /* istanbul ignore next */
        runner.stdout!.on('data', (data) => {
            const message = data.toString('utf-8');

            logger.log(message);
        });

        /* istanbul ignore next */
        runner.stderr!.on('data', (data) => {
            const message = data.toString('utf-8');

            log += message;
            logger.log(message);
        });

        runner.on('message', (result: JobResult) => {
            logger.log(generateLog('Message from webhint process received for job', job), moduleName);
            if (timeoutId) {
                clearTimeout(timeoutId);
                timeoutId = null;
            }
            killProcess(runner);

            if (result.ok) {
                return resolve(result.messages!);
            }

            let error = JSON.parse(result.error!);

            if (typeof error === 'string') {
                error = new Error(error);
            }

            error.log = getLastLogLines(log);

            return reject(error);
        });

        runner.send(job);

        timeoutId = setTimeout(() => {
            debug(`Job with id: ${job.id} timeout. Killing process and reporting an error`);
            killProcess(runner);

            const error = new Error('TIMEOUT');

            (error as any).log = getLastLogLines(log);

            reject(error);
        }, job.maxRunTime * 1000 || 180000);
    });
};

export const run = async (job: IJob) => {
    const queueResults = new Queue('webhint-results', queueConnectionString!);
    const webhintVersion = getWebhintVersion();

    logger.log(generateLog('Processing Job', job), moduleName);
    const configuredHints = getHintsFromConfiguration(job.config[0]);

    try {
        job.webhintVersion = webhintVersion;

        await sendStartedMessage(queueResults, job);
        const result = await runWebhint(job);

        job.finished = await getConsistentTime(job.started);
        job.status = JobStatus.finished;

        parseResult(job, result, configuredHints);

        debug(`Sending job result with status: ${job.status}`);

        await sendResults(queueResults, job, configuredHints);

        logger.log(generateLog('Processed Job', job), moduleName);
    } catch (err) {
        logger.error(generateLog('Error processing Job', job), moduleName, err);

        debug(err);

        setHintsToError(job, configuredHints, err);

        await sendErrorMessage(err, queueResults, job);

        return;
    }
};
