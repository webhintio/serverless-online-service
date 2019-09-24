import { AzureFunction, Context } from '@azure/functions';

import * as statusManager from '../../status/status';

export const run: AzureFunction = async (context: Context, timer: any): Promise<void> => {
    await statusManager.updateStatuses();
    context.done();
};
