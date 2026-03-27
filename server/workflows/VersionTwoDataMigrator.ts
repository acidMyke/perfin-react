import { WorkflowEntrypoint, WorkflowStep, type WorkflowEvent } from 'cloudflare:workers';

export type VersionTwoDataMigratorParam = {
  maxCount: number;
  maxCycle: number;
  maxDelay: number;
  after?: string;
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

    let lastSeenId = after;
    let curCycle = 0;
    for (; curCycle < event.payload.maxCycle; curCycle++) {
      // TODO
    }

    await step.do('noti-end', async () => {
      this.logToDiscord(`Finished ${curCycle}/${maxCycle}, Next after: ${lastSeenId}`, { instanceId });
    });
  }

  private async logToDiscord(message: string, data: unknown): Promise<void> {
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
