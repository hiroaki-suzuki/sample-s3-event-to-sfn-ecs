import { Construct } from 'constructs';
import { Bucket } from 'aws-cdk-lib/aws-s3';
import { EventField, Rule, RuleTargetInput } from 'aws-cdk-lib/aws-events';
import { SfnStateMachine } from 'aws-cdk-lib/aws-events-targets';
import {
  Effect,
  PolicyDocument,
  PolicyStatement,
  Role,
  ServicePrincipal,
} from 'aws-cdk-lib/aws-iam';
import { StateMachine } from 'aws-cdk-lib/aws-stepfunctions';

export interface EventBridgeProps {
  readonly namePrefix: string;
  readonly bucket: Bucket;
  readonly stateMachine: StateMachine;
  readonly appEntryFilePath: string;
}

export class EventBridge extends Construct {
  constructor(scope: Construct, id: string, props: EventBridgeProps) {
    super(scope, id);

    const { namePrefix, bucket, stateMachine, appEntryFilePath } = props;

    // ロールの作成
    const ruleRole = this.createRuleRole(namePrefix, stateMachine);

    // ルールの作成
    this.createRule(namePrefix, bucket, stateMachine, ruleRole, appEntryFilePath);

    // デフォルトポリシーを削除
    ruleRole.node.tryRemoveChild('DefaultPolicy');
  }

  private createRuleRole(namePrefix: string, stateMachine: StateMachine): Role {
    return new Role(this, 'RuleRole', {
      roleName: `${namePrefix}-rule-role`,
      assumedBy: new ServicePrincipal('events.amazonaws.com'),
      inlinePolicies: {
        'allow-run-task': new PolicyDocument({
          statements: [
            new PolicyStatement({
              effect: Effect.ALLOW,
              actions: ['states:StartExecution'],
              resources: [stateMachine.stateMachineArn],
            }),
          ],
        }),
      },
    });
  }

  private createRule(
    namePrefix: string,
    bucket: Bucket,
    stateMachine: StateMachine,
    ruleRole: Role,
    appEntryFilePath: string,
  ): Rule {
    return new Rule(this, 'Rule', {
      ruleName: `${namePrefix}-rule`,
      enabled: true,
      eventPattern: {
        source: ['aws.s3'],
        detailType: ['Object Created'],
        detail: {
          bucket: {
            name: [bucket.bucketName],
          },
          object: {
            key: [{ prefix: 'input/' }],
            size: [{ numeric: ['>', 0] }],
          },
        },
      },
      targets: [
        new SfnStateMachine(stateMachine, {
          input: RuleTargetInput.fromObject({
            command: [appEntryFilePath, EventField.fromPath('$.detail.object.key')],
          }),
          role: ruleRole,
        }),
      ],
    });
  }
}
