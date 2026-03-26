import { WorkflowEntrypoint, WorkflowStep, type WorkflowEvent } from 'cloudflare:workers';

export type VersionTwoDataMigratorParam = {
  size: number;
  loop: number;
  delay: number;
  after: string;
};

export class VersionTwoDataMigrator extends WorkflowEntrypoint<Env, VersionTwoDataMigratorParam> {
  async run(event: WorkflowEvent<VersionTwoDataMigratorParam>, step: WorkflowStep) {}
}
