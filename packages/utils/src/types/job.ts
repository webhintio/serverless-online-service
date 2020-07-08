import { Category } from '@hint/utils-types/dist/src/category';
import { Problem } from '@hint/utils-types/dist/src/problems';
import { UserConfig } from '@hint/utils';

import { JobStatus, HintStatus } from '../enums/status';

export type Hint = {
    category: Category;
    name: string;
    status: HintStatus;
    messages: Problem[];
};

export type JobResult = {
    error: string | null;
    ok: boolean;
    messages: Problem[] | null;
};

export type PartInfo = {
    /** Part number for a task */
    part?: number;
    /** Total parts we split a job */
    totalParts?: number;
};

export interface IJob {
    /** job id in database. */
    id?: string;
    /** Job Url. */
    url: string;
    /** Job Status. */
    status: JobStatus;
    /** Configuration to run webhint. */
    config: UserConfig[];
    /** Time in seconds the job has to complete the execution in webhint. */
    maxRunTime: number;
    /** List of hints to run. */
    hints: Hint[];
    /** Webhint version. */
    webhintVersion: string;
    /** Timestamp when it was queued. */
    queued: Date;
    /** Timestamp when it was queued. */
    started: Date;
    /** Timestamp when it was queued. */
    finished: Date;
    /** Error in case there is an error runing the job. */
    error: any;
    /** Messages in queue approximately before the job is added to the queue. */
    messagesInQueue?: number;
    /** Partition information for a task */
    partInfo?: PartInfo;
    /** Indicates if a job was investigated for someone */
    investigated?: boolean;
    /** Last log lines */
    log?: string;
    /** Indicates if a job is new */
    isNew?: boolean;
}
