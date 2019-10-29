import { AzureFunction, Context, HttpRequest } from '@azure/functions';

import { createJob } from '../../scanner/scanner-api';

export const run: AzureFunction = async (context: Context, req: HttpRequest): Promise<void> => {
    context.log('Processing request to create new job.');

    try {
        const tokens = JSON.parse(req.body);

        if (!tokens.url) {
            throw Error('url is required');
        }

        const job = await createJob(tokens.url);

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
