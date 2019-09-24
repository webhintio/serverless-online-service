import { AzureFunction, Context } from '@azure/functions';
import { IJob } from '@online-service/utils';

import * as workerService from '../../worker/worker';

export const run: AzureFunction = async (context: Context, job: IJob): Promise<void> => {
    context.log(`Start scanning: ${job.url} - Part ${job.partInfo ? job.partInfo.part : '-'} of ${job.partInfo ? job.partInfo.totalParts : '-'}`);
    await workerService.run(job);
    context.log(`Scan end for: ${job.url}`);
    context.done();
};
