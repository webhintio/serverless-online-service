import { AzureFunction, Context } from '@azure/functions';

// import * as syncService from '../../lib/microservices/sync-service/sync-service';
// import { IJob } from '../../lib/types';

export const run: AzureFunction = (context: Context): void => {
    // await syncService.run(job);
    context.done();
};
