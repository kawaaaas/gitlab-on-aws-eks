#!/usr/bin/env node
import * as cdk from "aws-cdk-lib/core";
import { EksClusterStack } from "../lib/gitlab-on-aws-eks-stack";

/**
 * CDKアプリケーションのエントリポイント
 *
 * NOTE: CDKアプリは1つのAppの中に複数のStackを定義する。
 * 各StackはCloudFormationのスタックに対応し、独立してデプロイ・削除できる。
 *
 * Phase 1 のスタック構成:
 * 1. EksClusterStack — VPC, EKSクラスター, ノードグループ
 * 2. GitlabStack — GitLab Helm Chart デプロイ（後で追加）
 * 3. MonitoringStack — Prometheus + Grafana（後で追加）
 */
const app = new cdk.App();

// NOTE: env を指定することで、デプロイ先のアカウント・リージョンを明示する。
// CDK_DEFAULT_ACCOUNT / CDK_DEFAULT_REGION は `aws configure` で設定した値が入る。
// EKSはリージョン依存の機能が多いため、env指定が推奨される。
const env: cdk.Environment = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION,
};

const eksClusterStack = new EksClusterStack(app, "EksClusterStack", { env });

// NOTE: 後続スタックはここに追加していく。
// クラスターへの参照をpropsで渡すことで、スタック間の依存を明示的にする。
//
// const gitlabStack = new GitlabStack(app, 'GitlabStack', {
//   env,
//   cluster: eksClusterStack.cluster,
// });
//
// const monitoringStack = new MonitoringStack(app, 'MonitoringStack', {
//   env,
//   cluster: eksClusterStack.cluster,
// });
