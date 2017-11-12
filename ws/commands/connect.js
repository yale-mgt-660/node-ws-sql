const pg = require('pg');

// test start of command, fastest filter
exports.startsWith = '\\c';

// test full regexp, slower filter, returns the longest match
// result will be forwarded to action
exports.test = /^\\c(?:onnect)?$/;

// group -- Group name in English, default to "Others"
exports.group = 'Connection';

// description -- single line
exports.description = 'Connect to database';

// markdown, verbose info
exports.help = '\c[onnect] <Connection String>';

// can do action, returning result -- next state
// if action return false, SQL command will be executed instead
exports.action = async (send, message, match, session, ws) => {
  if (session.pg) {
    send("Your previous connection will be disconnected");
    session.pg.end();
    session.pg = null;
  }
  const connStr = message.text.match(/^\s*\\c(?:onnect)?\s*(.*)$/)[1] || undefined;
  const client = new pg.Client(connStr);
  await client.connect();
  session.pg = client;
  send("Connected");
};
