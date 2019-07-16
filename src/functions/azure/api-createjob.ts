import { AzureFunction, Context, HttpRequest } from '@azure/functions';
import { createJob } from '../../lib/microservices/scanner-api/scanner-api';
import { RequestData } from '../../lib/types';

export const run: AzureFunction = async (context: Context, req: HttpRequest): Promise<void> => {
    context.log('Processing request to create new job.');

    try {
        // TODO: Talk to David about which scenario
        // we are sending multipart data with hints
        // and files

        // Also, this needs utils.loadHint, which fails
        // cause we dont have hint dependency here

        const rData: RequestData = {
            fields: { url: 'http://www.test.com' },
            files: []
        };
        const job = await createJob(rData);

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


