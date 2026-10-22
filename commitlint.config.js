export default {
  extends: ["@commitlint/config-conventional"],
  rules: {
    "scope-enum": [
      1,
      "always",
      [
        "web",
        "studio",
        "contracts",
        "core",
        "content",
        "draft",
        "extensions",
        "multiplayer",
        "quest",
        "renderer",
        "ui",
        "testing",
        "tools",
        "assets",
        "docs",
        "repo",
      ],
    ],
    "subject-case": [0],
    "body-max-line-length": [0],
  },
};
