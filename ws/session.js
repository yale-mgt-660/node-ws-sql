const EventEmitter = require('events');
const constants = require('./constants');
const commands = require('./commands');
const sqlCommand = require('./sqlCommand');
const debugWs = require('debug')('ws-sql:ws');

// parse incomming message in form: [cid]cmd
const reCmd = /^(?:\[([^\]]+)\])?\s*(\S+)/;

class Session extends EventEmitter {
  constructor(ws) {
    super();
    this._ws = null; // websocket
    this._sid = null; // persistent session, connections will not be lost
    this.pg = null; // database connection, driven externally
    this.currentCid = undefined;
    if (ws) this._attachWs(ws);
  }

  send(json) {
    if (arguments.length !== 1)
      throw new Error('session.send requires exactly one argument');
    if (json instanceof Error) {
      json = {
        T: constants.ERROR,
        cid: json.cid,
        message: json.message,
        severity: json.severity,
        code: json.code,
        detail: json.detail,
        hint: json.hint,
        position: json.position,
        internalPosition: json.internalPosition,
        internalQuery: json.internalQuery,
        where: json.where,
        schema: json.schema,
        table: json.table,
        column: json.column,
        dataType: json.dataType,
        constraint: json.constraint,
        file: json.file,
        line: json.line,
        routine: json.routine,
      };
    } else {
      if (!json.T) throw new Error('T (as type) is required');
    }
    const str = JSON.stringify(json);
    const type = json.T || '?';
    const cid = json.cid ? `[${json.cid}] ` : '';
    const sendResult = this._ws.send(str);
    if (str.length <= 220)
      debugWs(`${cid}>> ${type} ${str}`, sendResult);
    else
      debugWs(`${cid}>>>> ${type} Sent ${str.length} chars`, sendResult);
    return sendResult;
  }

  sendError(error) {
    err(error);
    if (typeof error === 'string') {
      this.send({
        T: constants.ERROR,
        message: error,
      });
    } else {
      this.send(error);
    }
  }

  close() {
    this.emit('close');
    this._ws.close();
    this._ws = null;
  };

  _attachWs(ws) {
    this._ws = ws;
    ws.on('message', async (event) => {
      const raw = event.data;
      debugWs('Received', raw);

      // accept only strings
      if (typeof raw !== 'string') {
        return this.error('Invalid input');
      }

      // return empty JSON on empty input
      if (!raw.length) {
        return this.send({});
      }
      let message = null;

      // accept JSON input
      if (raw.startsWith('{')) {
        try {
          message = JSON.parse(raw);
        } catch(error) {
          return this.error('Invalid JSON input');
        }
      } else {
        const [, cid, cmd] = reCmd.exec(raw);
        message = {
          cid,
          cmd,
          text: cid ? raw.slice(cid.length + 2) : raw, // strip initial '[clientId]'
        }
      }

      // send response with clientId
      const send = data => {
        if (data instanceof Error) {
          data.cid = message.cid;
          this.send(data);
        } else if (typeof data === 'string') {
          this.send({
            T: constants.TEXT,
            cid: message.cid,
            text: data,
          });
        } else {
          this.send({
            cid: message.cid,
            ...data,
          });
        }
      }

      try {
        this.currentCid = message.cid;
        const processed = await commands.execute(send, message, this);
        if (processed) {
          return;
        } else if (processed === false) {
          debugWs(`[${message.cid}] going to execute SQL`);
          await sqlCommand(send, message, this);
        }
      } catch (error) {
        send(error);
      }
      this.currentCid = undefined;
    });

    ws.on('close', (e) => {
      debugWs('WebSocket closed');
      this._detachWs(ws);
    });

    ws.on('error', (e) => {
      // This is debugWsrmational only, no need fo action…
      err('WebSocket error', e);
    });
  }

  _detachWs(ws) {
    if (this._ws === ws) {
      this._ws = null;
    }
  }

};

module.exports = Session;
