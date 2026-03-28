import * as eks from "aws-cdk-lib/aws-eks-v2";
import * as cdk from "aws-cdk-lib/core";
import { Construct } from "constructs";
import { EksClusterConstruct } from "./constructs/eks-cluster";
import { VpcConstruct } from "./constructs/vpc";

/**
 * EksClusterStack の出力インターフェース
 *
 * NOTE: CDKではスタック間の依存を「props」で明示的に渡すのがベストプラクティス。
 * このインターフェースで、後続のGitlabStackやMonitoringStackに
 * 「このクラスターにHelm Chartをデプロイしてね」と伝える。
 */
export interface EksClusterStackOutput {
  /** EKSクラスター本体。後続スタックでaddHelmChart()を呼ぶために必要 */
  readonly cluster: eks.Cluster;
}

/**
 * EKSクラスタースタック
 *
 * このスタックが作るもの:
 * 1. VPC（ネットワーク基盤） — VpcConstruct
 * 2. EKSクラスター + マネージドノードグループ — EksClusterConstruct
 *
 * NOTE: スタックとコンストラクトの違い
 * - スタック: CloudFormationのデプロイ単位。cdk deploy / cdk destroy の対象。
 * - コンストラクト: スタック内の論理的なリソースグループ。責務ごとに分離する。
 * このスタックではVPCとEKSをそれぞれコンストラクトに分離し、
 * スタックは「組み合わせる」役割に徹している。
 */
export class EksClusterStack extends cdk.Stack {
  /** 後続スタックに渡すためのクラスター参照 */
  public readonly cluster: eks.Cluster;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // ========================================
    // cdk.json の context から設定値を取得
    // ========================================
    // NOTE: マジックナンバーをコードに直書きせず、cdk.jsonで一元管理する。
    // 環境ごとに値を変えたい場合にコードを変更せずに済む。
    const clusterName = this.node.tryGetContext("eks:clusterName") as string;
    const nodeInstanceType = this.node.tryGetContext(
      "eks:nodeInstanceType",
    ) as string;
    const nodeMinSize = this.node.tryGetContext("eks:nodeMinSize") as number;
    const nodeMaxSize = this.node.tryGetContext("eks:nodeMaxSize") as number;
    const nodeDesiredSize = this.node.tryGetContext(
      "eks:nodeDesiredSize",
    ) as number;
    const nodeDiskSize = this.node.tryGetContext("eks:nodeDiskSize") as number;
    const vpcMaxAzs = this.node.tryGetContext("vpc:maxAzs") as number;

    // ========================================
    // 1. VPC（ネットワーク基盤）
    // ========================================
    const vpcConstruct = new VpcConstruct(this, "Network", {
      maxAzs: vpcMaxAzs,
    });

    // ========================================
    // 2. EKSクラスター + ノードグループ
    // ========================================
    const eksConstruct = new EksClusterConstruct(this, "Eks", {
      clusterName,
      vpc: vpcConstruct.vpc,
      nodeInstanceType,
      nodeMinSize,
      nodeMaxSize,
      nodeDesiredSize,
      nodeDiskSize,
    });

    this.cluster = eksConstruct.cluster;

    // ========================================
    // スタック出力（Outputs）
    // ========================================
    // NOTE: cdk deploy後にターミナルに表示される値。
    // kubeconfigの設定コマンドを出力しておくと、デプロイ後すぐにkubectlで接続できる。
    new cdk.CfnOutput(this, "ClusterName", {
      value: this.cluster.clusterName,
      description: "EKSクラスター名",
    });

    new cdk.CfnOutput(this, "KubeconfigCommand", {
      value: `aws eks update-kubeconfig --name ${this.cluster.clusterName} --region ${this.region}`,
      description: "kubectlでクラスターに接続するためのコマンド",
    });
  }
}
