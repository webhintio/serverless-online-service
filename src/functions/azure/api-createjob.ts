import { AzureFunction, Context, HttpRequest } from '@azure/functions';
import { createJob } from '../../lib/microservices/scanner-api/scanner-api';

export const run: AzureFunction = async (context: Context, req: HttpRequest): Promise<void> => {
    context.log('Processing request to create new job.');

    try {
        const tokens = req.body.split('=');

        if (!tokens[0] || !tokens[1] || tokens[0] !== 'url') {
            throw Error('Url is required');
        }

        const url = tokens[1].replace(/(%[0-9A-Z]{2})+/g, decodeURIComponent);
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


