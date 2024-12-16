import { ISubnet, IVpc, SecurityGroup } from 'aws-cdk-lib/aws-ec2';
import { Cluster, FargateTaskDefinition, TaskDefinition } from 'aws-cdk-lib/aws-ecs';
import { Construct } from 'constructs';
import {
  DefinitionBody,
  IntegrationPattern,
  JsonPath,
  StateMachine,
  Timeout,
} from 'aws-cdk-lib/aws-stepfunctions';
import { EcsFargateLaunchTarget, EcsRunTask } from 'aws-cdk-lib/aws-stepfunctions-tasks';
import { Duration } from 'aws-cdk-lib';

export interface StepFunctionsProps {
  readonly namePrefix: string;
  readonly vpc: IVpc;
  readonly ecsCluster: Cluster;
  readonly ecsTaskDefinition: TaskDefinition;
  readonly ecsSecurityGroup: SecurityGroup;
}

export class StepFunctions extends Construct {
  public readonly stateMachine: StateMachine;

  constructor(scope: Construct, id: string, props: StepFunctionsProps) {
    super(scope, id);

    const { namePrefix, vpc, ecsCluster, ecsTaskDefinition, ecsSecurityGroup } = props;

    const runTask = this.createEcsRunTask(
      ecsCluster,
      ecsTaskDefinition,
      ecsSecurityGroup,
      vpc.publicSubnets,
    );
    const definitionBody = DefinitionBody.fromChainable(runTask);

    this.stateMachine = new StateMachine(this, 'StateMachine', {
      stateMachineName: `${namePrefix}-state-machine`,
      definitionBody,
      tracingEnabled: true,
    });
  }

  private createEcsRunTask(
    cluster: Cluster,
    taskDefinition: FargateTaskDefinition,
    securityGroup: SecurityGroup,
    subnets: ISubnet[],
  ): EcsRunTask {
    const stateName = 'ECSRunTask';
    return new EcsRunTask(this, stateName, {
      stateName,
      integrationPattern: IntegrationPattern.RUN_JOB,
      launchTarget: new EcsFargateLaunchTarget(),
      cluster,
      taskDefinition,
      securityGroups: [securityGroup],
      subnets: {
        subnets,
      },
      containerOverrides: [
        {
          containerDefinition: taskDefinition.defaultContainer!,
          command: JsonPath.listAt('$.command'),
        },
      ],
      assignPublicIp: true,
      taskTimeout: Timeout.duration(Duration.hours(1)),
    });
  }
}
