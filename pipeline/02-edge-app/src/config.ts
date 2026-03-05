import dotenv from "dotenv";

dotenv.config();

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

export const config = {
  port: Number(process.env.PORT ?? 3000),
  couchbase: {
    connStr: required("CB_CONN_STR"),
    username: required("CB_USERNAME"),
    password: required("CB_PASSWORD"),
    bucket: required("CB_BUCKET"),
  },
};
