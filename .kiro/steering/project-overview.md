---
inclusion: always
---

# プロジェクト概要: EKS GitLab Learning

## 目的

EKS上にGitLabを構築することで以下を学習する:

- EKSの基礎（クラスター管理、ノードグループ、IAM連携、Helm連携）
- GitLabの技術的詳細とコンポーネント構成
- Kubernetes上でのアプリケーション運用（監視含む）

All IaCでポータビリティを高め、このリポジトリ自体を学習リソースとする。

## 技術スタック

- AWS CDK (TypeScript) — EKS v2 L2コンストラクトを使用
- EKS (Kubernetes)
- GitLab (Helm Chart, 最小構成)
- Prometheus + Grafana (Helm Chart, 監視)

## 設計原則

- 学習用途のため最小構成を優先する
- `cdk destroy` で全リソースを確実に削除できること
- コードには学習メモとしてコメントを豊富に入れる
- 各スタックは責務を明確に分離する

## 実装フェーズ

### Phase 1: 最小構成（現在）

- EKSクラスター + GitLab Helm Chart（バンドルのPostgreSQL/Redis/MinIO使用）
- Prometheus + Grafana による監視
- 全てクラスター内で完結、外部依存なし
- GitLab公式Helm Chart: `https://charts.gitlab.io/` の `gitlab/gitlab`

### Phase 2: 外部データストア移行（Phase 1完了後）

- バンドルのPostgreSQLをAWS RDS (PostgreSQL) に移行
- バンドルのRedisをAmazon ElastiCache (Redis) に移行
- 移行プロセス自体を学習目的として体験する
- CDKで外部リソースを追加し、GitLab Helm valuesを更新する

### 現在のフェーズ: Phase 1

Phase 2はPhase 1が完了し動作確認できた後に着手する。

## スタック構成

### Phase 1

1. EksClusterStack — VPC, EKSクラスター, ノードグループ
2. GitlabStack — GitLab Helm Chart デプロイ（バンドルDB/Cache使用）
3. MonitoringStack — Prometheus + Grafana Helm Chart デプロイ

### Phase 2（追加予定）

4. DataStoreStack — RDS (PostgreSQL), ElastiCache (Redis)
5. GitlabStack を更新 — 外部データストアを参照するようvalues変更

## ユーザースキル

- AWS CDK: 上級（コントリビュート経験あり）
- AWS全般: 上級（IAM, VPC等で詰まらない）
- Kubernetes: 概念・用語は理解、実運用経験は少ない
- GitLab: ユーザーとして使用、内部構造は学習中
- Git: 使用しているが仕組みの深い理解はこれから
