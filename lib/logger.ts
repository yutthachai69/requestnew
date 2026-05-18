const logger = {
    info: (message: string, ...args: unknown[]) => {
        console.log(`[INFO] ${new Date().toISOString()}: ${message}`, ...args);
    },
    error: (message: string, error?: unknown) => {
        console.error(`[ERROR] ${new Date().toISOString()}: ${message}`, error);
    },
    warn: (message: string, ...args: unknown[]) => {
        console.warn(`[WARN] ${new Date().toISOString()}: ${message}`, ...args);
    },
    debug: (message: string, ...args: unknown[]) => {
        if (process.env.NODE_ENV === 'development') {
            console.debug(`[DEBUG] ${new Date().toISOString()}: ${message}`, ...args);
        }
    },
};

export default logger;
