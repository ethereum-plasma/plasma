const http = require("http");
const spawn = require('child_process').spawn;

const PlasmaChainManager = artifacts.require("./PlasmaChainManager");

var runServer = (contract, operator) => {
  return new Promise(function(resolve, reject) {
    var server = spawn('node', ['main.js', '--contract', contract, '--operator', operator]);

    server.stdout.on('data', (data) => {
      resolve(server);
    });
  });
};

var request = (method, path, data) => {
  return new Promise(function(resolve, reject) {
    var options = {
      hostname: 'localhost',
      port: 3001,
      method: method,
      path: path,
    };

    var req = http.request(options, (res) => {
      var buf = '';
      res.on('data', (data) => {
        buf += data;
      });
      res.on('end', () => {
        if (buf) {
          resolve(JSON.parse(buf));
        } else {
          resolve(null);
        }
      });
    });

    if (data) {
      req.setHeader('Content-Type', 'application/json');
      req.write(data);
    }

    req.end();
  });
};

var sleep = (ms) => {
  return new Promise(function(resolve, reject) {
    setTimeout(resolve, ms);
  });
};

contract('PlasmaChainManager', function(accounts) {
  it("deposit", async () => {
    var plasmaChainManager = await PlasmaChainManager.new(100, 200);
    var contractAddress = plasmaChainManager.address;
    var operatorAddress = accounts[0];
    var server = await runServer(contractAddress, operatorAddress);

    try {
      await request('POST', '/deposit', JSON.stringify({address: accounts[0], amount: 0.2}));
      await request('POST', '/mineBlock');
      var utxo = await request('GET', '/utxo');
      assert.equal(utxo[0].denom, 200000000000000000);
    } catch(e) {
      throw e;
    } finally {
      server.kill();
    }
  });

  it("transact", async () => {
    var plasmaChainManager = await PlasmaChainManager.new(100, 200);
    var contractAddress = plasmaChainManager.address;
    var operatorAddress = accounts[0];
    var server = await runServer(contractAddress, operatorAddress);

    try {
      await request('POST', '/deposit', JSON.stringify({address: accounts[1], amount: 0.5}));
      await request('POST', '/mineBlock');
      await request('POST', '/transact', JSON.stringify({from: accounts[1], to: accounts[2], amount: 0.3}));
      await request('POST', '/mineBlock');
      var utxo = await request('GET', '/utxo');

      for (i = 0; i < utxo.length; i++) {
        if (utxo[i].owner === accounts[1]) {
          assert.equal(utxo[i].denom, 190000000000000000);
        } else if (utxo[i].owner === accounts[2]) {
          assert.equal(utxo[i].denom, 300000000000000000);
        }
      }
    } catch(e) {
      throw e;
    } finally {
      server.kill();
    }
  });

  it("withdraw", async () => {
    var plasmaChainManager = await PlasmaChainManager.new(0, 0);
    var contractAddress = plasmaChainManager.address;
    var operatorAddress = accounts[0];
    var server = await runServer(contractAddress, operatorAddress);

    try {
      await request('POST', '/deposit', JSON.stringify({address: accounts[1], amount: 0.5}));
      await request('POST', '/mineBlock');
      var utxo = await request('GET', '/utxo');
      assert.equal(utxo.length, 1);
      var withdrawId = await request('POST', '/withdraw/create', JSON.stringify({from: accounts[1], blkNum: utxo[0].blkNum, txIndex: utxo[0].txIndex, oIndex: utxo[0].oIndex}));
      await sleep(1000);
      await request('POST', '/withdraw/finalize', JSON.stringify({from: accounts[1]}));
      await request('POST', '/mineBlock');
      var utxo2 = await request('GET', '/utxo');
      assert.equal(utxo2.length, 0);
    } catch(e) {
      throw e;
    } finally {
      server.kill();
    }
  });
});
