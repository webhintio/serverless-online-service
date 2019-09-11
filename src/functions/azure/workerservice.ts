import { AzureFunction, Context } from '@azure/functions';

import * as workerService from '../../lib/microservices/worker-service/worker-service';
import { IJob } from '../../lib/types';

export const run: AzureFunction = async (context: Context, job: IJob): Promise<void> => {
    context.log(`Start scanning: ${job.url} - Part ${job.partInfo ? job.partInfo.part : '-'} of ${job.partInfo ? job.partInfo.totalParts : '-'}`);
    await workerService.run(job);
    context.log(`Scan end for: ${job.url}`);
    context.done();
};
