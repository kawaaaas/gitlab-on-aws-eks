import * as ec2 from "aws-cdk-lib/aws-ec2";
import { Construct } from "constructs";

/**
 * VPCコンストラクト
 *
 * NOTE: VPC（Virtual Private Cloud）はAWS上に作る仮想ネットワーク。
 * EKSクラスターのワーカーノード（Podが動くEC2）はこのVPC内に配置される。
 * コントロールプレーン（APIサーバー等）はAWSが管理する別の場所にあるが、
 * ENI（Elastic Network Interface）を通じてこのVPCと通信する。
 */

export interface VpcConstructProps {
  /** AZ（アベイラビリティゾーン）の数。AZはデータセンターの物理的な分離単位 */
  readonly maxAzs: number;
}

export class VpcConstruct extends Construct {
  /** 他のコンストラクトから参照できるようにpublicで公開 */
  public readonly vpc: ec2.Vpc;

  constructor(scope: Construct, id: string, props: VpcConstructProps) {
    super(scope, id);

    // NOTE: CDKのVpcコンストラクトは、パブリックサブネットとプライベートサブネットを
    // 各AZに自動で作成してくれる。
    // - パブリックサブネット: インターネットと直接通信可能（NAT Gatewayを配置）
    // - プライベートサブネット: 直接のインターネットアクセスなし（ノードはここに配置）
    //   NAT Gateway経由で外向き通信のみ可能（DockerイメージのPull等に必要）
    this.vpc = new ec2.Vpc(this, "Vpc", {
      maxAzs: props.maxAzs,

      // COST: NAT Gatewayは1台あたり約$0.062/h（東京リージョン）。
      // 学習用途なのでNAT Gatewayは1台に制限する。
      // 本番環境では各AZに1台ずつ配置して冗長性を確保する。
      natGateways: 1,
      // NOTE: 本番環境では各AZにNAT Gatewayを配置する:
      // natGateways: props.maxAzs,

      subnetConfiguration: [
        {
          // NOTE: パブリックサブネット。NAT GatewayとALB（ロードバランサー）を配置する。
          // EKSのワーカーノードはここには置かない。
          cidrMask: 24,
          name: "Public",
          subnetType: ec2.SubnetType.PUBLIC,
        },
        {
          // NOTE: プライベートサブネット。EKSのワーカーノードを配置する。
          // インターネットからの直接アクセスを遮断し、セキュリティを確保する。
          // 外向き通信はNAT Gateway経由で行う。
          cidrMask: 24,
          name: "Private",
          subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
        },
      ],
    });
  }
}
