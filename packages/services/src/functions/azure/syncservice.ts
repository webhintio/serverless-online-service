import { AzureFunction, Context } from '@azure/functions';
import { IJob } from '@online-service/utils';

import * as syncService from '../../sync/sync-service';

export const run: AzureFunction = async (context: Context, job: IJob): Promise<void> => {
    await syncService.run(job);
    context.done();
};
