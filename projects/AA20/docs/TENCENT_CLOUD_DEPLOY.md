# 腾讯云部署

## 推荐的第一阶段

```text
微信浏览器
  → CloudBase 云托管（Next.js 页面 + Server API）
  → Supabase Singapore（PostgreSQL + Realtime + Presence）
```

项目已启用 Next.js `standalone` 输出并提供多阶段 `Dockerfile`，适合 CloudBase
容器型云托管。前端不直连数据库表，只使用 Realtime Broadcast/Presence；所有牌局
写入经过 CloudBase 上的 Next.js API。

### 部署

1. 腾讯云控制台创建 CloudBase 环境并开通云托管。
2. 进入云托管，新建服务 `friends-table`，选择容器型服务。
3. 选择本地代码、Git 仓库或使用 CloudBase CLI 部署当前目录。
4. 容器端口填写 `3000`，启用公网访问。
5. 在构建参数中提供两个公开变量，在运行环境变量中配置全部四个变量：

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
SUPABASE_SECRET_KEY
DATABASE_URL
```

6. 部署后访问 `/api/health`，应返回 `ok: true` 和
   `databaseConfigured: true`。

## 国内网络第二阶段

如果真机测试发现 Supabase Realtime 或 API 跨境不稳定，可在腾讯云 Linux 实例上
通过 Supabase 官方 Docker Compose 自托管。应用只需替换上述四个环境变量，无需修改
PokerEngine、SquidEngine 或页面。自托管需要自行负责系统更新、备份、监控和容灾，
不建议在产品验证前提前承担这部分运维。

若使用中国大陆地域和自定义域名，请按腾讯云要求完成 ICP 备案及适用的合规流程。
