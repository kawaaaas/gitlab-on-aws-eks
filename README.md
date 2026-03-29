# GitLab on AWS EKS — 学習用 IaC リポジトリ

EKS 上に GitLab を構築しながら、EKS・Kubernetes・GitLab の内部構造を学ぶためのプロジェクト。
全て AWS CDK (TypeScript) で管理し、`cdk destroy` で完全にクリーンアップできる。

## 学習テーマ

- EKS の基礎（クラスター管理、ノードグループ、IAM 連携、Helm 連携）
- GitLab のコンポーネント構成と技術的詳細
- Kubernetes 上でのアプリケーション運用（監視含む）

## 技術スタック

| カテゴリ         | 技術                                            |
| ---------------- | ----------------------------------------------- |
| IaC              | AWS CDK (TypeScript) — EKS v2 L2 コンストラクト |
| コンテナ基盤     | Amazon EKS (Kubernetes 1.35)                    |
| アプリケーション | GitLab (Helm Chart 8.11.2)                      |
| 監視             | Prometheus + Grafana (Helm Chart) — 未実装      |

## アーキテクチャ

```
┌─────────────────────────────────────────────────────┐
│ EKS Cluster (gitlab-learning)                       │
│                                                     │
│  ┌─────────────┐  ┌──────────────────────────────┐  │
│  │  namespace:  │  │  namespace: gitlab            │  │
│  │  monitoring  │  │                              │  │
│  │             │  │  Webservice (Puma)            │  │
│  │  Prometheus │  │  Sidekiq                     │  │
│  │  Grafana    │  │  Gitaly                      │  │
│  │  (未実装)    │  │  GitLab Shell                │  │
│  │             │  │  NGINX Ingress → NLB          │  │
│  └─────────────┘  │                              │  │
│                    │  PostgreSQL  Redis  MinIO     │  │
│                    │  (バンドル — Phase 2で外部化)   │  │
│                    └──────────────────────────────┘  │
│                                                     │
│  Worker Nodes: t3.xlarge × 1 (Private Subnet)       │
├─────────────────────────────────────────────────────┤
│ VPC (2 AZ, NAT Gateway × 1)                        │
└─────────────────────────────────────────────────────┘
```

## スタック構成

| スタック          | 責務                                            | 状態        |
| ----------------- | ----------------------------------------------- | ----------- |
| `EksClusterStack` | VPC, EKS クラスター, ノードグループ             | ✅ 実装済み |
| `GitlabStack`     | GitLab Helm Chart デプロイ（バンドル DB/Cache） | ✅ 実装済み |
| `MonitoringStack` | Prometheus + Grafana Helm Chart                 | 🔲 未実装   |

## ディレクトリ構成

```
.
├── bin/
│   └── gitlab-on-aws-eks.ts    # CDK アプリエントリポイント
├── lib/
│   ├── constructs/
│   │   ├── eks-cluster.ts      # EKS クラスター + ノードグループ
│   │   └── vpc.ts              # VPC (Public/Private Subnet)
│   ├── gitlab-on-aws-eks-stack.ts  # EksClusterStack
│   └── gitlab-stack.ts         # GitlabStack (Helm Chart デプロイ)
├── k8s/
│   └── values/
│       └── gitlab.yaml         # GitLab Helm Chart の values
└── test/
    └── gitlab-on-aws-eks.test.ts
```

## 実装フェーズ

### Phase 1: 最小構成（現在）

- EKS クラスター + GitLab Helm Chart
- バンドルの PostgreSQL / Redis / MinIO を使用（クラスター内で完結）
- Prometheus + Grafana による監視（未実装）

### Phase 2: 外部データストア移行

- PostgreSQL → AWS RDS
- Redis → Amazon ElastiCache
- 移行プロセス自体を学習目的として体験する

## 前提条件

- Node.js
- AWS CLI（`aws configure` 済み）
- AWS CDK CLI (`npm install -g aws-cdk`)

## デプロイ

```bash
# 依存インストール
npm install

# CloudFormation テンプレート生成（確認用）
npx cdk synth

# 差分確認
npx cdk diff

# デプロイ（全スタック）
npx cdk deploy --all

# kubeconfig 設定（デプロイ後の出力を参照）
aws eks update-kubeconfig --name gitlab-learning --region <your-region>
```

## クリーンアップ

```bash
# 全スタック削除
npx cdk destroy --all
```

> ⚠️ EBS ボリューム等の残留リソースが発生する場合がある。削除後に AWS コンソールで確認を推奨。

## 開発コマンド

```bash
npm run build       # TypeScript コンパイル
npm run test        # Jest テスト実行
npm run lint        # oxlint による静的解析
npm run lint:fix    # lint 自動修正
npm run fmt         # oxfmt によるフォーマット
npm run fmt:check   # フォーマットチェック
```

## コスト目安

| リソース        | 単価 (東京リージョン)    |
| --------------- | ------------------------ |
| EKS クラスター  | $0.10/h                  |
| t3.xlarge × 1   | $0.208/h                 |
| NAT Gateway × 1 | $0.062/h                 |
| 合計            | 約 $0.37/h（約 55 円/h） |

※ 使わないときは `cdk destroy` で削除すること。
