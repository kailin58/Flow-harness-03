const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const YAML = require("yaml");

test("openapi defines production-grade security and reliability responses", () => {
  const file = path.join(process.cwd(), "docs", "api", "openapi.yaml");
  const doc = YAML.parse(fs.readFileSync(file, "utf8"));

  assert.ok(doc.components, "components missing");
  assert.ok(doc.components.securitySchemes, "securitySchemes missing");
  assert.ok(doc.paths["/app/orders"].post.responses["429"], "429 missing");
  assert.ok(doc.paths["/app/orders"].post.responses["503"], "503 missing");
  assert.ok(doc.paths["/app/orders"].post.responses["504"], "504 missing");
});
