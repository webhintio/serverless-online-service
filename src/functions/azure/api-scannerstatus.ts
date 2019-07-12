import { AzureFunction, Context, HttpRequest } from '@azure/functions';
import { getScannerStatus } from '../../lib/microservices/scanner-api/scanner-api';

export const run: AzureFunction = async (context: Context, req: HttpRequest): Promise<void> => {
    context.log('Processing Scanner Status request');

    try {
        const scannerStatus = await getScannerStatus();

        context.res = {
            body: scannerStatus,
            status: 200
        };
    } catch (err) {
        context.res = {
            body: 'Could not get scanner status',
            status: 500
        };
        throw err;
    }

    context.done();
};
