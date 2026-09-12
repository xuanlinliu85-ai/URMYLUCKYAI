import assert from "node:assert/strict";
import test from "node:test";
import { assessIfindTransport } from "../scripts/ifind-transport-policy.mjs";

test("HTTPS iFinD transport is accepted", () => {
  const result = assessIfindTransport("https://ifind.example.test/sse");
  assert.equal(result.secure, true);
  assert.equal(result.warning, null);
});

test("legacy HTTP remains compatible with an explicit warning", () => {
  const previous = process.env.IFIND_REQUIRE_SECURE_TRANSPORT;
  delete process.env.IFIND_REQUIRE_SECURE_TRANSPORT;
  try {
    const result = assessIfindTransport("http://ifind.example.test/sse");
    assert.equal(result.secure, false);
    assert.match(result.warning, /legacy HTTP transport/);
  } finally {
    if (previous === undefined) delete process.env.IFIND_REQUIRE_SECURE_TRANSPORT;
    else process.env.IFIND_REQUIRE_SECURE_TRANSPORT = previous;
  }
});

test("strict iFinD transport rejects HTTP", () => {
  const previous = process.env.IFIND_REQUIRE_SECURE_TRANSPORT;
  process.env.IFIND_REQUIRE_SECURE_TRANSPORT = "1";
  try {
    assert.throws(() => assessIfindTransport("http://ifind.example.test/sse"), /requires HTTPS/);
  } finally {
    if (previous === undefined) delete process.env.IFIND_REQUIRE_SECURE_TRANSPORT;
    else process.env.IFIND_REQUIRE_SECURE_TRANSPORT = previous;
  }
});
