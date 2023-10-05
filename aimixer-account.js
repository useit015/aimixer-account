const {
  listenPort,
  mysqlOptions,
  JWT_PASSWORD,
  fullchainPath,
  privateKeyPath
} = require('./config');
const express = require('express');
const https = require('https');
const cors = require('cors');
const fs = require('fs');
const mysql = require('mysql2');
const bcrypt = require('bcrypt');
const luxon = require('luxon');
const { v4: uuidv4 } = require('uuid');
const jwt = require('jsonwebtoken');
const wp = require('./utils/wordpress');

const pool = mysql.createPool(mysqlOptions);

const query = q => {
  return new Promise((resolve, reject) => {
    pool.query(q, function (err, rows, fields) {
      console.error(err);
      if (err) return resolve(false);
      resolve(rows);
    });
  });
};

const app = express();
app.use(express.static('public'));
app.use(express.json({ limit: '200mb' }));
app.use(cors());

app.get('/', (req, res) => {
  res.send('Hello, World!');
});

const handleRegister = async (req, res) => {
  let { email, username, password, isCorporateAccount } = req.body;

  if (
    !email ||
    !username ||
    !password ||
    typeof isCorporateAccount === 'undefined'
  )
    return res.status(400).json('bad request');

  try {
    const loc = email.indexOf('@');
    const domain = email.substr(loc);

    accountId = uuidv4();
    email = mysql.escape(email);
    username = mysql.escape(username);
    password = await bcrypt.hash(password, 10);
    const date = luxon.DateTime.now().plus({ days: 90 }).toISODate();
    console.log('domain', domain);
    let q = `INSERT INTO accounts (id, email, username, password, domain, expiration) VALUES ('${accountId}', ${email}, ${username}, '${password}', '${domain}', '${date}')`;

    let result = await query(q);

    /*
     * If successful registration
     */
    if (result !== false) {
      if (isCorporateAccount)
        await query(
          `INSERT INTO corporate_domains (domain) VALUES ('${domain}')`
        );

      const token = jwt.sign(
        {
          accountId,
          email,
          username,
          domain
        },
        JWT_PASSWORD,
        { expiresIn: '14 days' }
      );

      return res
        .status(200)
        .json({ status: 'success', token, server: 'api.aimixer.io' });
    }

    /*
     * Find out why registration was unsuccessful and send report
     */

    q = `SELECT email FROM accounts WHERE email = ${email}`;
    result = await query(q);
    if (result.length)
      return res
        .status(200)
        .json({ status: 'error', msg: 'Email address already registered.' });

    q = `SELECT username FROM accounts WHERE username = ${username}`;
    result = await query(q);
    if (result.length)
      return res.status(200).json({
        status: 'error',
        msg: 'Username already exists. Please try another.'
      });
  } catch (err) {
    console.error(err);
    return res.status(500).json(err);
  }

  res.status(500).json('internal server error');
};

const pymntsAccess = async (username, password, res) => {
  const wpToken = await wp.getJWT('delta.pymnts.com', username, password);

  if (wpToken === false) return res.status(401).json('unauthorized');

  const token = jwt.sign(
    {
      accountId: 'PYMNTS',
      email: username,
      username: username,
      domain: '@pymnts.com'
    },
    JWT_PASSWORD,
    { expiresIn: '14 days' }
  );

  const authToken = jwt.sign(
    {
      username,
      password
    },
    JWT_PASSWORD,
    { expiresIn: '14 days' }
  );

  return res.status(200).json({
    status: 'success',
    token,
    server: 'api.aimixer.io',
    email: username,
    username,
    domain: '@pymnts.com',
    accountId: 'PYMNTS',
    authToken
  });
};

const isPymntsAccount = username => {
  const loc = username.indexOf('@');
  if (loc === -1) return false;
  const domain = username.substring(loc).toLowerCase();
  if (domain === '@pymnts.com') return true;
  return false;
};

const handleLogin = async (req, res) => {
  let { username, password } = req.body;

  if (!username || !password) return res.status(400).json('bad request');

  if (isPymntsAccount(username)) return pymntsAccess(username, password, res);

  username = mysql.escape(username);

  const q = `SELECT id, email, username, password, domain, expiration, server FROM accounts WHERE username=${username} OR email=${username}`;

  const result = await query(q);

  if (!result.length)
    return res
      .status(200)
      .json({ status: 'error', msg: 'Account does not exist.' });

  const expiration = result[0].expiration;
  const today = luxon.DateTime.now().toISODate();

  if (expiration < today)
    return res
      .status(200)
      .json({ status: 'expired', msg: 'Account has expired.' });

  let verified = await bcrypt.compare(password, result[0].password);

  if (!verified)
    return res
      .status(200)
      .json({ status: 'error', msg: 'Incorrect password.' });

  const { id, email, domain } = result[0];

  const token = jwt.sign(
    {
      accountId: id,
      email: email,
      username: username,
      domain: domain
    },
    JWT_PASSWORD,
    { expiresIn: '14 days' }
  );

  return res.status(200).json({
    status: 'success',
    token,
    server: 'api.aimixer.io',
    email,
    username,
    domain,
    accountId: id
  });
};

const handleWhoami = async (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '');

  if (!token) {
    return res.status(401).json('Invalid token');
  }

  try {
    const { username, password } = jwt.verify(token, JWT_PASSWORD);

    return pymntsAccess(username, password, res);
  } catch (error) {
    return res.status(401).json('Invalid token');
  }
};

app.post('/whoami', (req, res) => handleWhoami(req, res));
app.post('/register', (req, res) => handleRegister(req, res));
app.post('/login', (req, res) => handleLogin(req, res));

const httpsServer = https.createServer(
  {
    key: fs.readFileSync(privateKeyPath),
    cert: fs.readFileSync(fullchainPath)
  },
  app
);

httpsServer.listen(listenPort, '0.0.0.0', () => {
  console.log(`HTTPS Server running on port ${listenPort}`);
});
