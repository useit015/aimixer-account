require('dotenv').config();

const {
  NODE_ENV,
  MYSQL_HOST,
  MYSQL_USER,
  JWT_PASSWORD,
  MYSQL_PASSWORD,
  MYSQL_DATABASE
} = process.env;

const isDev = NODE_ENV === 'dev';

const mysqlOptions = {
  host: MYSQL_HOST,
  user: MYSQL_USER,
  password: MYSQL_PASSWORD,
  database: MYSQL_DATABASE,
  waitForConnections: true,
  connectionLimit: 10,
  maxIdle: 10, // max idle connections, the default value is the same as `connectionLimit`
  idleTimeout: 60000, // idle connections timeout, in milliseconds, the default value 60000
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0
};

module.exports = {
  isDev,
  mysqlOptions,
  JWT_PASSWORD,
  listenPort: 5001,
  hostname: 'account.aimixer.io',
  privateKeyPath: isDev
    ? './ssl/localhost-key.pem'
    : '/etc/sslkeys/aimixer.io/aimixer.io.key',
  fullchainPath: isDev
    ? './ssl/localhost.pem'
    : '/etc/sslkeys/aimixer.io/aimixer.io.pem'
};
