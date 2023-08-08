require('dotenv').config();

const listenPort = 5001;
const hostname = 'account.aimixer.io'
const privateKeyPath = `/etc/sslkeys/aimixer.io/aimixer.io.key`;
const fullchainPath = `/etc/sslkeys/aimixer.io/aimixer.io.pem`;

const express = require('express');
const https = require('https');
const cors = require('cors');
const fs = require('fs');
const mysql = require('mysql2');
const bcrypt = require("bcrypt");
const luxon = require('luxon');
const { v4: uuidv4 } = require('uuid');


const { MYSQL_HOST, MYSQL_USER, MYSQL_PASSWORD, MYSQL_DATABASE } = process.env;

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
}

const pool = mysql.createPool(mysqlOptions);

const query = q => {
  return new Promise((resolve, reject) => {
    pool.query(q, function(err, rows, fields) {
      console.error(err);
      if (err) return resolve(false);
      resolve(rows)
    });
  })
}

const app = express();
app.use(express.static('public'));
app.use(express.json({limit: '200mb'})); 
app.use(cors());

app.get('/', (req, res) => {
    res.send('Hello, World!');
});

const handleRegister = async (req, res) => {
  let { email, username, password, isCorporateAccount } = req.body;

  if (!email || !username || !password || typeof isCorporateAccount === 'undefined') return res.status(400).json('bad request');

  try {
    const loc = email.indexOf('@');
    const domain = email.substr(loc);
   
    email = mysql.escape(email);
    username = mysql.escape(username);
    password = await bcrypt.hash(password, 10);
    const date = luxon.DateTime.now().plus({days: 30}).toISODate();
    console.log('domain', domain);
    let q = `INSERT INTO accounts (id, email, username, password, domain, expiration) VALUES ('${uuidv4()}', ${email}, ${username}, '${password}', '${domain}', '${date}')`;
    
    let result = await query(q);
    if (result !== false) {
      if (isCorporateAccount) await query(`INSERT INTO corporate_domains (domain) VALUES ('${domain}')`);
      
    }
  
  } catch (err) {
    console.error(err);
    return res.status(500).json(err);
  }


  res.status(200).json('ok');
}
app.post('/register', (req, res) => handleRegister(req, res));

const httpsServer = https.createServer({
    key: fs.readFileSync(privateKeyPath),
    cert: fs.readFileSync(fullchainPath),
  }, app);
  

  httpsServer.listen(listenPort, '0.0.0.0', () => {
    console.log(`HTTPS Server running on port ${listenPort}`);
});


