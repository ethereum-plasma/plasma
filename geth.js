'use strict';

const Web3 = require("web3");

const utils = require("./utils");
const artifacts = require("./build/contracts/PlasmaChainManager.json");

const provider = new Web3.providers.HttpProvider('http://localhost:8545');
const web3 = new Web3(provider);

var plasmaContract, plasmaOperator;

const init = (contractAddress, operatorAddress) => {
    plasmaContract = new web3.eth.Contract(artifacts.abi, contractAddress, {gas: 1000000});
    plasmaOperator = operatorAddress;
}

const submitBlockHeader = async (header) => {
    let result = await plasmaContract.methods.submitBlockHeader(header).send({
        from: plasmaOperator, gas: 300000
    });
    let ev = result.events.HeaderSubmittedEvent.returnValues;
    console.log(ev);
};

const signBlock = async (message) => {
    return await web3.eth.sign(message, plasmaOperator);
};

const signTransaction = async (message, address) => {
    return await web3.eth.sign(message, address);
};

const isValidSignature = async (message, signature, address) => {
    const hash = await web3.eth.accounts.hashMessage(message);
    const signer = await web3.eth.accounts.recover(hash, signature);
    return utils.removeHexPrefix(address.toLowerCase()) == utils.removeHexPrefix(signer.toLowerCase());
};

const deposit = async (address, amount) => {
    amount = utils.etherToWei(amount);
    const result = await plasmaContract.methods.deposit().send({
        from: address, value: amount, gas: 300000
    });
    console.log(result);
};

const getDeposits = async (blockNumber) => {
    let depositEvents = await plasmaContract.getPastEvents('DepositEvent', {
        filter: {blockNumber: blockNumber.toString()},
        fromBlock: 0,
        toBlock: 'latest'
    });

    let deposits = [];
    depositEvents.forEach(ev => deposits.push(ev.returnValues));
    deposits.sort((d1, d2) => (d1.ctr - d2.ctr));
    return deposits;
}

const startWithdrawal = async (blkNum, txIndex, oIndex, targetTx, proof, from) => {
    let result = await plasmaContract.methods.startWithdrawal(blkNum, txIndex, oIndex, targetTx, proof).send({
        from: from, gas: 300000
    });
    let ev = result.events.WithdrawalStartedEvent.returnValues;
    console.log(ev);
    return ev.withdrawalId;
};

const challengeWithdrawal = async (withdrawalId, blkNum, txIndex, oIndex, targetTx, proof, from) => {
    let result = await plasmaContract.methods.challengeWithdrawal(withdrawalId, blkNum, txIndex, oIndex, targetTx, proof).send({
        from: from, gas: 300000
    });
    console.log(result);
};

const finalizeWithdrawal = async (from) => {
    let result = await plasmaContract.methods.finalizeWithdrawal().send({
        from: from, gas: 300000
    });
    if (result.events.WithdrawalCompleteEvent) {
        console.log(result.events.WithdrawalCompleteEvent.returnValues);
    }
};

const getWithdrawals = async (blockNumber) => {
    let withdrawalEvents = await plasmaContract.getPastEvents('WithdrawalCompleteEvent', {
        filter: {blockNumber: blockNumber.toString()},
        fromBlock: 0,
        toBlock: 'latest'
    });

    return withdrawalEvents.map(ev => ev.returnValues);
};

module.exports = {init, signBlock, signTransaction, submitBlockHeader, deposit,
    getDeposits, isValidSignature, startWithdrawal, challengeWithdrawal,
    finalizeWithdrawal, getWithdrawals};
