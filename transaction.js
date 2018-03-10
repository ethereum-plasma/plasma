'use strict';

const createKeccakHash = require('keccak');
const RLP = require('rlp');

const geth = require("./geth");
const utils = require("./utils");

class Transaction {
    constructor(blkNum1, txIndex1, oIndex1, sig1,
        blkNum2, txIndex2, oIndex2, sig2,
        newOwner1, denom1, newOwner2, denom2, fee, type) {
        // first input
        this.blkNum1 = blkNum1;
        this.txIndex1 = txIndex1;
        this.oIndex1 = oIndex1;
        this.sig1 = sig1;

        // second input
        this.blkNum2 = blkNum2;
        this.txIndex2 = txIndex2;
        this.oIndex2 = oIndex2;
        this.sig2 = sig2;

        // outputs
        this.newOwner1 = newOwner1;
        this.denom1 = denom1;
        this.newOwner2 = newOwner2;
        this.denom2 = denom2;

        this.fee = fee;
        this.type = type;
    }

    encode(includingSig) {
        let data = [
            this.blkNum1, this.txIndex1, this.oIndex1,
            this.blkNum2, this.txIndex2, this.oIndex2,
            this.newOwner1, this.denom1, this.newOwner2, this.denom2, this.fee
        ];
        if (includingSig) {
            data.push(this.sig1);
            data.push(this.sig2);
        }
        return RLP.encode(data);
    }

    toString(includingSig) {
        return utils.bufferToHex(this.encode(includingSig), false);
    }

    setSignature(sig) {
        this.sig1 = sig;
        if (this.blkNum2 !== 0) {
            this.sig2 = sig;
        }
    }
}

class UTXO {
    constructor(blkNum, txIndex, oIndex, owner, denom) {
        this.blkNum = blkNum;
        this.txIndex = txIndex;
        this.oIndex = oIndex;
        this.owner = owner;
        this.denom = denom;
    }
}

const TxType = {
    NORMAL: 0,
    DEPOSIT: 1,
    WITHDRAW: 2,
    MERGE: 3
};

let txPool = [];
let utxo = [];

const createDepositTransactions = async (blockNumber, txs, deposits) => {
    for (let i = 0; i < deposits.length; i++) {
        let owner = deposits[i].from;
        let amount = parseInt(deposits[i].amount);
        let tx = new Transaction(0, 0, 0, 0, 0, 0, 0, 0,
            owner, amount, 0, 0, 0, TxType.DEPOSIT);
        await updateUTXO(blockNumber, tx, txs);
        await createMergeTransactions(blockNumber, txs, tx.newOwner1);
    }
};

const createWithdrawalTransactions = async (blockNumber, txs, withdrawals) => {
    for (let i = 0; i < withdrawals.length; i++) {
        let blkNum = parseInt(withdrawals[i].exitBlockNumber);
        let txIndex = parseInt(withdrawals[i].exitTxIndex);
        let oIndex = parseInt(withdrawals[i].exitOIndex);
        let tx = new Transaction(blkNum, txIndex, oIndex, 0, 0, 0, 0, 0,
            0, 0, 0, 0, 0, TxType.WITHDRAW);
        await updateUTXO(blockNumber, tx, txs);
    }
};

const createMergeTransactions = async (blockNumber, txs, owner) => {
    let indexes = getTwoUTXOsByAddress(owner);
    while (indexes[0] !== -1 && indexes[1] !== -1) {
        let utxoA = utxo[indexes[0]];
        let utxoB = utxo[indexes[1]];
        let tx = new Transaction(
            utxoA.blkNum, utxoA.txIndex, utxoA.oIndex, 0,
            utxoB.blkNum, utxoB.txIndex, utxoB.oIndex, 0,
            owner, utxoA.denom + utxoB.denom, 0, 0, 0, TxType.MERGE);
        await updateUTXO(blockNumber, tx, txs);
        indexes = getTwoUTXOsByAddress(owner);
    }
};

const createTransaction = async (data) => {
    let index = getUTXOByAddress(data.from);
    if (index === -1) {
        throw 'No asset found';
    }
    let blkNum1 = utxo[index].blkNum;
    let txIndex1 = utxo[index].txIndex;
    let oIndex1 = utxo[index].oIndex;

    let newOwner1 = data.to;
    let denom1 = utils.etherToWei(data.amount);
    let fee = utils.etherToWei(0.01);  // hard-coded fee to 0.01
    if (utxo[index].denom < denom1 + fee) {
        throw 'Insufficient funds';
    }
    let remain = utxo[index].denom - denom1 - fee;
    let newOwner2 = (remain > 0) ? data.from : 0;
    let denom2 = remain;

    let tx = new Transaction(
        blkNum1, txIndex1, oIndex1, 0, 0, 0, 0, 0,
        newOwner1, denom1, newOwner2, denom2, fee, TxType.NORMAL);
    let signature = await geth.signTransaction(tx.toString(false), data.from);
    tx.setSignature(signature);

    txPool.push(tx);
    return tx;
}

const getUTXOByAddress = (owner, start = 0) => {
    for (let i = start; i < utxo.length; i++) {
        if (utxo[i].owner === owner) {
            return i;
        }
    }
    return -1;
};

const getTwoUTXOsByAddress = (owner) => {
    let index1 = getUTXOByAddress(owner);
    let index2 = index1 !== -1 ? getUTXOByAddress(owner, index1 + 1) : -1;
    return [index1, index2];
};

const getUTXOByIndex = (blkNum, txIndex, oIndex) => {
    for (let i = 0; i < utxo.length; i++) {
        if (utxo[i].blkNum === blkNum &&
            utxo[i].txIndex === txIndex &&
            utxo[i].oIndex === oIndex) {
            return i;
        }
    }
    return -1;
};

const isValidTransaction = async (tx) => {
    if (tx.type !== TxType.NORMAL) {
        return true;
    }

    let denom = 0;
    if (tx.blkNum1 !== 0) {
        let message = tx.toString(false);
        let index = getUTXOByIndex(tx.blkNum1, tx.txIndex1, tx.oIndex1);
        if (index !== -1 &&
            await geth.isValidSignature(message, tx.sig1, utxo[index].owner)) {
            denom += utxo[index].denom;
        } else {
            return false;
        }
    }
    if (tx.blkNum2 !== 0) {
        let message = tx.toString(false);
        let index = getUTXOByIndex(tx.blkNum2, tx.txIndex2, tx.oIndex2);
        if (index !== -1 ||
            await geth.isValidSignature(message, tx.sig2, utxo[index].owner)) {
            denom += utxo[index].denom;
        } else {
            return false;
        }
    }
    return denom === tx.denom1 + tx.denom2 + tx.fee;
}

const updateUTXO = async (blockNumber, tx, collectedTxs) => {
    if (await isValidTransaction(tx)) {
        if (tx.blkNum1 !== 0) {
            let index = getUTXOByIndex(tx.blkNum1, tx.txIndex1, tx.oIndex1);
            utxo.splice(index, 1);
        }
        if (tx.blkNum2 !== 0) {
            let index = getUTXOByIndex(tx.blkNum2, tx.txIndex2, tx.oIndex2);
            utxo.splice(index, 1);
        }
        let txIndex = collectedTxs.length;
        if (tx.newOwner1 !== 0 && tx.denom1 !== 0) {
            utxo.push(new UTXO(blockNumber, txIndex, 0, tx.newOwner1, tx.denom1));
        }
        if (tx.newOwner2 !== 0 && tx.denom2 !== 0) {
            utxo.push(new UTXO(blockNumber, txIndex, 1, tx.newOwner2, tx.denom2));
        }
        collectedTxs.push(tx.toString(true));
    }
};

const collectTransactions = async (blockNumber, deposits, withdrawals) => {
    let utxoCopy = utxo.slice();
    let txs = [];

    if (deposits.length > 0) {
        console.log('Deposit transactions found.');
        console.log(deposits);
        await createDepositTransactions(blockNumber, txs, deposits);
    }

    if (withdrawals.length > 0) {
        console.log('Withdrawals detected.');
        console.log(withdrawals);
        await createWithdrawalTransactions(blockNumber, txs, withdrawals);
    }

    for (let i = 0; i < txPool.length; i++) {
        let tx = txPool[i];
        await updateUTXO(blockNumber, tx, txs);
        await createMergeTransactions(blockNumber, txs, tx.newOwner1);
        await createMergeTransactions(blockNumber, txs, tx.newOwner2);

        // Limit transactions per block to power of 2 on purpose for the
        // convenience of building Merkle tree.
        if (txs.length >= 256) {
            break;
        }
    }

    // Fill empty string if transactions are less than 256.
    let len = txs.length;
    for (let i = len; i < 256; i++) {
        txs.push("");
    }

    return txs;
};

const getUTXO = () => {
    return utxo;
};

const getPool = () => {
    return txPool;
};

module.exports = {createTransaction, collectTransactions, getUTXO, getPool};
