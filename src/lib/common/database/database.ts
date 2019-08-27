import * as datacontext from './methods/common';
import * as job from './methods/job';
import * as serviceConfig from './methods/serviceconfig';
import * as status from './methods/status';

const { connect, disconnect, lock, unlock } = datacontext;

export {
    connect,
    disconnect,
    lock,
    unlock,
    job,
    serviceConfig,
    status
};
