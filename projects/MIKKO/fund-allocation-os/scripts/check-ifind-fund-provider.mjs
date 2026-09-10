import { IfindFundProvider } from "../packages/providers/ifind/src/fund-provider.mjs";

if (!IfindFundProvider.configured()) {
  console.error(JSON.stringify({
    status: "pending-credential",
    compatible: false,
    message: "缺少 IFIND_API_KEY",
  }, null, 2));
  process.exitCode = 2;
} else {
  const provider = await IfindFundProvider.connect({ timeoutMs: 45_000 });
  try {
    const health = await provider.health();
    console.log(JSON.stringify(health, null, 2));
    if (!health.compatible) process.exitCode = 1;
  } finally {
    await provider.close();
  }
}

