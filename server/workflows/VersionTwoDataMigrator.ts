import { WorkflowEntrypoint, WorkflowStep, type WorkflowEvent } from 'cloudflare:workers';

export type VersionTwoDataMigratorParam = {
  maxCount: number;
  maxCycle: number;
  maxDelay: number;
  after?: string;
};

export type CycleCheckpointEvent = {
  kill?: boolean;
};

export class VersionTwoDataMigrator extends WorkflowEntrypoint<Env, VersionTwoDataMigratorParam> {
  async run(event: WorkflowEvent<VersionTwoDataMigratorParam>, step: WorkflowStep) {
    const {
      payload: { maxCount, maxCycle, maxDelay, after },
      instanceId,
    } = event;

    await step.do('noti-start', async () => {
      this.logToDiscord(`Starting migration from ID: ${after}`, { maxCount, maxCycle, maxDelay, instanceId });
    });

    const cyclePerNoti = Math.ceil(maxCycle / 50);
    let lastSeenId = after;
    let curCycle = 0;
    let idProcSince: string[] = [];
    for (; curCycle < event.payload.maxCycle; curCycle++) {
      // TODO
      await step.sleep('simulated migration', 50_000);

      const shouldNotify = cyclePerNoti <= 1 || curCycle % cyclePerNoti === 0;

      if (shouldNotify) {
        await step.do(`noti-batch-${curCycle}`, async () => {
          this.logToDiscord(`${instanceId} proccessed count: ${idProcSince.length}`, idProcSince);
        });
        idProcSince = [];
      }

      try {
        // Dual purpose: Delay & Kill switch
        const checkpointEvent = await step.waitForEvent<CycleCheckpointEvent>(`cycle-checkpoint-${curCycle}`, {
          type: 'cycle-checkpoint',
          timeout: maxDelay,
        });

        if (checkpointEvent.payload.kill) {
          console.warn('kill signal recieved');
          break;
        }
      } catch (e: unknown) {
        console.log(e);
      }
    }

    await step.do('noti-end', async () => {
      this.logToDiscord(`Finished ${curCycle}/${maxCycle}, Next after: ${lastSeenId}`, { instanceId });
    });
  }

  private async logToDiscord(message: string, data?: unknown): Promise<void> {
    const serializedData = data ? '```json\n' + JSON.stringify(data, null, 2) + '\n```' : '';
    const content = `${message}\n${serializedData}`;
    const response = await fetch(this.env.DISCORD_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Failed to send Discord message: ${response.status} - ${text}`);
    }
  }
}
