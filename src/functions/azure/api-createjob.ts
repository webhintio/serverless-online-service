import { AzureFunction, Context, HttpRequest } from '@azure/functions';
import { createJob } from '../../lib/microservices/scanner-api/scanner-api';

export const run: AzureFunction = async (context: Context, req: HttpRequest): Promise<void> => {
    context.log('Processing request to create new job.');

    try {
        const job = await createJob(req.body);

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
