/* eslint no-process-exit:off */

import { createAnalyzer, Analyzer } from 'hint';

import { IJob, JobResult, logger } from '@online-service/utils';

const moduleName: string = 'Webhint Runner';
let analyzer: Analyzer;
let job: IJob;

const createErrorResult = (err: Error): JobResult => {
    const jobResult: JobResult = {
        error: null,
        messages: null,
        ok: false
    };

    if (err instanceof Error) {
        // When we try to stringify an instance of Error, we just get an empty object.
        jobResult.error = JSON.stringify({
            message: err.message,
            stack: err.stack
        });
    } else {
        jobResult.error = JSON.stringify(err);
    }

    return jobResult;
};

const closeAnalyzer = async () => {
    if (analyzer) {
        try {
            await analyzer.close();
        } catch (e) {
            // Ignore error.
        }
    }
};

process.once('uncaughtException', async (err) => {
    await closeAnalyzer();
    console.log(err.message);
    console.log(err.stack);
    process.send!(createErrorResult(err));
    process.exit(1);
});

process.once('unhandledRejection', async (reason: any) => {
    await closeAnalyzer();
    const source = reason.error ? reason.error : reason;

    console.log(source);
    /*
     * `reason` can not be an instance of Error, but its behavior with JSON.stringify is the same, returns {}
     * Creating a new Error we ensure that reason is going to be an instance of Error.
     */
    process.send!(createErrorResult(new Error(source)));
    process.exit(1);
});

process.on('SIGTERM', async () => {
    await closeAnalyzer();

    process.exit();
});

process.on('SIGINT', async () => {
    await closeAnalyzer();

    process.exit();
});

/**
 * Run a Job in webhint.
 * @param {IJob} job - Job to run in webhint.
 */
const run = async (j: IJob) => {
    job = j;

    const partInfo = job.partInfo ? job.partInfo : {
        part: '-',
        totalParts: '-'
    };

    logger.log(`Running job: ${job.id} - Part ${partInfo.part} of ${partInfo.totalParts}`, moduleName);
    let result: JobResult = {
        error: null,
        messages: null,
        ok: false
    };

    try {
        const analyzer = createAnalyzer(job.config[0], { formatters: [] });

        const analysisResult = await analyzer.analyze(job.url);

        result.messages = analysisResult[0].problems;
        result.ok = true;
    } catch (e) {
        logger.error(`Error runing job ${job.id} - Part ${partInfo.part} of ${partInfo.totalParts}`, moduleName, e);
        result = createErrorResult(e);
    } finally {
        if (analyzer) {
            await analyzer.close();
        }

        logger.log(`Sending result for job ${job.id} - Part ${partInfo.part} of ${partInfo.totalParts}`, moduleName);
        process.send!(result);
    }
};

process.on('message', run);
