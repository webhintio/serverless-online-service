import { AzureFunction, Context, HttpRequest } from '@azure/functions';

import { createJob } from '../../scanner/scanner-api';

export const run: AzureFunction = async (context: Context, req: HttpRequest): Promise<void> => {
    context.log('Processing request to create new job.');

    try {
        const url = req.body.url;

        if (!url) {
            throw Error('url is required');
        }

        const job = await createJob(url);

        context.res = {
            body: job,
            status: 200
        };
    } catch (err) {
        context.res = {
            body: 'Could not create job',
            status: 500
        };
        throw err;
    }

    context.done();
};
