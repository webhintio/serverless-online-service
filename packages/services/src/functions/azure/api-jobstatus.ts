import { AzureFunction, Context, HttpRequest } from '@azure/functions';

import { getJobStatus } from '../../scanner/scanner-api';

export const run: AzureFunction = async (context: Context, req: HttpRequest): Promise<void> => {
    context.log('Processing Job Status request');

    if (!req.query.id) {
        context.res = {
            body: 'Job id is required',
            status: 400
        };
    }

    try {
        const job = await getJobStatus(req.query.id);

        context.res = {
            body: job,
            status: 200
        };
    } catch (err) {
        context.res = {
            body: 'Could not get job',
            status: 500
        };
        throw err;
    }

    context.done();
};
