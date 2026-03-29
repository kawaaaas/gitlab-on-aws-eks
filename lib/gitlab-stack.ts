import * as eks from "aws-cdk-lib/aws-eks-v2";
import * as cdk from "aws-cdk-lib/core";
import { Construct } from "constructs";
import * as fs from "node:fs";
import * as path from "node:path";
import * as yaml from "yaml";

/**
 * GitlabStack のプロパティ
 *
 * NOTE: スタック間の依存はpropsで明示的に渡す（CDKのベストプラクティス）。
 * EksClusterStackで作成したクラスターへの参照を受け取り、
 * そのクラスターにGitLab Helm Chartをデプロイする。
 */
export interface GitlabStackProps extends cdk.StackProps {
  /** EKSクラスター。addHelmChart()でGitLabをデプロイするために必要 */
  readonly cluster: eks.ICluster;
}

/**
 * GitLab Helm Chart デプロイスタック
 *
 * NOTE: このスタックの責務
 * - GitLab公式Helm Chartをクラスターにデプロイする
 * - Phase 1ではバンドルのPostgreSQL/Redis/MinIOを使用（クラスター内で完結）
 * - Phase 2でバンドルサービスをAWS RDS/ElastiCacheに移行する際は、
 *   values.yamlの設定変更とDataStoreStackの追加で対応する
 *
 * NOTE: Helm Chartとは？
 * Kubernetesアプリケーションのパッケージ形式。
 * 複数のK8sリソース（Deployment, Service, ConfigMap等）を
 * テンプレートとしてまとめ、valuesで設定をカスタマイズできる。
 * apt/yum/brewのKubernetes版と考えるとわかりやすい。
 */
export class GitlabStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: GitlabStackProps) {
    super(scope, id, props);

    // ========================================
    // GitLab Helm Chart のvalues読み込み
    // ========================================
    // NOTE: k8s/values/gitlab.yaml にHelm valuesを外部管理している。
    // コーディング規約に従い、デフォルト値からの変更点のみを記述し、
    // 変更理由をコメントで残している。
    const valuesFilePath = path.join(
      __dirname,
      "..",
      "k8s",
      "values",
      "gitlab.yaml",
    );
    const valuesContent = fs.readFileSync(valuesFilePath, "utf-8");
    const values = yaml.parse(valuesContent) as Record<string, unknown>;

    // ========================================
    // GitLab Helm Chart デプロイ
    // ========================================
    // NOTE: cluster.addHelmChart() の裏側
    // CDKのKubectl Handler（Lambda関数）が以下を実行する:
    // 1. helm repo add gitlab https://charts.gitlab.io/
    // 2. helm install gitlab gitlab/gitlab -f values.yaml -n gitlab --create-namespace
    // CloudFormationのカスタムリソースとして管理されるため、
    // cdk destroy時にはhelm uninstallが自動実行される。
    props.cluster.addHelmChart("GitlabHelmChart", {
      // NOTE: GitLab公式Helm Chartリポジトリ
      repository: "https://charts.gitlab.io/",
      chart: "gitlab",
      // NOTE: Helm Chartのバージョンを固定。
      // 再現性のためバージョンを明示する。
      // GitLab Helm Chartのバージョンはアプリバージョンと異なる:
      // Chart 8.x = GitLab 17.x
      version: "8.11.2",
      release: "gitlab",
      // NOTE: Kubernetes Namespaceの分離。
      // GitLabのリソースを専用のnamespaceに配置することで、
      // 他のワークロード（Monitoring等）と分離する。
      // K8sではnamespaceでリソースの論理的な分離を行う。
      namespace: "gitlab",
      createNamespace: true,
      values,
      // NOTE: GitLabは多数のコンポーネントを含むため、デプロイに時間がかかる。
      // EKS v2のHelmChartはtimeout上限が15分。
      timeout: cdk.Duration.minutes(15),
    });
  }
}
