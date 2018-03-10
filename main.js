'use strict';

const express = require("express");
const bodyParser = require('body-parser');

const block = require("./block");
const tx = require("./transaction");
const geth = require("./geth");

const http_port = process.env.HTTP_PORT || 3001;

const initHttpServer = () => {
    const app = express();
    app.use(bodyParser.json());

    // Block related
    app.get('/blocks', (req, res) => {
        res.send(JSON.stringify(block.getBlocks().map(b => b.printBlock())));
    });
    app.post('/mineBlock', async (req, res) => {
        const newBlock = await block.generateNextBlock();
        res.send(newBlock.printBlock());
    });

    // Transaction related
    app.post('/transact', async (req, res) => {
        try {
            const rawTx = await tx.createTransaction(req.body);
            console.log('New transaction created: ' + JSON.stringify(rawTx));
            res.send(rawTx.toString(true));
        } catch (e) {
            res.send(e);
        }
    });

    // Deposit related
    app.post('/deposit', (req, res) => {
        geth.deposit(req.body.address, req.body.amount);
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

initHttpServer();
