import * as ntp from '@destinationstransfers/ntp';

const tri = require('tri');

const options = { server: 'time-a-g.nist.gov' };

export const getTime = async (): Promise<Date | null> => {
    let time: Date | null = null;

    try {
        time = await tri(() => {
            return ntp.getNetworkTime(options);
        }, {
            delay: 500,
            maxAttempts: 10
        });
    } catch (err) {
        time = null;
    }

    return time;
};
