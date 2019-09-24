declare module 'tri' {
    type Options = {
        delay: number;
        maxAttempts: number;
    };

    function tri<T>(func: () => Promise<T>, options: Options): Promise<T>;

    export = tri;
}
