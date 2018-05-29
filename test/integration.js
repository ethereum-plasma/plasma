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

contract('PlasmaChainManager', function(accounts) {
  it("deposit", async () => {
    var plasmaChainManager = await PlasmaChainManager.deployed();
    var contractAddress = plasmaChainManager.address;
    var operatorAddress = accounts[0];
    var server = await runServer(contractAddress, operatorAddress);

    try {
      await request('POST', '/deposit', JSON.stringify({address: accounts[0], amount: 0.02}));
      await request('POST', '/mineBlock');
      var utxo = await request('GET', '/utxo');
      assert.equal(utxo[0].denom, 20000000000000000);
    } catch(e) {
      throw e;
    } finally {
      server.kill();
    }
  });
});
