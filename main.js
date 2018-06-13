'use strict';

const express = require("express");
const bodyParser = require('body-parser');
const minimist = require('minimist');

const block = require("./block");
const tx = require("./transaction");
const config = require("./config");
const geth = require("./geth");

const initHttpServer = (http_port) => {
    const app = express();
    app.use(bodyParser.json());

    // Block related
    app.get('/blocks', (req, res) => {
        res.send(JSON.stringify(block.getBlocks().map(b => b.printBlock())));
    });
    app.post('/mineBlock', async (req, res) => {
        try {
            const newBlock = await block.generateNextBlock(geth);
            res.send(JSON.stringify(newBlock.printBlock()));
        } catch (e) {
            res.send(JSON.stringify(e));
        }
    });

    // Transaction related
    app.post('/transact', async (req, res) => {
        try {
            const rawTx = await tx.createTransaction(req.body, geth);
            console.log('New transaction created: ' + JSON.stringify(rawTx));
            res.send(JSON.stringify(rawTx.toString(true)));
        } catch (e) {
            res.send(JSON.stringify(e));
        }
    });

    // Deposit related
    app.post('/deposit', async (req, res) => {
        await geth.deposit(req.body.address, req.body.amount);
        res.send();
    });

    // Withdrawal related
    app.post('/withdraw/create', async (req, res) => {
        const p = block.getTransactionProofInBlock(req.body.blkNum,
            req.body.txIndex);
        const withdrawalId = await geth.startWithdrawal(req.body.blkNum,
            req.body.txIndex, req.body.oIndex, p.tx, p.proof, req.body.from);
        res.send(withdrawalId);
    });
    app.post('/withdraw/challenge', async (req, res) => {
        const p = block.getTransactionProofInBlock(req.body.blkNum,
            req.body.txIndex);
        await geth.challengeWithdrawal(req.body.withdrawalId, req.body.blkNum,
            req.body.txIndex, req.body.oIndex, p.tx, p.proof, req.body.from);
        res.send();
    });
    app.post('/withdraw/finalize', async (req, res) => {
        await geth.finalizeWithdrawal(req.body.from);
        res.send();
    });

    // Debug function
    app.get('/utxo', (req, res) => {
        res.send(tx.getUTXO());
    });
    app.get('/pool', (req, res) => {
        res.send(tx.getPool());
    });

    app.listen(http_port, () => console.log('Listening http on port: ' + http_port));
};

const main = () => {
    const argv = minimist(process.argv.slice(2), { string: ["port", "contract", "operator"]});
    const http_port = argv.port || 3001;
    const contract_address = argv.contract || config.plasmaContractAddress;
    const operator_address = argv.operator || config.plasmaOperatorAddress;

    geth.init(contract_address, operator_address);
    initHttpServer(http_port);
};

main();
