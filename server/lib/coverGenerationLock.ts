/** All cover entry points share an account-level in-flight guard. */
export const coverGenerationJobs = new Set<number>();
