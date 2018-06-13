'use strict';

const crypto = require('crypto');

const tx = require("./transaction");
const utils = require("./utils");

const Merkle = require("./merkle");

class Block {
    constructor(blockNumber, previousHash, transactions) {
        let data = [];
        transactions.forEach(tx => data.push(tx.toString(true)));

        this.blockHeader = new BlockHeader(blockNumber, previousHash, data);
        this.transactions = transactions;
    }

    get hash() {
        return crypto.createHash('sha256').update(this.toString()).digest('hex');
    }

    toString() {
        let txsHex = "";
        this.transactions.forEach(tx => txsHex += tx);
        return this.blockHeader.toString(true) + txsHex;
    }

    printBlock() {
        return {
            'blockNumber': this.blockHeader.blockNumber,
            'previousHash': this.blockHeader.previousHash,
            'merkleRoot': this.blockHeader.merkleRoot,
            'signature': this.blockHeader.sigR + this.blockHeader.sigS + this.blockHeader.sigV,
            'transactions': this.transactions.filter(tx => tx.length > 0)
        };
    }
}

class BlockHeader {
    constructor(blockNumber, previousHash, data) {
        this.blockNumber = blockNumber;  // 32 bytes
        this.previousHash = previousHash;  // 32 bytes
        if (blockNumber == 0) {
            this.merkle = null;
            this.merkleRoot = "";
        } else {
            this.merkle = new Merkle(data);
            this.merkle.makeTree();
            this.merkleRoot = utils.bufferToHex(this.merkle.getRoot(), false);  // 32 bytes
        }
        this.sigR = '';  // 32 bytes
        this.sigS = '';  // 32 bytes
        this.sigV = '';  // 1 byte
    }

    setSignature(signature) {
        let sig = utils.removeHexPrefix(signature);
        let sigR = sig.substring(0, 64);
        let sigS = sig.substring(64, 128);
        let sigV = parseInt(sig.substring(128, 130), 16);
        if (sigV < 27) {
            sigV += 27;
        }
        this.sigR = sigR;
        this.sigS = sigS;
        this.sigV = sigV.toString(16).padStart(2, "0");
    }

    toString(includingSig) {
        let blkNumHexString = this.blockNumber.toString(16).padStart(64, "0");
        let rawBlockHeader = blkNumHexString + this.previousHash + this.merkleRoot;
        if (includingSig) {
            rawBlockHeader += this.sigR + this.sigS + this.sigV;
        }
        return rawBlockHeader;
    }
}

const getGenesisBlock = () => {
    // Create a hard coded genesis block.
    return new Block(0, '46182d20ccd7006058f3e801a1ff3de78b740b557bba686ced70f8e3d8a009a6', []);
};

let blockchain = [getGenesisBlock()];

const generateNextBlock = async (geth) => {
    let previousBlock = getLatestBlock();
    let previousHash = previousBlock.hash;
    let nextIndex = previousBlock.blockHeader.blockNumber + 1;

    // Query contract past event for deposits / withdrawals and collect transactions.
    let deposits = await geth.getDeposits(nextIndex - 1);
    let withdrawals = await geth.getWithdrawals(nextIndex - 1);
    let transactions = await tx.collectTransactions(nextIndex, deposits, withdrawals);
    let newBlock = new Block(nextIndex, previousHash, transactions);

    // Operator signs the new block.
    let messageToSign = utils.addHexPrefix(newBlock.blockHeader.toString(false));
    let signature = await geth.signBlock(messageToSign);
    newBlock.blockHeader.setSignature(signature);

    // Submit the block header to plasma contract.
    let hexPrefixHeader = utils.addHexPrefix(newBlock.blockHeader.toString(true));
    await geth.submitBlockHeader(hexPrefixHeader);

    // Add the new block to blockchain.
    console.log('New block added.');
    console.log(newBlock.printBlock());
    blockchain.push(newBlock);

    return newBlock;
};

const getTransactionProofInBlock = (blockNumber, txIndex) => {
    let block = getBlock(blockNumber);
    let tx = utils.addHexPrefix(block.transactions[txIndex]);
    let proof = utils.bufferToHex(Buffer.concat(block.blockHeader.merkle.getProof(txIndex)), true);
    return {
        root: block.blockHeader.merkleRoot,
        tx: tx,
        proof: proof
    };
};

const getLatestBlock = () => blockchain[blockchain.length - 1];
const getBlocks = () => blockchain;
const getBlock = (index) => blockchain[index];

module.exports = {getLatestBlock, getBlocks, generateNextBlock,
    getTransactionProofInBlock};
