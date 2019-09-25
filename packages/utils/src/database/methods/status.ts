import { debug as d } from '../../debug';
import { Status, IStatusModel } from '../models/status';
import { IStatus } from '../../types';
import { connect } from './common';

const debug = d(__filename);

/**
 * Add a new status in the database.
 * @param {IStatus} status - Status to save in database.
 */
export const add = async (status: IStatus): Promise<IStatusModel> => {
    await connect();
    const newStatus = new Status(status);

    await newStatus.save();

    debug(`status created in database with date ${status.date.toISOString()}`);

    return newStatus;
};

/**
 * Update an status in the database.
 */
export const update = async (status: IStatusModel, field: string) => {
    await connect();
    status.markModified(field);

    await status.save();
};

/**
 * Get the last status in the database.
 */
export const getMostRecent = async (): Promise<IStatus | null> => {
    await connect();
    const result = await Status.findOne()
        .sort({ date: -1 })
        .exec();

    return result;
};

/**
 * Get the statuses between two dates.
 * @param {Date} from - Initial date.
 * @param {Date} to - End date.
 */
export const getByDate = async (from: Date, to: Date): Promise<IStatus[]> => {
    await connect();
    const result = await Status.find({
        date: {
            $gte: from,
            $lte: to
        }
    }).exec();

    return result;
};