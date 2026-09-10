# Friends Table

6–7 人微信朋友德州扑克 + Squid。私人链接入桌，服务器负责洗牌、下注合法性、边池、摊牌、发鱼和逐笔结算。

## Local Start

1. `pnpm install`
2. 复制 `.env.example` 为 `.env.local`
3. 填写 Supabase 环境变量
4. 在 Supabase SQL Editor 按编号运行 `supabase/migrations/` 内全部 SQL
5. `pnpm dev`

## Test

```bash
pnpm test
pnpm typecheck
pnpm lint
pnpm build
```

测试覆盖牌型、主池/多边池、奇数筹码、All-in、重复 Action、Squid 发放与结算，以及 7 个 Bot 的 500 手筹码守恒模拟。

## Production

推荐部署到腾讯云 CloudBase 云托管（也兼容 Vercel），并配置：

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
SUPABASE_SECRET_KEY
DATABASE_URL
```

详细说明见 [架构](docs/ARCHITECTURE.md)、[Supabase 设置](docs/SUPABASE_SETUP.md) 和 [腾讯云部署](docs/TENCENT_CLOUD_DEPLOY.md)。本项目只使用虚拟筹码和娱乐积分，不含充值、提现、兑换、抽水或真钱结算。
