declare module '@destinationstransfers/ntp' {
    type Options = {
        server: string;
    };
    export const getNetworkTime: (options: Options) => Promise<Date>;
}
