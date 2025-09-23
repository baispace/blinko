import { BaseScheduleJob } from "./baseScheduleJob";
import { prisma } from "../prisma";
import { NotificationType } from "@shared/lib/prismaZodType";
import { CreateNotification } from "../routerTrpc/notification";
import { AiModelFactory } from "@server/aiServer/aiModelFactory";
import { AiService } from "@server/aiServer";
import { CronTime } from "cron";

export const REBUILD_EMBEDDING_TASK_NAME = "rebuildEmbedding";

// JSON-serializable result record
export interface ResultRecord {
  type: 'success' | 'skip' | 'error';
  content: string;
  error?: string;
  timestamp: string; // Store as ISO string for JSON compatibility
}

// JSON-serializable progress object
export interface RebuildProgress {
  current: number;
  total: number;
  percentage: number;
  isRunning: boolean;
  results: ResultRecord[];
  lastUpdate: string;
  processedNoteIds: number[];
  failedNoteIds: number[];
  skippedNoteIds: number[];
  lastProcessedId?: number;
  retryCount: number;
  startTime: string;
  isIncremental: boolean;
  [key: string]: any;
}

export class RebuildEmbeddingJob extends BaseScheduleJob {
  protected static taskName = REBUILD_EMBEDDING_TASK_NAME;
  protected static job = this.createJob();
  // Add a force stop flag to terminate the running task
  private static forceStopFlag = false;

  static {
    this.autoStart('0 0 * * *'); // Run once a day at midnight by default
  }

  protected static async initializeJob() {
    setTimeout(async () => {
      try {
        const task = await prisma.scheduledTask.findFirst({
          where: { name: this.taskName }
        });

        if (task) {
          this.job.setTime(new CronTime(task.schedule));
          this.job.start();

          const progress = task.output as any;
          const wasInterrupted = progress?.isRunning && progress?.current < progress?.total && progress?.current > 0;

          if (wasInterrupted) {
            console.log(`Detected interrupted ${this.taskName}, auto-resuming from ${progress.current}/${progress.total}...`);
            await prisma.scheduledTask.update({
              where: { name: this.taskName },
              data: {
                isRunning: true,
                output: {
                  ...progress,
                  isRunning: true,
                  isIncremental: true,
                  lastUpdate: new Date().toISOString()
                } as any
              }
            });
            // Add a small delay before firing to ensure database update is committed
            setTimeout(() => {
              this.job.fireOnTick();
            }, 500);
          } else if (task.isRunning) {
            const now = new Date().getTime();
            const [next1, next2] = this.job.nextDates(2);
            if (next1 == null || next2 == null ||
              now - task.lastRun.getTime() > next2.toMillis() - next1.toMillis()) {
              this.job.fireOnTick();
            }
          }
        }
      } catch (error) {
        console.error(`Failed to initialize ${this.taskName}:`, error);
      }
    }, 1000);
  }

  /**
   * Force restart the rebuild embedding task
   */
  static async ForceRebuild(force: boolean = true, incremental: boolean = false): Promise<boolean> {
    try {
      this.forceStopFlag = false;

      const task = await prisma.scheduledTask.findFirst({
        where: { name: this.taskName }
      });

      if (task?.output) {
        const progress = task.output as any;
        if (progress?.isRunning && force) {
          console.log(`Task ${this.taskName} is already running, force stopping before restart`);
          await this.StopRebuild();
          // Give a small delay to ensure the stop completes
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }

      let initialProgress: RebuildProgress;

      if (incremental && task?.output) {
        const existingProgress = task.output as any;
        initialProgress = {
          current: existingProgress.current || 0,
          total: existingProgress.total || 0,
          percentage: existingProgress.percentage || 0,
          isRunning: true,
          results: existingProgress.results || [],
          lastUpdate: new Date().toISOString(),
          processedNoteIds: existingProgress.processedNoteIds || [],
          failedNoteIds: existingProgress.failedNoteIds || [],
          skippedNoteIds: existingProgress.skippedNoteIds || [],
          lastProcessedId: existingProgress.lastProcessedId,
          retryCount: (existingProgress.retryCount || 0) + 1,
          startTime: existingProgress.startTime || new Date().toISOString(),
          isIncremental: true
        };
      } else {
        initialProgress = {
          current: 0,
          total: 0,
          percentage: 0,
          isRunning: true,
          results: [],
          lastUpdate: new Date().toISOString(),
          processedNoteIds: [],
          failedNoteIds: [],
          skippedNoteIds: [],
          retryCount: 0,
          startTime: new Date().toISOString(),
          isIncremental: false
        };
      }

      if (task) {
        await prisma.scheduledTask.update({
          where: { name: this.taskName },
          data: {
            isRunning: true,
            isSuccess: false,
            output: initialProgress as any,
            lastRun: new Date()
          }
        });
      } else {
        await prisma.scheduledTask.create({
          data: {
            name: this.taskName,
            isRunning: true,
            isSuccess: false,
            output: initialProgress as any,
            schedule: '0 0 * * *',
            lastRun: new Date()
          }
        });
      }

      // Fire the task immediately
      this.job.fireOnTick();
      return true;
    } catch (error) {
      console.error("Failed to force rebuild embedding:", error);
      return false;
    }
  }

  /**
   * Stop the current rebuild task if it's running
   */
  static async StopRebuild(): Promise<boolean> {
    try {
      // Set the force stop flag to true
      this.forceStopFlag = true;
      
      // Stop the scheduled job
      await this.Stop();
      
      const task = await prisma.scheduledTask.findFirst({
        where: { name: this.taskName }
      });

      if (task && task.output) {
        const currentProgress = task.output as any;
        currentProgress.isRunning = false;

        await prisma.scheduledTask.update({
          where: { name: this.taskName },
          data: {
            isRunning: false,
            output: currentProgress as any
          }
        });
      }

      return true;
    } catch (error) {
      console.error("Failed to stop rebuild embedding:", error);
      return false;
    }
  }

  /**
   * Get current progress of the rebuild embedding task
   */
  static async GetProgress(): Promise<RebuildProgress | null> {
    try {
      const task = await prisma.scheduledTask.findFirst({
        where: { name: this.taskName }
      });

      if (!task) return null;

      return task.output as unknown as RebuildProgress;
    } catch (error) {
      console.error("Failed to get rebuild embedding progress:", error);
      return null;
    }
  }

  protected static async RunTask(): Promise<any> {
    // Get current task from database
    const task = await prisma.scheduledTask.findFirst({
      where: { name: this.taskName }
    });

    if (!task) {
      throw new Error("Task not found");
    }

    const currentProgress = task.output as any || {
      current: 0,
      total: 0,
      percentage: 0,
      isRunning: true,
      results: [],
      lastUpdate: new Date().toISOString(),
      processedNoteIds: [],
      failedNoteIds: [],
      skippedNoteIds: [],
      retryCount: 0,
      startTime: new Date().toISOString(),
      isIncremental: false
    };

    if (!currentProgress.isRunning) {
      return currentProgress;
    }

    try {
      this.forceStopFlag = false;

      const { VectorStore } = await AiModelFactory.GetProvider();
      const processedIds = new Set<number>(currentProgress.processedNoteIds || []);
      const failedIds = new Set<number>(currentProgress.failedNoteIds || []);
      const results: ResultRecord[] = [...(currentProgress.results || [])];

      if (!currentProgress.isIncremental) {
        await AiModelFactory.rebuildVectorIndex({
          vectorStore: VectorStore,
          isDelete: true
        });
      }

      const whereClause: any = { isRecycle: false };

      if (currentProgress.isIncremental && processedIds.size > 0) {
        whereClause.id = { notIn: Array.from(processedIds) };
      }

      const notes = await prisma.notes.findMany({
        include: { attachments: true },
        where: whereClause,
        orderBy: { id: 'asc' }
      });

      const total = currentProgress.isIncremental
        ? (currentProgress.total || notes.length + processedIds.size)
        : notes.length;
      let current = currentProgress.current || processedIds.size;

      // Process notes in batches
      const BATCH_SIZE = 5;

      console.log(`[${new Date().toISOString()}] start rebuild embedding, ${notes.length} notes`);

      for (let i = 0; i < notes.length; i += BATCH_SIZE) {
        // Check if force stop flag is set
        if (this.forceStopFlag) {
          const stoppedProgress = {
            current,
            total,
            percentage: Math.floor((current / total) * 100),
            isRunning: false,
            results: results.slice(-50), // Keep only latest 50 results
            lastUpdate: new Date().toISOString()
          };
          
          await prisma.scheduledTask.update({
            where: { name: this.taskName },
            data: {
              isRunning: false,
              output: stoppedProgress as any
            }
          });
          
          return stoppedProgress;
        }
        
        // Check if task was stopped through database
        const latestTask = await prisma.scheduledTask.findFirst({
          where: { name: this.taskName }
        });

        const latestProgress = latestTask?.output as any;
        if (latestProgress && !latestProgress.isRunning) {
          // Task was stopped
          return latestProgress;
        }

        const noteBatch = notes.slice(i, i + BATCH_SIZE);

        for (const note of noteBatch) {
          if (this.forceStopFlag) {
            return this.createStoppedProgress(current, total, results, processedIds, failedIds);
          }

          if (processedIds.has(note.id)) {
            continue;
          }

          console.log(`[${new Date().toISOString()}] processing note ${note.id}, progress: ${current}/${total}`);

          try {
            let noteProcessed = false;

            if (process.env.NODE_ENV === 'development') {
              await new Promise(resolve => setTimeout(resolve, 1000));
            }

            if (note?.content && note.content.trim() !== '') {
              const result = await this.processNoteWithRetry(note, 3);
              if (result.success) {
                results.push({
                  type: 'success',
                  content: note?.content.slice(0, 30) ?? '',
                  timestamp: new Date().toISOString()
                });
                noteProcessed = true;
              } else {
                results.push({
                  type: 'error',
                  content: note?.content.slice(0, 30) ?? '',
                  error: result.error,
                  timestamp: new Date().toISOString()
                });
                failedIds.add(note.id);
              }
            }

            if (note?.attachments) {
              for (const attachment of note.attachments) {
                const isImage = (filePath: string): boolean => {
                  if (!filePath) return false;
                  const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.svg'];
                  return imageExtensions.some(ext => filePath.toLowerCase().endsWith(ext));
                };

                if (isImage(attachment?.path)) {
                  results.push({
                    type: 'skip',
                    content: (attachment?.path),
                    error: 'image is not supported',
                    timestamp: new Date().toISOString()
                  });
                  continue;
                }

                const attachmentResult = await this.processAttachmentWithRetry(note, attachment, 3);
                if (attachmentResult.success) {
                  results.push({
                    type: 'success',
                    content: decodeURIComponent(attachment?.path),
                    timestamp: new Date().toISOString()
                  });
                  noteProcessed = true;
                } else {
                  results.push({
                    type: 'error',
                    content: decodeURIComponent(attachment?.path),
                    error: attachmentResult.error,
                    timestamp: new Date().toISOString()
                  });
                }
              }
            }

            if (noteProcessed) {
              processedIds.add(note.id);
              current++;
            }

            const percentage = Math.floor((current / total) * 100);

            const latestResults = results.slice(-50);

            const updatedProgress: RebuildProgress = {
              current,
              total,
              percentage,
              isRunning: true,
              results: latestResults,
              lastUpdate: new Date().toISOString(),
              processedNoteIds: Array.from(processedIds),
              failedNoteIds: Array.from(failedIds),
              skippedNoteIds: currentProgress.skippedNoteIds || [],
              lastProcessedId: note.id,
              retryCount: currentProgress.retryCount || 0,
              startTime: currentProgress.startTime || new Date().toISOString(),
              isIncremental: currentProgress.isIncremental || false
            };

            await prisma.scheduledTask.update({
              where: { name: this.taskName },
              data: { output: updatedProgress as any }
            });

          } catch (error) {
            console.error(`[${new Date().toISOString()}] error processing note ${note.id}:`, error);
            // Record error but continue processing
            results.push({
              type: 'error',
              content: note.content.slice(0, 30),
              error: error?.toString(),
              timestamp: new Date().toISOString()
            });
          }
        }
      }

      const finalProgress: RebuildProgress = {
        current,
        total,
        percentage: 100,
        isRunning: false,
        results: results.slice(-50),
        lastUpdate: new Date().toISOString(),
        processedNoteIds: Array.from(processedIds),
        failedNoteIds: Array.from(failedIds),
        skippedNoteIds: currentProgress.skippedNoteIds || [],
        lastProcessedId: notes[notes.length - 1]?.id,
        retryCount: currentProgress.retryCount || 0,
        startTime: currentProgress.startTime || new Date().toISOString(),
        isIncremental: currentProgress.isIncremental || false
      };

      await prisma.scheduledTask.update({
        where: { name: this.taskName },
        data: {
          isRunning: false,
          isSuccess: true,
          output: finalProgress as any
        }
      });

      // Create notification
      await CreateNotification({
        title: 'embedding-rebuild-complete',
        content: 'embedding-rebuild-complete',
        type: NotificationType.SYSTEM,
        useAdmin: true,
      });

      return finalProgress;
    } catch (error) {
      console.error("Error rebuilding embedding index:", error);

      // Update with error status
      const errorProgress = {
        ...currentProgress,
        isRunning: false,
        results: [
          ...(currentProgress.results || []).slice(-49),
          {
            type: 'error',
            content: 'Task failed with error',
            error: error?.toString(),
            timestamp: new Date().toISOString()
          }
        ],
        lastUpdate: new Date().toISOString()
      };

      await prisma.scheduledTask.update({
        where: { name: this.taskName },
        data: {
          isRunning: false,
          isSuccess: false,
          output: errorProgress as any
        }
      });

      throw error;
    }
  }

  private static async processNoteWithRetry(note: any, maxRetries: number): Promise<{ success: boolean; error?: string }> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const { ok, error } = await AiService.embeddingUpsert({
          createTime: note.createdAt,
          updatedAt: note.updatedAt,
          id: note.id,
          content: note.content,
          type: 'update' as const
        });

        if (ok) {
          return { success: true };
        } else {
          if (attempt === maxRetries) {
            return { success: false, error: error?.toString() || 'Unknown error' };
          }
          console.warn(`Attempt ${attempt} failed for note ${note.id}, retrying...`);
          await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
        }
      } catch (error) {
        if (attempt === maxRetries) {
          return { success: false, error: error?.toString() || 'Unknown error' };
        }
        console.warn(`Attempt ${attempt} failed for note ${note.id}, retrying...`);
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
      }
    }
    return { success: false, error: 'Max retries exceeded' };
  }

  private static async processAttachmentWithRetry(note: any, attachment: any, maxRetries: number): Promise<{ success: boolean; error?: string }> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const { ok, error } = await AiService.embeddingInsertAttachments({
          id: note.id,
          updatedAt: note.updatedAt,
          filePath: attachment?.path
        });

        if (ok) {
          return { success: true };
        } else {
          if (attempt === maxRetries) {
            return { success: false, error: error?.toString() || 'Unknown error' };
          }
          console.warn(`Attempt ${attempt} failed for attachment ${attachment.path}, retrying...`);
          await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
        }
      } catch (error) {
        if (attempt === maxRetries) {
          return { success: false, error: error?.toString() || 'Unknown error' };
        }
        console.warn(`Attempt ${attempt} failed for attachment ${attachment.path}, retrying...`);
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
      }
    }
    return { success: false, error: 'Max retries exceeded' };
  }

  private static async createStoppedProgress(current: number, total: number, results: ResultRecord[], processedIds: Set<number>, failedIds: Set<number>): Promise<RebuildProgress> {
    const stoppedProgress: RebuildProgress = {
      current,
      total,
      percentage: Math.floor((current / total) * 100),
      isRunning: false,
      results: results.slice(-50),
      lastUpdate: new Date().toISOString(),
      processedNoteIds: Array.from(processedIds),
      failedNoteIds: Array.from(failedIds),
      skippedNoteIds: [],
      retryCount: 0,
      startTime: new Date().toISOString(),
      isIncremental: true
    };

    await prisma.scheduledTask.update({
      where: { name: this.taskName },
      data: {
        isRunning: false,
        output: stoppedProgress as any
      }
    });

    return stoppedProgress;
  }

  static async ResumeRebuild(): Promise<boolean> {
    return this.ForceRebuild(true, true);
  }

  static async GetFailedNotes(): Promise<number[]> {
    try {
      const task = await prisma.scheduledTask.findFirst({
        where: { name: this.taskName }
      });

      if (!task?.output) return [];

      const progress = task.output as any;
      return progress.failedNoteIds || [];
    } catch (error) {
      console.error("Failed to get failed notes:", error);
      return [];
    }
  }

  static async RetryFailedNotes(): Promise<boolean> {
    try {
      const task = await prisma.scheduledTask.findFirst({
        where: { name: this.taskName }
      });

      if (!task?.output) return false;

      const progress = task.output as any;
      const updatedProgress = {
        ...progress,
        processedNoteIds: (progress.processedNoteIds || []).filter((id: number) =>
          !(progress.failedNoteIds || []).includes(id)
        ),
        failedNoteIds: [],
        isRunning: true,
        isIncremental: true
      };

      await prisma.scheduledTask.update({
        where: { name: this.taskName },
        data: { output: updatedProgress as any }
      });

      this.job.fireOnTick();
      return true;
    } catch (error) {
      console.error("Failed to retry failed notes:", error);
      return false;
    }
  }
} 