import { KubectlV35Layer } from "@aws-cdk/lambda-layer-kubectl-v35";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as eks from "aws-cdk-lib/aws-eks-v2";
import { Construct } from "constructs";

/**
 * EKSクラスターコンストラクトのプロパティ
 */
export interface EksClusterConstructProps {
  /** クラスター名 */
  readonly clusterName: string;
  /** クラスターを配置するVPC */
  readonly vpc: ec2.IVpc;
  /** ノードグループのインスタンスタイプ（例: "t3.large"） */
  readonly nodeInstanceType: string;
  /** ノードグループの最小台数 */
  readonly nodeMinSize: number;
  /** ノードグループの最大台数 */
  readonly nodeMaxSize: number;
  /** ノードグループの希望台数 */
  readonly nodeDesiredSize: number;
  /** ノードのディスクサイズ（GB） */
  readonly nodeDiskSize: number;
}

/**
 * EKSクラスターコンストラクト
 *
 * NOTE: EKSの構成要素を理解しよう
 * - コントロールプレーン: Kubernetes APIサーバー、etcd、スケジューラー等。AWSがフルマネージド。
 * - データプレーン: 実際にコンテナ（Pod）が動くワーカーノード（EC2インスタンス）。
 * - マネージドノードグループ: AWSがノードのプロビジョニングとライフサイクルを管理してくれる仕組み。
 *   インスタンスタイプやスケーリングは自分で設定する。
 */
export class EksClusterConstruct extends Construct {
  /** 後続スタックに渡すためのクラスター参照 */
  public readonly cluster: eks.Cluster;

  constructor(scope: Construct, id: string, props: EksClusterConstructProps) {
    super(scope, id);

    // ========================================
    // EKSクラスター（Kubernetesコントロールプレーン）
    // ========================================
    // NOTE: EKS v2 L2コンストラクト（aws-cdk-lib/aws-eks-v2）を使用。
    // 旧版（aws-cdk-lib/aws-eks）はカスタムリソース（Lambda）でクラスターを作成していたが、
    // v2ではCloudFormationネイティブの AWS::EKS::Cluster リソースで直接作成される。
    // これによりデプロイが安定し、CloudFormationのスタック管理と素直に連携する。
    this.cluster = new eks.Cluster(this, "Cluster", {
      clusterName: props.clusterName,
      version: eks.KubernetesVersion.V1_35,

      // NOTE: defaultCapacityType を NODEGROUP に設定。
      // EKS v2のデフォルトはAUTOMODE（EKSが自動でEC2を管理）だが、
      // 学習目的でノード構成を自分で制御するためにNODEGROUPを選択。
      defaultCapacityType: eks.DefaultCapacityType.NODEGROUP,

      // NOTE: defaultCapacity: 0 にして、デフォルトのノードグループ作成を抑制。
      // 後で addNodegroupCapacity() で明示的にノードグループを追加する。
      // こうすることでノードグループの設定を細かく制御できる。
      defaultCapacity: 0,

      vpc: props.vpc,
      // NOTE: コントロールプレーンのENI（Elastic Network Interface）を
      // プライベートサブネットに配置する。
      vpcSubnets: [{ subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS }],

      // NOTE: kubectlProviderOptions を指定すると、CDKがKubectl Handler（Lambda関数）を作成する。
      // このLambdaがcdk deploy時にkubectl/helmコマンドを実行して、
      // Helm ChartやK8sマニフェストをクラスターに適用する。
      // 指定しなければKubectl Handlerは作られない（EKS v2の設計）。
      // 後続のGitlabStack/MonitoringStackでaddHelmChart()を使うために必要。
      kubectlProviderOptions: {
        kubectlLayer: new KubectlV35Layer(this, "KubectlLayer"),
      },

      // NOTE: エンドポイントアクセスの設定。
      // PUBLIC_AND_PRIVATE: クラスターAPIにインターネットからもVPC内からもアクセス可能。
      // ローカルのkubectlからクラスターを操作するために PUBLIC を含める。
      // 本番環境ではPRIVATEのみにしてVPN/Direct Connect経由でアクセスするのが望ましい。
      endpointAccess: eks.EndpointAccess.PUBLIC_AND_PRIVATE,

      // NOTE: クラスターのログを有効化。CloudWatch Logsに送信される。
      // API: APIサーバーへのリクエストログ
      // AUTHENTICATOR: 認証リクエストのログ
      // SCHEDULER: Podのスケジューリング判断のログ
      clusterLogging: [
        eks.ClusterLoggingTypes.API,
        eks.ClusterLoggingTypes.AUTHENTICATOR,
        eks.ClusterLoggingTypes.SCHEDULER,
      ],
    });

    // ========================================
    // マネージドノードグループ（ワーカーノード）
    // ========================================
    // NOTE: マネージドノードグループとは？
    // EKSがEC2インスタンスのプロビジョニング・ヘルスチェック・ローリングアップデートを
    // 管理してくれる仕組み。自分でAuto Scaling Groupを管理する「セルフマネージドノード」
    // と比べて運用負荷が低い。
    //
    // COST: t3.large (2 vCPU, 8GB RAM) x 1台 = 約$0.104/h（東京リージョン）
    // EKSクラスター料金 $0.10/h と合わせて約$0.204/h（約30円/h）
    // 1時間の利用で数百円以内に収まる。
    this.cluster.addNodegroupCapacity("WorkerNodes", {
      instanceTypes: [new ec2.InstanceType(props.nodeInstanceType)],
      // NOTE: 学習用途のため1台構成。
      // 本番環境では複数AZに分散させて可用性を確保する:
      // minSize: 2,
      // maxSize: 6,
      // desiredSize: 3,
      minSize: props.nodeMinSize,
      maxSize: props.nodeMaxSize,
      desiredSize: props.nodeDesiredSize,
      diskSize: props.nodeDiskSize,

      // NOTE: ノードをプライベートサブネットに配置。
      // インターネットから直接アクセスできないようにする。
      subnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },

      // NOTE: AL2023（Amazon Linux 2023）ベースのEKS最適化AMIを使用。
      // AL2023はAL2の後継で、セキュリティとパフォーマンスが改善されている。
      amiType: eks.NodegroupAmiType.AL2023_X86_64_STANDARD,
    });
  }
}
