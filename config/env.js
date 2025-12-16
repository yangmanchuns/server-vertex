import dotenv from "dotenv";
dotenv.config();

export const env = {
  PORT: process.env.PORT || 10000,

  // Slack
  SLACK_SIGNING_SECRET: process.env.SLACK_SIGNING_SECRET,
  SLACK_BOT_TOKEN: process.env.SLACK_BOT_TOKEN,

  // MSSQL
  MSSQL_USER: process.env.MSSQL_USER,
  MSSQL_PASSWORD: process.env.MSSQL_PASSWORD,
  MSSQL_DATABASE: process.env.MSSQL_DATABASE,

  // GCP
  GOOGLE_CREDENTIALS_BASE64: process.env.GOOGLE_CREDENTIALS_BASE64,
  GCP_LOCATION: process.env.GCP_LOCATION || "us-central1",
};
