import * as datacontext from './methods/common';
import * as job from './methods/job';
import * as serviceConfig from './methods/serviceconfig';
import * as status from './methods/status';
import * as user from './methods/user';

const { connect, disconnect, lock, unlock, replicaSetStatus } = datacontext;

export {
    connect,
    disconnect,
    lock,
    unlock,
    job,
    serviceConfig,
    status,
    replicaSetStatus,
    user
};
