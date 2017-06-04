var path = require("path");

module.exports = {
  entry: "./src/index.ts",
  output: {
    path: path.join(__dirname, "dist"),
    filename: "gpml2pvjson.js"
  },
  resolve: {
    extensions: [
      ".webpack.js",
      ".web.js",
      ".ts",
      ".tsx",
      ".js",
      ".jsx",
      ".json"
    ]
  },
  module: {
    loaders: [
      { test: /(\.ts(x?))(|\.json)/, loaders: ["shebang-loader", "ts-loader"] }
    ]
  }
};
