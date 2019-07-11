import { AzureFunction, Context, HttpRequest } from '@azure/functions';

export const run: AzureFunction = (context: Context, req: HttpRequest): void => {
    context.log('HTTP trigger function processed a request.');
    const name = (req.query.name || (req.body && req.body.name));

    if (name) {
        context.res = {
            // status: 200, /* Defaults to 200 */
            body: `Hello  ${(req.query.name || req.body.name)}`
        };
    } else {
        context.res = {
            body: 'Please pass a name on the query string or in the request body',
            status: 400
        };
    }
};
